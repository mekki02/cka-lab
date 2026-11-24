import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : value;

/**
 * Every setting the service reads, validated once at startup.
 *
 * A typo'd or missing variable makes the process exit with a clear message
 * instead of failing on the first request — in Kubernetes that surfaces as
 * CrashLoopBackOff with the reason in `kubectl logs`.
 */
export class Env {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt() @Min(1) @Max(65535)
  @Transform(({ value }) => Number(value))
  PORT = 3001;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL = 'info';

  // --- Database ---------------------------------------------------------
  @IsString() DATABASE_HOST = 'localhost';
  @IsInt() @Transform(({ value }) => Number(value)) DATABASE_PORT = 5432;
  @IsString() DATABASE_USER = 'identity';
  @IsString() @IsOptional() DATABASE_PASSWORD?: string;
  /** Alternative to DATABASE_PASSWORD: a file path (Kubernetes Secret volume). */
  @IsString() @IsOptional() DATABASE_PASSWORD_FILE?: string;
  @IsString() DATABASE_NAME = 'identity';
  @IsBoolean() @Transform(toBool) DATABASE_SSL = false;
  /** Run pending migrations at startup (guarded by an advisory lock). */
  @IsBoolean() @Transform(toBool) DATABASE_MIGRATIONS_RUN = true;

  // --- HTTP / cookies ---------------------------------------------------
  /**
   * The URL people open in their browser, e.g. https://cka.example.com.
   * Used to build invitation and password-reset links. No trailing slash.
   */
  @IsUrl({ require_tld: false, require_protocol: true })
  PUBLIC_URL = 'http://localhost:8080';

  /** Mark cookies Secure (HTTPS only). Only disable for plain-HTTP local dev. */
  @IsBoolean() @Transform(toBool) COOKIE_SECURE = true;

  /**
   * How many reverse proxies sit in front of the service (Ingress controller,
   * edge nginx). Needed so rate limiting sees the client IP, not the proxy's.
   */
  @IsInt() @Min(0) @Transform(({ value }) => Number(value)) TRUST_PROXY_HOPS = 1;

  @IsBoolean() @Transform(toBool) SWAGGER_ENABLED = false;

  // --- Tokens -----------------------------------------------------------
  /** Ed25519 private key, PKCS#8 PEM. Required in production. */
  @IsString() @IsOptional() JWT_PRIVATE_KEY?: string;
  @IsString() @IsOptional() JWT_PRIVATE_KEY_FILE?: string;
  /** `kid` published in the JWKS. Change it when rotating keys. */
  @IsString() JWT_KEY_ID = 'dev';

  @IsInt() @Min(60) @Max(3600) @Transform(({ value }) => Number(value))
  ACCESS_TOKEN_TTL_SECONDS = 900;

  @IsInt() @Min(1) @Max(90) @Transform(({ value }) => Number(value))
  REFRESH_TOKEN_TTL_DAYS = 14;

  @IsInt() @Min(1) @Max(720) @Transform(({ value }) => Number(value))
  INVITE_TTL_HOURS = 72;

  @IsInt() @Min(1) @Max(72) @Transform(({ value }) => Number(value))
  RESET_TTL_HOURS = 2;

  // --- Rate limiting ----------------------------------------------------
  @IsInt() @Min(1) @Transform(({ value }) => Number(value)) AUTH_RATE_LIMIT_PER_MINUTE = 10;
}

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors.map(e => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (env.NODE_ENV === 'production' && !env.JWT_PRIVATE_KEY && !env.JWT_PRIVATE_KEY_FILE) {
    throw new Error('JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_FILE is required in production');
  }
  if (!env.DATABASE_PASSWORD && !env.DATABASE_PASSWORD_FILE) {
    throw new Error('DATABASE_PASSWORD or DATABASE_PASSWORD_FILE is required');
  }
  return env;
};
