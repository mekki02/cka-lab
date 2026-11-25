import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';
import { join } from 'node:path';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : value;
const toInt = ({ value }: { value: unknown }) => Number(value);

/** ms-labs settings, validated at startup. See docs/CONFIGURATION.md. */
export class Env {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt() @Min(1) @Max(65535) @Transform(toInt)
  PORT = 3003;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL = 'info';

  @IsInt() @Min(0) @Transform(toInt) TRUST_PROXY_HOPS = 1;
  @IsBoolean() @Transform(toBool) SWAGGER_ENABLED = false;

  @IsUrl({ require_tld: false, require_protocol: true })
  JWKS_URL = 'http://localhost:3001/.well-known/jwks.json';

  /**
   * Origin(s) the browser terminal may be opened from (comma-separated).
   * WebSockets are not covered by CORS or the CSRF header, so the Origin check
   * is what stops another site from opening a terminal with the user's cookie.
   */
  @IsString() PUBLIC_URL = 'http://localhost:5173';

  /** Lab content (labs/*.yaml). */
  @IsString() CONTENT_DIR = join(process.cwd(), 'content');

  // --- Lab cluster -----------------------------------------------------------
  /**
   * Empty = in-cluster ServiceAccount (production). Otherwise a kubeconfig
   * context name (development: e.g. kind-cka-platform).
   */
  @IsString() @IsOptional() LABS_KUBE_CONTEXT?: string;

  /**
   * "<namespace>:<serviceaccount>" of ms-labs itself. Every session namespace
   * gets a RoleBinding granting this identity rights inside it — and only
   * there. Empty in development (the kubeconfig user is already admin).
   */
  @IsString() @IsOptional() LABS_CONTROLLER_SERVICE_ACCOUNT?: string;

  @IsString() LABS_NAMESPACE_PREFIX = 'lab-';
  /** ClusterRole bound inside each session namespace (see the Helm chart). */
  @IsString() LABS_SESSION_CLUSTERROLE = 'cka-labs-session-owner';

  @IsString() LABS_TOOLBOX_IMAGE = 'cka-lab/toolbox:dev';
  @IsIn(['Always', 'IfNotPresent', 'Never']) LABS_TOOLBOX_PULL_POLICY = 'IfNotPresent';

  /** A chart reference for `helm upgrade --install`: a name (with _REPO) or a .tgz path. */
  @IsString() LABS_VCLUSTER_CHART = 'vcluster';
  @IsString() @IsOptional() LABS_VCLUSTER_CHART_REPO? = 'https://charts.loft.sh';
  @IsString() LABS_VCLUSTER_CHART_VERSION = '0.37.7';
  /** Shown to students; must match the chart's default distro version. */
  @IsString() LABS_KUBERNETES_VERSION = '1.36';
  @IsString() LABS_HELM_BIN = 'helm';

  @IsInt() @Min(1) @Transform(toInt) LABS_MAX_SESSIONS = 10;
  @IsInt() @Min(5) @Transform(toInt) LABS_IDLE_MINUTES = 60;
  @IsInt() @Min(10) @Transform(toInt) LABS_MAX_MINUTES = 240;
  /** Sessions stuck before Ready for this long are deleted. */
  @IsInt() @Min(2) @Transform(toInt) LABS_PROVISION_TIMEOUT_MINUTES = 10;

  /** Per-session ResourceQuota. */
  @IsString() LABS_QUOTA_REQUESTS_CPU = '2';
  @IsString() LABS_QUOTA_REQUESTS_MEMORY = '3Gi';
  @IsString() LABS_QUOTA_LIMITS_MEMORY = '6Gi';
  @IsInt() @Transform(toInt) LABS_QUOTA_PODS = 50;

  /**
   * Egress allowed from session Pods to the host API server (the vcluster
   * syncer needs it). Comma-separated CIDRs; empty = detected from the
   * `kubernetes` EndpointSlice in the default namespace at startup.
   */
  @IsString() @IsOptional() LABS_APISERVER_CIDRS?: string;
  @IsBoolean() @Transform(toBool) LABS_NETWORK_POLICIES = true;
}

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const details = errors.map(e => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return env;
};
