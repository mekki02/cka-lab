import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';
import { join } from 'node:path';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : value;

/** ms-learning settings, validated at startup. See docs/CONFIGURATION.md. */
export class Env {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt() @Min(1) @Max(65535) @Transform(({ value }) => Number(value))
  PORT = 3002;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL = 'info';

  @IsString() DATABASE_HOST = 'localhost';
  @IsInt() @Transform(({ value }) => Number(value)) DATABASE_PORT = 5432;
  @IsString() DATABASE_USER = 'learning';
  @IsString() @IsOptional() DATABASE_PASSWORD?: string;
  @IsString() @IsOptional() DATABASE_PASSWORD_FILE?: string;
  @IsString() DATABASE_NAME = 'learning';
  @IsBoolean() @Transform(toBool) DATABASE_SSL = false;
  @IsBoolean() @Transform(toBool) DATABASE_MIGRATIONS_RUN = true;

  @IsInt() @Min(0) @Transform(({ value }) => Number(value)) TRUST_PROXY_HOPS = 1;
  @IsBoolean() @Transform(toBool) SWAGGER_ENABLED = false;

  /**
   * Where ms-identity publishes its public signing keys. Cluster-internal:
   * http://<identity service>:3001/.well-known/jwks.json
   */
  @IsUrl({ require_tld: false, require_protocol: true })
  JWKS_URL = 'http://localhost:3001/.well-known/jwks.json';

  /** Directory holding curriculum.yaml, courses/, labs/, quizzes/, exams/, cheatsheets/. */
  @IsString() CONTENT_DIR = join(process.cwd(), 'content');
}

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const details = errors.map(e => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (!env.DATABASE_PASSWORD && !env.DATABASE_PASSWORD_FILE) {
    throw new Error('DATABASE_PASSWORD or DATABASE_PASSWORD_FILE is required');
  }
  return env;
};
