import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Labs, quizzes and mock exams. A second migration rather than an edit of the
 * first: once a migration has run anywhere, it is history — changes go in a
 * new file.
 */
export class Assessments1764100000000 implements MigrationInterface {
  name = 'Assessments1764100000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE lab_progress (
        user_id             uuid NOT NULL,
        lab_id              varchar(120) NOT NULL,
        status              varchar(16) NOT NULL CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
        completed_tasks     jsonb NOT NULL DEFAULT '[]',
        revealed_solutions  jsonb NOT NULL DEFAULT '[]',
        updated_at          timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lab_id)
      )`);

    await q.query(`
      CREATE TABLE quiz_attempts (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid NOT NULL,
        quiz_id       varchar(120) NOT NULL,
        score         int NOT NULL CHECK (score >= 0),
        max_score     int NOT NULL CHECK (max_score > 0),
        answers       jsonb NOT NULL,
        results       jsonb NOT NULL,
        submitted_at  timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX quiz_attempts_user_idx ON quiz_attempts (user_id, quiz_id, submitted_at DESC)`);

    await q.query(`
      CREATE TABLE exam_attempts (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid NOT NULL,
        exam_id       varchar(120) NOT NULL,
        started_at    timestamptz NOT NULL DEFAULT now(),
        deadline      timestamptz NOT NULL,
        submitted_at  timestamptz NULL,
        task_states   jsonb NOT NULL,
        score         int NULL,
        max_score     int NOT NULL
      )`);
    await q.query(`CREATE INDEX exam_attempts_user_idx ON exam_attempts (user_id, started_at DESC)`);
    // At most one unfinished attempt per user and exam, enforced by Postgres.
    await q.query(`CREATE UNIQUE INDEX exam_attempts_one_open ON exam_attempts (user_id, exam_id) WHERE submitted_at IS NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE exam_attempts`);
    await q.query(`DROP TABLE quiz_attempts`);
    await q.query(`DROP TABLE lab_progress`);
  }
}
