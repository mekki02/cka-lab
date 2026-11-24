import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Reading progress: per-lesson status, last visits, bookmarks. */
export class InitLearning1764000000000 implements MigrationInterface {
  name = 'InitLearning1764000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE lesson_progress (
        user_id       uuid NOT NULL,
        lesson_id     varchar(120) NOT NULL,
        status        varchar(16) NOT NULL CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
        started_at    timestamptz NOT NULL DEFAULT now(),
        completed_at  timestamptz NULL,
        updated_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lesson_id)
      )`);

    await q.query(`
      CREATE TABLE lesson_visits (
        user_id     uuid NOT NULL,
        lesson_id   varchar(120) NOT NULL,
        visited_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lesson_id)
      )`);
    // "Recently accessed" = newest visits of one user.
    await q.query(`CREATE INDEX lesson_visits_recent_idx ON lesson_visits (user_id, visited_at DESC)`);

    await q.query(`
      CREATE TABLE bookmarks (
        user_id     uuid NOT NULL,
        lesson_id   varchar(120) NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lesson_id)
      )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE bookmarks`);
    await q.query(`DROP TABLE lesson_visits`);
    await q.query(`DROP TABLE lesson_progress`);
  }
}
