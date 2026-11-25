/**
 * Lab environment contracts: the per-student cluster that ms-labs runs, the
 * browser terminal attached to it, and server-side checks.
 */

export const API_PREFIX_LABS = '/api/labs';
/** WebSocket endpoint of the browser terminal (same origin, cookie-authenticated). */
export const LABS_TERMINAL_PATH = '/api/labs/session/terminal';

/**
 * Provisioning  namespace, policies and the virtual cluster are being created
 * Starting      waiting for the virtual cluster API and the toolbox Pod
 * SettingUp     running the lab's setup commands
 * Ready         the terminal can connect
 * Failed        see `message`; end or restart the session
 */
export type LabSessionPhase = 'Provisioning' | 'Starting' | 'SettingUp' | 'Ready' | 'Failed';

export interface CheckResultDto {
  taskId: string;
  checkId: string;
  passed: boolean;
  /** First lines of what the check printed (stdout, then stderr). */
  output: string;
  checkedAt: string;
}

export interface LabSessionDto {
  id: string;
  /** null = playground (an empty cluster, no lab). */
  labId: string | null;
  phase: LabSessionPhase;
  message: string | null;
  createdAt: string;
  /** Hard limit: the session is deleted at this time whatever happens. */
  expiresAt: string;
  /** Idle sessions (no terminal input, no API call) are deleted at this time. */
  idleExpiresAt: string;
  /** Latest result per check, keyed `${taskId}/${checkId}`. */
  results: Record<string, CheckResultDto>;
  kubernetesVersion: string;
}

export interface StartLabSessionRequest {
  /** Omit for a playground. */
  labId?: string;
}

export interface LabsInfoDto {
  enabled: boolean;
  kubernetesVersion: string;
  idleMinutes: number;
  maxMinutes: number;
}

export interface VerifyResultDto {
  passed: boolean;
  exitCode: number;
  /** One entry per `PASS  …` / `FAIL  …` line the verify script printed. */
  lines: { passed: boolean; text: string }[];
  output: string;
  checkedAt: string;
}

/**
 * Terminal protocol. Browser → server messages are JSON text frames; server
 * → browser frames are raw terminal output (binary), except control
 * messages, which are JSON text frames.
 */
export type TerminalClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number };

export type TerminalServerMessage = { type: 'exit'; reason: string } | { type: 'error'; message: string };
