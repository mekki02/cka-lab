import type { DataSourceOptions } from 'typeorm';
import { readSecret } from '@cka/service-kit';
import type { Env } from '../config/env';
import { User } from '../users/user.entity';
import { Session } from '../auth/session.entity';
import { UserToken } from '../auth/user-token.entity';
import { InitIdentity1764000000000 } from '../database/migrations/1764000000000-InitIdentity';

/** Arbitrary but stable: identifies this service's migration lock in pg_locks. */
export const IDENTITY_MIGRATION_LOCK = 72_001;

export const entities = [User, Session, UserToken];
export const migrations = [InitIdentity1764000000000];

/**
 * Connection settings. `synchronize` is off on purpose: schema changes only
 * happen through reviewed migrations, never by TypeORM guessing from entities.
 */
export const typeOrmOptions = (env: Env): DataSourceOptions => ({
  type: 'postgres',
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  username: env.DATABASE_USER,
  password: readSecret(env.DATABASE_PASSWORD, env.DATABASE_PASSWORD_FILE),
  database: env.DATABASE_NAME,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
  entities,
  migrations,
  synchronize: false,
  migrationsRun: false,
  extra: { max: 10, connectionTimeoutMillis: 5_000 },
});
