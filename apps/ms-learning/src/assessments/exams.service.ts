import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { ExamAttemptDto, ExamSummaryDto, UpdateExamTaskRequest } from '@cka/contracts';
import { ContentService } from '../content/content.service';
import type { Exam } from '../content/schemas';
import { ExamAttempt, type ExamTaskStates } from './assessment.entities';
import { scoreExam } from './grading';

/** Network latency allowance after the deadline for the last updates. */
const DEADLINE_GRACE_MS = 30_000;

@Injectable()
export class ExamsService {
  constructor(
    @InjectRepository(ExamAttempt) private readonly attempts: Repository<ExamAttempt>,
    private readonly content: ContentService,
  ) {}

  summaries(): ExamSummaryDto[] {
    return this.content.exams.map(e => ({
      id: e.id,
      courseId: e.course,
      title: e.title,
      description: e.description,
      durationMinutes: e.durationMinutes,
      passPercent: e.passPercent,
      taskCount: e.tasks.length,
      totalPoints: e.tasks.reduce((s, t) => s + t.points, 0),
    }));
  }

  private toDto(a: ExamAttempt, exam: Exam): ExamAttemptDto {
    const done = a.submittedAt !== null;
    return {
      id: a.id,
      examId: a.examId,
      title: exam.title,
      environment: exam.environment,
      startedAt: a.startedAt.toISOString(),
      deadline: a.deadline.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      passPercent: exam.passPercent,
      tasks: exam.tasks.map(t => ({
        id: t.id,
        title: t.title,
        domain: t.domain,
        points: t.points,
        context: t.context,
        description: t.description,
        checks: t.checks.map(c => ({ ...c, match: c.match ?? null })),
        solution: done ? t.solution : null,
      })),
      taskStates: a.taskStates,
      score: a.score,
      maxScore: a.maxScore,
    };
  }

  /** The timer is enforced by the server: once the deadline passes, the attempt is finalised on next access. */
  private async finalizeIfExpired(a: ExamAttempt, exam: Exam): Promise<ExamAttempt> {
    if (a.submittedAt || a.deadline.getTime() + DEADLINE_GRACE_MS > Date.now()) return a;
    return this.finalize(a, exam, a.deadline);
  }

  private async finalize(a: ExamAttempt, exam: Exam, at: Date): Promise<ExamAttempt> {
    const { score, maxScore } = scoreExam(exam, a.taskStates);
    a.score = score;
    a.maxScore = maxScore;
    a.submittedAt = at;
    return this.attempts.save(a);
  }

  /** Starts an attempt, or resumes the open one (one open attempt per exam, enforced by a unique index). */
  async start(userId: string, examId: string): Promise<ExamAttemptDto> {
    const exam = this.content.exam(examId);
    const open = await this.attempts.findOneBy({ userId, examId, submittedAt: IsNull() });
    if (open) {
      const current = await this.finalizeIfExpired(open, exam);
      if (!current.submittedAt) return this.toDto(current, exam);
    }
    const now = new Date();
    const taskStates: ExamTaskStates = Object.fromEntries(exam.tasks.map(t => [t.id, { status: 'TODO', passedChecks: [] }]));
    try {
      const saved = await this.attempts.save(
        this.attempts.create({
          userId,
          examId,
          startedAt: now,
          deadline: new Date(now.getTime() + exam.durationMinutes * 60_000),
          submittedAt: null,
          taskStates,
          score: null,
          maxScore: exam.tasks.reduce((s, t) => s + t.points, 0),
        }),
      );
      return this.toDto(saved, exam);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictException('An attempt is already in progress');
      throw err;
    }
  }

  private async owned(userId: string, attemptId: string): Promise<{ a: ExamAttempt; exam: Exam }> {
    const a = await this.attempts.findOneBy({ id: attemptId, userId });
    if (!a) throw new NotFoundException('Attempt not found');
    const exam = this.content.exam(a.examId);
    return { a: await this.finalizeIfExpired(a, exam), exam };
  }

  async get(userId: string, attemptId: string): Promise<ExamAttemptDto> {
    const { a, exam } = await this.owned(userId, attemptId);
    return this.toDto(a, exam);
  }

  async updateTask(userId: string, attemptId: string, taskId: string, patch: UpdateExamTaskRequest): Promise<ExamAttemptDto> {
    const { a, exam } = await this.owned(userId, attemptId);
    if (a.submittedAt) throw new BadRequestException('This attempt is finished');
    const task = exam.tasks.find(t => t.id === taskId);
    if (!task) throw new NotFoundException(`Unknown task "${taskId}"`);

    const state = a.taskStates[taskId] ?? { status: 'TODO', passedChecks: [] };
    if (patch.status) state.status = patch.status;
    if (patch.passedChecks) {
      const known = new Set(task.checks.map(c => c.id));
      state.passedChecks = [...new Set(patch.passedChecks)].filter(c => known.has(c));
    }
    a.taskStates = { ...a.taskStates, [taskId]: state };
    return this.toDto(await this.attempts.save(a), exam);
  }

  async submit(userId: string, attemptId: string): Promise<ExamAttemptDto> {
    const { a, exam } = await this.owned(userId, attemptId);
    if (a.submittedAt) return this.toDto(a, exam);
    return this.toDto(await this.finalize(a, exam, new Date()), exam);
  }

  async history(userId: string): Promise<ExamAttemptDto[]> {
    const rows = await this.attempts.find({ where: { userId }, order: { startedAt: 'DESC' }, take: 50 });
    const out: ExamAttemptDto[] = [];
    for (const r of rows) {
      const exam = this.content.exams.find(e => e.id === r.examId);
      if (exam) out.push(this.toDto(await this.finalizeIfExpired(r, exam), exam));
    }
    return out;
  }
}
