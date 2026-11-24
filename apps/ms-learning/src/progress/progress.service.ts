import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { ProgressStatus, ProgressSummaryDto } from '@cka/contracts';
import { ContentService } from '../content/content.service';
import { Bookmark, LessonProgress, LessonVisit } from './progress.entities';

const RECENT_LIMIT = 8;

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(LessonProgress) private readonly progress: Repository<LessonProgress>,
    @InjectRepository(LessonVisit) private readonly visits: Repository<LessonVisit>,
    @InjectRepository(Bookmark) private readonly bookmarks: Repository<Bookmark>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly content: ContentService,
  ) {}

  /** Only published lessons accept progress; ids come from the URL, so check them. */
  private publishedLesson(lessonId: string): void {
    if (this.content.lesson(lessonId).status !== 'published') {
      throw new BadRequestException('This lesson is not published yet');
    }
  }

  async summary(userId: string): Promise<ProgressSummaryDto> {
    const [lessons, bookmarks, recent] = await Promise.all([
      this.progress.find({ where: { userId } }),
      this.bookmarks.find({ where: { userId }, order: { createdAt: 'DESC' } }),
      this.recent(userId),
    ]);
    return {
      lessons: lessons.map(p => ({
        lessonId: p.lessonId,
        status: p.status,
        updatedAt: p.updatedAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
      })),
      bookmarks: bookmarks.map(b => b.lessonId),
      recent,
    };
  }

  async recent(userId: string): Promise<{ lessonId: string; visitedAt: string }[]> {
    const rows = await this.visits.find({ where: { userId }, order: { visitedAt: 'DESC' }, take: RECENT_LIMIT });
    return rows.map(v => ({ lessonId: v.lessonId, visitedAt: v.visitedAt.toISOString() }));
  }

  async setStatus(userId: string, lessonId: string, status: ProgressStatus): Promise<void> {
    this.publishedLesson(lessonId);
    // One statement, so two tabs clicking "complete" at once cannot race.
    await this.db.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, status, completed_at, updated_at)
       VALUES ($1, $2, $3::varchar, CASE WHEN $3::varchar = 'COMPLETED' THEN now() END, now())
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         status = EXCLUDED.status,
         completed_at = CASE WHEN EXCLUDED.status = 'COMPLETED'
                             THEN COALESCE(lesson_progress.completed_at, now()) END,
         updated_at = now()`,
      [userId, lessonId, status],
    );
  }

  /** Opening a lesson records the visit and marks it started — never downgrades "completed". */
  async visit(userId: string, lessonId: string): Promise<void> {
    this.publishedLesson(lessonId);
    await this.db.transaction(async m => {
      await m.query(
        `INSERT INTO lesson_visits (user_id, lesson_id, visited_at) VALUES ($1, $2, now())
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET visited_at = now()`,
        [userId, lessonId],
      );
      await m.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, status) VALUES ($1, $2, 'IN_PROGRESS')
         ON CONFLICT (user_id, lesson_id) DO NOTHING`,
        [userId, lessonId],
      );
    });
  }

  async addBookmark(userId: string, lessonId: string): Promise<void> {
    this.content.lesson(lessonId);
    await this.db.query(
      `INSERT INTO bookmarks (user_id, lesson_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, lessonId],
    );
  }

  async removeBookmark(userId: string, lessonId: string): Promise<void> {
    await this.bookmarks.delete({ userId, lessonId });
  }

  completedLessonIds(userId: string): Promise<Set<string>> {
    return this.progress
      .find({ where: { userId, status: 'COMPLETED' }, select: { lessonId: true } })
      .then(rows => new Set(rows.map(r => r.lessonId)));
  }
}
