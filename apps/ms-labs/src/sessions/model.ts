import { createHash, randomBytes } from 'node:crypto';
import type { V1Namespace } from '@kubernetes/client-node';
import type { CheckResultDto, LabSessionDto, LabSessionPhase } from '@cka/contracts';

/**
 * A lab session *is* a namespace on the lab cluster. Its state lives in the
 * namespace's labels and annotations, so Kubernetes is the only source of
 * truth: no database to drift from reality, and deleting the namespace
 * deletes the session, its virtual cluster and everything the student built.
 */
export const LABEL_SESSION = 'cka-lab/session';
export const LABEL_USER = 'cka-lab/user';
export const ANN = {
  lab: 'cka-lab/lab',
  phase: 'cka-lab/phase',
  message: 'cka-lab/message',
  createdAt: 'cka-lab/created-at',
  expiresAt: 'cka-lab/expires-at',
  activeAt: 'cka-lab/last-active-at',
  results: 'cka-lab/results',
} as const;

export const PHASES: readonly LabSessionPhase[] = ['Provisioning', 'Starting', 'SettingUp', 'Ready', 'Failed'];

/** Release name of the vcluster inside the session namespace. */
export const VCLUSTER_RELEASE = 'vc';
/** The secret vcluster writes its kubeconfig to: `vc-<release>`. */
export const VCLUSTER_KUBECONFIG_SECRET = `vc-${VCLUSTER_RELEASE}`;
export const TOOLBOX_POD = 'toolbox';
export const SHELL_CONTAINER = 'shell';
export const CHECKER_CONTAINER = 'checker';

/**
 * `lab-<user hash>-<random>`. The user part keeps names short and keeps the
 * user id out of names (it is in a label, for lookups); the random part
 * lets a new session start while the previous namespace is still
 * terminating.
 */
export const sessionNamespaceName = (prefix: string, userId: string, random = randomBytes(3).toString('hex')): string =>
  `${prefix}${createHash('sha256').update(userId).digest('hex').slice(0, 10)}-${random}`;

/** Label values must be ≤ 63 chars of [A-Za-z0-9-_.]. A uuid qualifies; anything else is hashed. */
export const userLabelValue = (userId: string): string =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,61}[A-Za-z0-9]$/.test(userId) ? userId : createHash('sha256').update(userId).digest('hex').slice(0, 63);

const iso = (v: string | undefined, fallback: Date): string => {
  const d = v ? new Date(v) : fallback;
  return Number.isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString();
};

export const parseResults = (raw: string | undefined): Record<string, CheckResultDto> => {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, CheckResultDto>) : {};
  } catch {
    return {};
  }
};

export interface SessionTimes {
  idleMinutes: number;
}

export const namespaceToSession = (ns: V1Namespace, times: SessionTimes, kubernetesVersion: string): LabSessionDto => {
  const a = ns.metadata?.annotations ?? {};
  const created = ns.metadata?.creationTimestamp ? new Date(ns.metadata.creationTimestamp) : new Date();
  const phase = (PHASES as string[]).includes(a[ANN.phase] ?? '') ? (a[ANN.phase] as LabSessionPhase) : 'Provisioning';
  const activeAt = new Date(iso(a[ANN.activeAt], created));
  return {
    id: ns.metadata?.name ?? '',
    labId: a[ANN.lab] || null,
    phase,
    message: a[ANN.message] || null,
    createdAt: iso(a[ANN.createdAt], created),
    expiresAt: iso(a[ANN.expiresAt], created),
    idleExpiresAt: new Date(activeAt.getTime() + times.idleMinutes * 60_000).toISOString(),
    results: parseResults(a[ANN.results]),
    kubernetesVersion,
  };
};

export type SweepVerdict = 'keep' | 'expired' | 'idle' | 'stuck';

/** What the sweeper does with a session namespace. Pure, so it is unit-tested. */
export const sweepVerdict = (
  ns: V1Namespace,
  now: Date,
  opts: { idleMinutes: number; provisionTimeoutMinutes: number },
): SweepVerdict => {
  if (ns.status?.phase === 'Terminating' || ns.metadata?.deletionTimestamp) return 'keep';
  const a = ns.metadata?.annotations ?? {};
  const created = ns.metadata?.creationTimestamp ? new Date(ns.metadata.creationTimestamp) : now;
  const expires = new Date(iso(a[ANN.expiresAt], created));
  if (now >= expires) return 'expired';
  const active = new Date(iso(a[ANN.activeAt], created));
  if (now.getTime() - active.getTime() > opts.idleMinutes * 60_000) return 'idle';
  const phase = a[ANN.phase];
  if (phase !== 'Ready' && phase !== 'Failed' && now.getTime() - created.getTime() > opts.provisionTimeoutMinutes * 60_000) {
    return 'stuck';
  }
  return 'keep';
};

/** Annotations are limited to 256 KiB in total; keep messages short and printable. */
export const shortMessage = (s: string, max = 600): string => {
  // eslint-disable-next-line no-control-regex
  const clean = s.replace(/\x1b\[[0-9;]*m/g, '').replace(/[^\x09\x0a\x20-\x7e]/g, '').trim();
  return clean.length > max ? `…${clean.slice(-max)}` : clean;
};
