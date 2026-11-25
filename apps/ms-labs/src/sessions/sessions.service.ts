import {
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
import { loadLabs, type RunnableLab } from '../content/labs';
import { isNotFound, KubeService } from '../kube/kube.service';
import { namespaceManifest, sessionObjects, toolboxPod, vclusterValues, type ManifestOptions, type SessionSpec } from './manifests';
import {
  ANN,
  CHECKER_CONTAINER,
  LABEL_SESSION,
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
    this.logger.log(`Loaded ${this.labs.size} runnable labs`);
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

  async start(userId: string, labId: string | null): Promise<LabSessionDto> {
    if (labId) this.lab(labId);
    if (this.starting.has(userId)) throw new ConflictException('A lab environment is already starting');
    this.starting.add(userId);
    try {
      const existing = await this.findNamespace(userId);
      if (existing) {
        const a = existing.metadata?.annotations ?? {};
        // Same lab, still healthy: starting again is a no-op (double clicks, two tabs).
        if ((a[ANN.lab] || null) === labId && a[ANN.phase] !== 'Failed') return this.toDto(existing);
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
    await this.deleteNamespace(ns.metadata!.name!);
    return this.start(userId, labId);
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
