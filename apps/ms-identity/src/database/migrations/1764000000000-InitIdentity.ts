import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial identity schema. Written by hand (not generated) so the SQL is
 * readable and reviewable — this file is the source of truth for the tables,
 * the entities only map onto them.
 *
 * gen_random_uuid() is built into PostgreSQL 13+, no extension needed.
 */
export class InitIdentity1764000000000 implements MigrationInterface {
  name = 'InitIdentity1764000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE users (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email          varchar(254) NOT NULL,
        display_name   varchar(100) NOT NULL,
        password_hash  text NULL,
        role           varchar(16) NOT NULL CHECK (role IN ('ADMIN', 'STUDENT')),
        status         varchar(16) NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'DISABLED')),
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        last_login_at  timestamptz NULL,
        CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
        CONSTRAINT users_active_has_password CHECK (status <> 'ACTIVE' OR password_hash IS NOT NULL)
      )`);
    await q.query(`CREATE UNIQUE INDEX users_email_key ON users (email)`);

    await q.query(`
      CREATE TABLE sessions (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_hash           char(64) NOT NULL,
        previous_refresh_hash  char(64) NULL,
        rotated_at             timestamptz NULL,
        created_at             timestamptz NOT NULL DEFAULT now(),
        last_used_at           timestamptz NOT NULL DEFAULT now(),
        expires_at             timestamptz NOT NULL,
        revoked_at             timestamptz NULL,
        user_agent             varchar(255) NULL,
        ip                     varchar(64) NULL
      )`);
    await q.query(`CREATE INDEX sessions_user_id_idx ON sessions (user_id)`);

    await q.query(`
      CREATE TABLE user_tokens (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        varchar(16) NOT NULL CHECK (type IN ('INVITE', 'PASSWORD_RESET')),
        token_hash  char(64) NOT NULL,
        expires_at  timestamptz NOT NULL,
        used_at     timestamptz NULL,
        created_by  uuid NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX user_tokens_token_hash_key ON user_tokens (token_hash)`);
    await q.query(`CREATE INDEX user_tokens_user_id_idx ON user_tokens (user_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE user_tokens`);
    await q.query(`DROP TABLE sessions`);
    await q.query(`DROP TABLE users`);
  }
}
