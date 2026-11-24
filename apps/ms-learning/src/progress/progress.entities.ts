import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { ProgressStatus } from '@cka/contracts';

/**
 * User data in this service references users by id only. There is no foreign
 * key to ms-identity's users table — it lives in another database, owned by
 * another service. That is the price (and the point) of database-per-service:
 * consistency across services is the application's job, not Postgres's.
 */

@Entity({ name: 'lesson_progress' })
export class LessonProgress {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string;
  @PrimaryColumn({ name: 'lesson_id', type: 'varchar', length: 120 }) lessonId: string;
  @Column({ type: 'varchar', length: 16 }) status: ProgressStatus;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt: Date;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity({ name: 'lesson_visits' })
export class LessonVisit {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string;
  @PrimaryColumn({ name: 'lesson_id', type: 'varchar', length: 120 }) lessonId: string;
  @Column({ name: 'visited_at', type: 'timestamptz' }) visitedAt: Date;
}

@Entity({ name: 'bookmarks' })
export class Bookmark {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string;
  @PrimaryColumn({ name: 'lesson_id', type: 'varchar', length: 120 }) lessonId: string;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
