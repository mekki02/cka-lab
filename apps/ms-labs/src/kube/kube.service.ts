import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CoreV1Api,
  DiscoveryV1Api,
  Exec,
  KubeConfig,
  KubernetesObjectApi,
  PatchStrategy,
  setHeaderOptions,
  type KubernetesObject,
  type V1Status,
} from '@kubernetes/client-node';
import { spawn } from 'node:child_process';
import { Writable, type Readable } from 'node:stream';
import type WebSocket from 'ws';
import type { ExecResult } from '../checks/evaluate';
import { Env } from '../config/env';

export const FIELD_MANAGER = 'cka-lab-ms-labs';
const MAX_CAPTURE = 64 * 1024;

/** Keeps the *last* `max` bytes written: errors are usually at the end. */
class TailBuffer extends Writable {
  private chunks: Buffer[] = [];
  private size = 0;
  constructor(private readonly max = MAX_CAPTURE) {
    super();
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.max && this.chunks.length > 1) this.size -= this.chunks.shift()!.length;
    cb();
  }
  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

const exitCodeOf = (status: V1Status | undefined): number => {
  if (!status || status.status === 'Success') return 0;
  const cause = status.details?.causes?.find(c => c.reason === 'ExitCode');
  return cause?.message ? Number(cause.message) || 1 : 1;
};

export const isNotFound = (err: unknown): boolean => (err as { code?: number })?.code === 404;
export const isConflict = (err: unknown): boolean => (err as { code?: number })?.code === 409;

/**
 * The only place in the platform that holds Kubernetes credentials — and
 * only for the lab cluster. In-cluster it uses ms-labs' ServiceAccount;
 * in development a kubeconfig context.
 */
@Injectable()
export class KubeService implements OnModuleInit {
  private readonly logger = new Logger(KubeService.name);
  readonly kc = new KubeConfig();
  core!: CoreV1Api;
  objects!: KubernetesObjectApi;
  private exec!: Exec;

  constructor(private readonly env: Env) {}

  onModuleInit(): void {
    if (this.env.LABS_KUBE_CONTEXT) {
      this.kc.loadFromDefault();
      this.kc.setCurrentContext(this.env.LABS_KUBE_CONTEXT);
    } else {
      this.kc.loadFromCluster();
    }
    this.core = this.kc.makeApiClient(CoreV1Api);
    this.objects = KubernetesObjectApi.makeApiClient(this.kc);
    this.exec = new Exec(this.kc);
    this.logger.log(`Lab cluster: ${this.kc.getCurrentCluster()?.server ?? 'unknown'}`);
  }

  /** Server-side apply: idempotent create-or-update, so provisioning can be retried. */
  async apply<T extends KubernetesObject>(obj: T): Promise<T> {
    return this.objects.patch(obj, undefined, undefined, FIELD_MANAGER, true, PatchStrategy.ServerSideApply);
  }

  async createIfMissing(obj: KubernetesObject): Promise<void> {
    try {
      await this.objects.create(obj, undefined, undefined, FIELD_MANAGER);
    } catch (err) {
      if (!isConflict(err)) throw err;
    }
  }

  async mergePatchNamespace(name: string, patch: object): Promise<void> {
    await this.core.patchNamespace({ name, body: patch }, setHeaderOptions('Content-Type', PatchStrategy.MergePatch));
  }

  /** Host API server addresses, for the session egress NetworkPolicy. */
  async apiServerCidrs(): Promise<string[]> {
    const discovery = this.kc.makeApiClient(DiscoveryV1Api);
    const slices = await discovery.listNamespacedEndpointSlice({
      namespace: 'default',
      labelSelector: 'kubernetes.io/service-name=kubernetes',
    });
    const ips = slices.items.flatMap(s => (s.endpoints ?? []).flatMap(e => e.addresses));
    return [...new Set(ips)].map(ip => (ip.includes(':') ? `${ip}/128` : `${ip}/32`));
  }

  /**
   * Runs a script in a container, non-interactively. `timeout` (coreutils)
   * kills it inside the container too, not just our end of the stream.
   */
  async run(namespace: string, pod: string, container: string, script: string, timeoutSeconds: number): Promise<ExecResult> {
    const stdout = new TailBuffer();
    const stderr = new TailBuffer();
    let status: V1Status | undefined;
    let ws: WebSocket.WebSocket | undefined;
    const done = new Promise<void>((resolve, reject) => {
      this.exec
        .exec(
          namespace,
          pod,
          container,
          ['timeout', '-s', 'KILL', String(timeoutSeconds), 'bash', '-o', 'pipefail', '-c', script],
          stdout,
          stderr,
          null,
          false,
          s => {
            status = s;
          },
        )
        .then(socket => {
          ws = socket;
          socket.on('close', () => resolve());
          socket.on('error', reject);
        })
        .catch(reject);
    });
    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      done.then(() => false),
      new Promise<boolean>(r => (timer = setTimeout(() => r(true), (timeoutSeconds + 10) * 1000))),
    ]).finally(() => clearTimeout(timer));
    if (timedOut) ws?.close();
    const exitCode = timedOut ? 124 : exitCodeOf(status);
    return { exitCode, stdout: stdout.text(), stderr: stderr.text(), timedOut: timedOut || exitCode === 137 };
  }

  /** Interactive TTY exec for the browser terminal. */
  interactive(
    namespace: string,
    pod: string,
    container: string,
    command: string[],
    stdout: Writable,
    stdin: Readable,
    onStatus: (s: V1Status) => void,
  ): Promise<WebSocket.WebSocket> {
    // A fresh Exec per terminal: it keeps the terminal-size queue as instance state.
    return new Exec(this.kc).exec(namespace, pod, container, command, stdout, null, stdin, true, onStatus);
  }

  /** `helm upgrade --install` with values on stdin. */
  helm(args: string[], stdinData?: string, timeoutMs = 6 * 60_000): Promise<{ code: number; output: string }> {
    const ctx = this.env.LABS_KUBE_CONTEXT ? ['--kube-context', this.env.LABS_KUBE_CONTEXT] : [];
    return new Promise(resolve => {
      const child = spawn(this.env.LABS_HELM_BIN, [...args, ...ctx], {
        env: {
          ...process.env,
          HELM_CACHE_HOME: '/tmp/helm/cache',
          HELM_CONFIG_HOME: '/tmp/helm/config',
          HELM_DATA_HOME: '/tmp/helm/data',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const out = new TailBuffer(16 * 1024);
      child.stdout.pipe(out, { end: false });
      child.stderr.pipe(out, { end: false });
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.on('error', err => {
        clearTimeout(timer);
        resolve({ code: 127, output: err.message });
      });
      child.on('close', code => {
        clearTimeout(timer);
        resolve({ code: code ?? 1, output: out.text() });
      });
      child.stdin.end(stdinData ?? '');
    });
  }
}
