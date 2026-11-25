import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Progress through auto-graded exercises (content/exercises). */
export class Exercises1764200000000 implements MigrationInterface {
  name = 'Exercises1764200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE exercise_progress (
        user_id            uuid NOT NULL,
        exercise_id        varchar(120) NOT NULL,
        status             varchar(16) NOT NULL CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
        attempts           int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        solution_revealed  boolean NOT NULL DEFAULT false,
        completed_at       timestamptz NULL,
        updated_at         timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, exercise_id)
      )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE exercise_progress`);
  }
}
