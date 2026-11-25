import type { DataSourceOptions } from 'typeorm';
import { readSecret } from '@cka/service-kit';
import type { Env } from '../config/env';
import { Bookmark, LessonProgress, LessonVisit } from '../progress/progress.entities';
import { ExamAttempt, ExerciseProgress, LabProgress, QuizAttempt } from '../assessments/assessment.entities';
import { InitLearning1764000000000 } from './migrations/1764000000000-InitLearning';
import { Assessments1764100000000 } from './migrations/1764100000000-Assessments';
import { Exercises1764200000000 } from './migrations/1764200000000-Exercises';

export const LEARNING_MIGRATION_LOCK = 72_002;

export const typeOrmOptions = (env: Env): DataSourceOptions => ({
  type: 'postgres',
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  username: env.DATABASE_USER,
  password: readSecret(env.DATABASE_PASSWORD, env.DATABASE_PASSWORD_FILE),
  database: env.DATABASE_NAME,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
  entities: [LessonProgress, LessonVisit, Bookmark, LabProgress, QuizAttempt, ExamAttempt, ExerciseProgress],
  migrations: [InitLearning1764000000000, Assessments1764100000000, Exercises1764200000000],
  synchronize: false,
  migrationsRun: false,
  extra: { max: 10, connectionTimeoutMillis: 5_000 },
});
