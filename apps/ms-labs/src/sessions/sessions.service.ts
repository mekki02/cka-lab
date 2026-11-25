import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { V1Namespace, V1Pod } from '@kubernetes/client-node';
import type { CheckResultDto, LabSessionDto, LabSessionPhase } from '@cka/contracts';
import { Env } from '../config/env';
import { exerciseClusterScript, exerciseHomeScript, studentFile } from '../checks/exercise-grading';
import { loadExercises, type RunnableExercise } from '../content/exercises';
import { loadLabs, type RunnableLab } from '../content/labs';
import { isNotFound, KubeService } from '../kube/kube.service';
import { namespaceManifest, sessionObjects, toolboxPod, vclusterValues, type ManifestOptions, type SessionSpec } from './manifests';
import {
  ANN,
  CHECKER_CONTAINER,
  LABEL_SESSION,
  SHELL_CONTAINER,
  LABEL_USER,
  TOOLBOX_POD,
  VCLUSTER_KUBECONFIG_SECRET,
  VCLUSTER_RELEASE,
  namespaceToSession,
  parseResults,
  sessionNamespaceName,
  shortMessage,
  sweepVerdict,
  userLabelValue,
} from './model';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

class SessionGone extends Error {}

/**
 * Owns the lifecycle of lab sessions: create → provision → ready → expire.
 *
 * Provisioning runs in the background of the replica that received the
 * request. If that replica dies half-way, the session never reaches Ready
 * and the sweeper (which every replica runs; deleting is idempotent)
 * removes it after LABS_PROVISION_TIMEOUT_MINUTES.
 */
@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionsService.name);
  labs = new Map<string, RunnableLab>();
  exercises = new Map<string, RunnableExercise>();
  /**
   * Exercise loads per session namespace on this replica: one runs at a
   * time; a request made meanwhile replaces any pending one (latest wins).
   */
  private loads = new Map<string, { next?: RunnableExercise }>();
  private apiServerCidrs: string[] = [];
  private starting = new Set<string>();
  private lastTouch = new Map<string, number>();
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly env: Env,
    private readonly kube: KubeService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.labs = loadLabs(this.env.CONTENT_DIR);
    this.exercises = loadExercises(this.env.CONTENT_DIR);
    this.logger.log(`Loaded ${this.labs.size} runnable labs and ${this.exercises.size} exercises`);
    if (this.env.LABS_APISERVER_CIDRS) {
      this.apiServerCidrs = this.env.LABS_APISERVER_CIDRS.split(',').map(s => s.trim()).filter(Boolean);
    } else if (this.env.LABS_NETWORK_POLICIES) {
      try {
        this.apiServerCidrs = await this.kube.apiServerCidrs();
      } catch (err) {
        this.logger.warn(`Could not detect the API server address (${(err as Error).message}); set LABS_APISERVER_CIDRS`);
      }
    }
    this.logger.log(`API server egress for sessions: ${this.apiServerCidrs.join(', ') || 'none'}`);
    this.sweeper = setInterval(() => void this.sweep().catch(e => this.logger.error(`Sweep failed: ${e.message}`)), 60_000);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  private get manifestOptions(): ManifestOptions {
    const e = this.env;
    return {
      toolboxImage: e.LABS_TOOLBOX_IMAGE,
      toolboxPullPolicy: e.LABS_TOOLBOX_PULL_POLICY,
      controllerServiceAccount: e.LABS_CONTROLLER_SERVICE_ACCOUNT,
      sessionClusterRole: e.LABS_SESSION_CLUSTERROLE,
      quota: {
        requestsCpu: e.LABS_QUOTA_REQUESTS_CPU,
        requestsMemory: e.LABS_QUOTA_REQUESTS_MEMORY,
        limitsMemory: e.LABS_QUOTA_LIMITS_MEMORY,
        pods: e.LABS_QUOTA_PODS,
      },
      networkPolicies: e.LABS_NETWORK_POLICIES,
      apiServerCidrs: this.apiServerCidrs,
    };
  }

  toDto(ns: V1Namespace): LabSessionDto {
    return namespaceToSession(ns, { idleMinutes: this.env.LABS_IDLE_MINUTES }, this.env.LABS_KUBERNETES_VERSION);
  }

  lab(id: string): RunnableLab {
    const lab = this.labs.get(id);
    if (!lab) throw new NotFoundException(`Unknown lab "${id}"`);
    return lab;
  }

  /** Every namespace any exercise owns: loading one exercise clears the others. */
  private get allExerciseNamespaces(): string[] {
    return [...this.exercises.values()].flatMap(e => e.namespaces);
  }

  exercise(id: string): RunnableExercise {
    const e = this.exercises.get(id);
    if (!e) throw new NotFoundException(`Unknown exercise "${id}"`);
    return e;
  }

  // --- Queries -------------------------------------------------------------

  private async listSessions(labelSelector = `${LABEL_SESSION}=true`): Promise<V1Namespace[]> {
    const list = await this.kube.core.listNamespace({ labelSelector });
    return list.items.filter(ns => !ns.metadata?.deletionTimestamp && ns.status?.phase !== 'Terminating');
  }

  /** The user's live session namespace, newest first if (briefly) there are several. */
  async findNamespace(userId: string): Promise<V1Namespace | null> {
    const items = await this.listSessions(`${LABEL_SESSION}=true,${LABEL_USER}=${userLabelValue(userId)}`);
    items.sort((a, b) => (b.metadata?.creationTimestamp?.getTime() ?? 0) - (a.metadata?.creationTimestamp?.getTime() ?? 0));
    return items[0] ?? null;
  }

  async get(userId: string): Promise<LabSessionDto | null> {
    const ns = await this.findNamespace(userId);
    return ns ? this.toDto(ns) : null;
  }

  /** The session, which must be Ready. */
  async requireReady(userId: string): Promise<V1Namespace> {
    const ns = await this.findNamespace(userId);
    if (!ns) throw new NotFoundException('No lab environment is running');
    if (ns.metadata?.annotations?.[ANN.phase] !== 'Ready') throw new ConflictException('The lab environment is not ready yet');
    return ns;
  }

  // --- Commands ------------------------------------------------------------

  async start(userId: string, labId: string | null, exerciseId: string | null = null): Promise<LabSessionDto> {
    if (labId) this.lab(labId);
    if (exerciseId) {
      if (labId) throw new BadRequestException('Exercises run in the playground, not in a lab');
      this.exercise(exerciseId);
    }
    if (this.starting.has(userId)) throw new ConflictException('A lab environment is already starting');
    this.starting.add(userId);
    try {
      const existing = await this.findNamespace(userId);
      if (existing) {
        const a = existing.metadata?.annotations ?? {};
        // Same lab, still healthy: starting again is a no-op (double clicks, two
        // tabs). A playground keeps its cluster and only switches exercise.
        if ((a[ANN.lab] || null) === labId && a[ANN.phase] !== 'Failed') {
          if (exerciseId && a[ANN.exercise] !== exerciseId) return this.queueExercise(existing, exerciseId);
          return this.toDto(existing);
        }
        await this.deleteNamespace(existing.metadata!.name!);
      }

      const live = await this.listSessions();
      if (live.length >= this.env.LABS_MAX_SESSIONS) {
        throw new ServiceUnavailableException('All lab environments are in use. Try again in a few minutes.');
      }

      const now = new Date();
      const spec: SessionSpec = {
        namespace: sessionNamespaceName(this.env.LABS_NAMESPACE_PREFIX, userId),
        userId,
        labId,
        exerciseId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + this.env.LABS_MAX_MINUTES * 60_000),
      };
      const created = await this.kube.core.createNamespace({ body: namespaceManifest(spec) });
      this.logger.log(`Session ${spec.namespace} created (lab ${labId ?? 'playground'})`);
      void this.provision(spec);
      return this.toDto(created);
    } finally {
      this.starting.delete(userId);
    }
  }

  async end(userId: string): Promise<void> {
    const items = await this.listSessions(`${LABEL_SESSION}=true,${LABEL_USER}=${userLabelValue(userId)}`);
    await Promise.all(items.map(ns => this.deleteNamespace(ns.metadata!.name!)));
  }

  /** A fresh cluster for the same lab: the most reliable reset there is. */
  async restart(userId: string): Promise<LabSessionDto> {
    const ns = await this.findNamespace(userId);
    if (!ns) throw new NotFoundException('No lab environment is running');
    const labId = ns.metadata?.annotations?.[ANN.lab] || null;
    const exerciseId = ns.metadata?.annotations?.[ANN.exercise] || null;
    await this.deleteNamespace(ns.metadata!.name!);
    return this.start(userId, labId, exerciseId && this.exercises.has(exerciseId) ? exerciseId : null);
  }

  // --- Exercises -----------------------------------------------------------

  /**
   * Loads (or reloads: that is the reset) an exercise into the user's
   * playground. Seconds, not the minute a new cluster takes.
   */
  async loadExercise(userId: string, exerciseId: string): Promise<LabSessionDto> {
    this.exercise(exerciseId);
    const ns = await this.findNamespace(userId);
    if (!ns) return this.start(userId, null, exerciseId);
    if (ns.metadata?.annotations?.[ANN.lab]) {
      throw new ConflictException('Your environment is running a lab. End it, or start the exercise to replace it.');
    }
    return this.queueExercise(ns, exerciseId);
  }

  /** Marks the exercise as loading; it runs now if the cluster is ready, else when provisioning ends. */
  private async queueExercise(ns: V1Namespace, exerciseId: string): Promise<LabSessionDto> {
    const name = ns.metadata!.name!;
    const ready = ns.metadata?.annotations?.[ANN.phase] === 'Ready';
    const annotations = {
      [ANN.exercise]: exerciseId,
      [ANN.exerciseState]: 'Loading',
      [ANN.exerciseMessage]: ready ? 'Setting up the exercise' : 'Waiting for your cluster',
      [ANN.exerciseLoadedAt]: new Date().toISOString(),
    };
    await this.annotate(name, annotations);
    if (ready) this.scheduleLoad(name, this.exercise(exerciseId));
    void this.touch(name);
    const merged = { ...ns, metadata: { ...ns.metadata, annotations: { ...ns.metadata?.annotations, ...annotations } } };
    return this.toDto(merged);
  }

  private scheduleLoad(namespace: string, e: RunnableExercise): void {
    const running = this.loads.get(namespace);
    if (running) {
      running.next = e;
      return;
    }
    const state: { next?: RunnableExercise } = {};
    this.loads.set(namespace, state);
    void (async () => {
      try {
        for (let current: RunnableExercise | undefined = e; current; ) {
          await this.runExerciseLoad(namespace, current, state);
          current = state.next;
          state.next = undefined;
        }
      } finally {
        this.loads.delete(namespace);
      }
    })();
  }

  private async runExerciseLoad(namespace: string, e: RunnableExercise, state: { next?: RunnableExercise }): Promise<void> {
    const started = Date.now();
    // A newer request (or another exercise) supersedes this load: it must not report anything.
    const stillWanted = async () =>
      !state.next && (await this.kube.core.readNamespace({ name: namespace })).metadata?.annotations?.[ANN.exercise] === e.id;
    try {
      const cluster = await this.kube.run(namespace, TOOLBOX_POD, CHECKER_CONTAINER, exerciseClusterScript(e, this.allExerciseNamespaces), 280);
      if (cluster.exitCode !== 0) {
        throw new Error(`Exercise setup failed (exit ${cluster.exitCode}): ${shortMessage(`${cluster.stdout}\n${cluster.stderr}`, 400)}`);
      }
      const home = await this.kube.run(namespace, TOOLBOX_POD, SHELL_CONTAINER, exerciseHomeScript(e), 30);
      if (home.exitCode !== 0) throw new Error(`Could not write the starter files: ${shortMessage(home.stderr, 200)}`);
      const lines = await this.kube.run(namespace, TOOLBOX_POD, CHECKER_CONTAINER, `wc -l < ${studentFile('.bash_history')} 2>/dev/null || echo 0`, 15);
      const historyOffset = String(Number.parseInt(lines.stdout.trim(), 10) || 0);
      if (!(await stillWanted())) return;
      await this.annotate(namespace, {
        [ANN.exerciseState]: 'Ready',
        [ANN.exerciseMessage]: null,
        [ANN.exerciseHistoryOffset]: historyOffset,
      });
      this.logger.log(`Exercise ${e.id} loaded into ${namespace} in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (err) {
      if (isNotFound(err)) return;
      const message = shortMessage((err as Error).message || 'Loading the exercise failed');
      if (!(await stillWanted().catch(() => false))) return;
      this.logger.warn(`Exercise ${e.id} in ${namespace} failed: ${message}`);
      await this.annotate(namespace, { [ANN.exerciseState]: 'Failed', [ANN.exerciseMessage]: message }).catch(() => undefined);
    }
  }

  private async deleteNamespace(name: string): Promise<void> {
    try {
      await this.kube.core.deleteNamespace({ name, propagationPolicy: 'Background' });
      this.lastTouch.delete(name);
      this.logger.log(`Session ${name} deleted`);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  /** Records activity (terminal input, checks); throttled to one write a minute. */
  async touch(namespace: string): Promise<void> {
    const now = Date.now();
    if (now - (this.lastTouch.get(namespace) ?? 0) < 60_000) return;
    this.lastTouch.set(namespace, now);
    await this.annotate(namespace, { [ANN.activeAt]: new Date(now).toISOString() }).catch(() => undefined);
  }

  async saveResults(namespace: string, results: CheckResultDto[]): Promise<Record<string, CheckResultDto>> {
    const ns = await this.kube.core.readNamespace({ name: namespace });
    const merged = parseResults(ns.metadata?.annotations?.[ANN.results]);
    for (const r of results) merged[`${r.taskId}/${r.checkId}`] = r;
    await this.annotate(namespace, { [ANN.results]: JSON.stringify(merged) });
    return merged;
  }

  private async annotate(namespace: string, annotations: Record<string, string | null>): Promise<void> {
    await this.kube.mergePatchNamespace(namespace, { metadata: { annotations } });
  }

  private async setPhase(namespace: string, phase: LabSessionPhase, message: string | null): Promise<void> {
    try {
      await this.annotate(namespace, { [ANN.phase]: phase, [ANN.message]: message });
    } catch (err) {
      if (isNotFound(err)) throw new SessionGone();
      throw err;
    }
  }

  // --- Provisioning --------------------------------------------------------

  private async provision(spec: SessionSpec): Promise<void> {
    const ns = spec.namespace;
    const started = Date.now();
    try {
      for (const obj of sessionObjects(spec, this.manifestOptions)) {
        // The RoleBinding is created, not applied: ms-labs holds `create` on
        // RoleBindings, never `patch` (it cannot rewrite existing bindings).
        if (obj.kind === 'RoleBinding') await this.kube.createIfMissing(obj);
        else await this.kube.apply(obj);
      }

      const repo = this.env.LABS_VCLUSTER_CHART_REPO;
      const helm = await this.kube.helm(
        [
          'upgrade', '--install', VCLUSTER_RELEASE, this.env.LABS_VCLUSTER_CHART,
          ...(repo && !this.env.LABS_VCLUSTER_CHART.endsWith('.tgz') ? ['--repo', repo] : []),
          '--version', this.env.LABS_VCLUSTER_CHART_VERSION,
          '--namespace', ns,
          '--values', '-',
          '--wait', '--timeout', '5m',
        ],
        JSON.stringify(vclusterValues(ns)),
      );
      if (helm.code !== 0) throw new Error(`The virtual cluster did not start: ${shortMessage(helm.output, 400)}`);

      await this.setPhase(ns, 'Starting', 'Starting your terminal');
      await this.waitFor('the cluster credentials', 120, async () => {
        await this.kube.core.readNamespacedSecret({ name: VCLUSTER_KUBECONFIG_SECRET, namespace: ns });
        return true;
      });
      await this.kube.apply(toolboxPod(spec, this.manifestOptions));
      await this.waitFor('the terminal', 180, async () => {
        const pod: V1Pod = await this.kube.core.readNamespacedPod({ name: TOOLBOX_POD, namespace: ns });
        return pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') ?? false;
      });
      await this.waitFor('the Kubernetes API', 120, async () => {
        const r = await this.kube.run(ns, TOOLBOX_POD, CHECKER_CONTAINER, 'kubectl get --raw=/readyz && kubectl get serviceaccount default -n default', 15);
        return r.exitCode === 0;
      });

      const lab = spec.labId ? this.labs.get(spec.labId) : undefined;
      if (lab?.setup.commands.trim()) {
        await this.setPhase(ns, 'SettingUp', `Setting up "${lab.title}"`);
        const r = await this.kube.run(ns, TOOLBOX_POD, CHECKER_CONTAINER, `set -e\n${lab.setup.commands}`, 300);
        if (r.exitCode !== 0) {
          throw new Error(`Lab setup failed (exit ${r.exitCode}): ${shortMessage(`${r.stdout}\n${r.stderr}`, 400)}`);
        }
      }

      await this.annotate(ns, { [ANN.phase]: 'Ready', [ANN.message]: null, [ANN.activeAt]: new Date().toISOString() });
      this.logger.log(`Session ${ns} ready in ${Math.round((Date.now() - started) / 1000)}s`);

      // An exercise requested while the cluster was starting.
      const now = await this.kube.core.readNamespace({ name: ns });
      const pending = now.metadata?.annotations?.[ANN.exercise];
      if (pending && now.metadata?.annotations?.[ANN.exerciseState] === 'Loading' && this.exercises.has(pending)) {
        await this.annotate(ns, { [ANN.exerciseMessage]: 'Setting up the exercise', [ANN.exerciseLoadedAt]: new Date().toISOString() });
        this.scheduleLoad(ns, this.exercise(pending));
      }
    } catch (err) {
      if (err instanceof SessionGone || isNotFound(err)) {
        this.logger.log(`Session ${ns} was deleted while provisioning`);
        return;
      }
      const message = shortMessage((err as Error).message || 'Provisioning failed');
      this.logger.error(`Session ${ns} failed: ${message}`);
      await this.setPhase(ns, 'Failed', message).catch(() => undefined);
    }
  }

  private async waitFor(what: string, seconds: number, probe: () => Promise<boolean>): Promise<void> {
    const deadline = Date.now() + seconds * 1000;
    let last = '';
    while (Date.now() < deadline) {
      try {
        if (await probe()) return;
      } catch (err) {
        if (isNotFound(err) && what === 'the namespace') throw new SessionGone();
        last = (err as Error).message;
      }
      await sleep(2000);
    }
    throw new Error(`Timed out waiting for ${what}${last ? ` (${shortMessage(last, 200)})` : ''}`);
  }

  // --- Sweeper -------------------------------------------------------------

  async sweep(now = new Date()): Promise<void> {
    const sessions = await this.listSessions();
    const newestPerUser = new Map<string, V1Namespace>();
    for (const ns of sessions) {
      const verdict = sweepVerdict(ns, now, {
        idleMinutes: this.env.LABS_IDLE_MINUTES,
        provisionTimeoutMinutes: this.env.LABS_PROVISION_TIMEOUT_MINUTES,
      });
      if (verdict !== 'keep') {
        this.logger.log(`Sweeping ${ns.metadata?.name} (${verdict})`);
        await this.deleteNamespace(ns.metadata!.name!);
        continue;
      }
      // One session per user: a race between two replicas could create two.
      const user = ns.metadata?.labels?.[LABEL_USER] ?? '';
      const other = newestPerUser.get(user);
      const t = (n: V1Namespace) => n.metadata?.creationTimestamp?.getTime() ?? 0;
      if (other) await this.deleteNamespace((t(other) < t(ns) ? other : ns).metadata!.name!);
      if (!other || t(other) < t(ns)) newestPerUser.set(user, ns);
    }
  }
}
