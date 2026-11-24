import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QuizAttemptDto, QuizDto } from '@cka/contracts';
import { ContentService } from '../content/content.service';
import type { Quiz } from '../content/schemas';
import { QuizAttempt } from './assessment.entities';
import { gradeQuiz, percent } from './grading';

@Injectable()
export class QuizzesService {
  constructor(
    @InjectRepository(QuizAttempt) private readonly attempts: Repository<QuizAttempt>,
    private readonly content: ContentService,
  ) {}

  /** The browser never receives which option is correct before submitting. */
  toDto(q: Quiz): QuizDto {
    return {
      id: q.id,
      title: q.title,
      moduleId: q.module,
      description: q.description,
      passPercent: q.passPercent,
      questions: q.questions.map(question => ({
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        options: question.options.map(o => ({ id: o.id, text: o.text })),
      })),
    };
  }

  attemptDto(a: QuizAttempt, withResults: boolean): QuizAttemptDto {
    const quiz = this.content.quizzes.find(q => q.id === a.quizId);
    const pct = percent(a.score, a.maxScore);
    return {
      id: a.id,
      quizId: a.quizId,
      score: a.score,
      maxScore: a.maxScore,
      percent: pct,
      passed: pct >= (quiz?.passPercent ?? 70),
      submittedAt: a.submittedAt.toISOString(),
      results: withResults ? a.results : undefined,
    };
  }

  get(id: string): QuizDto {
    return this.toDto(this.content.quiz(id));
  }

  async submit(userId: string, quizId: string, answers: Record<string, string[]>): Promise<QuizAttemptDto> {
    const quiz = this.content.quiz(quizId);
    const { score, maxScore, results } = gradeQuiz(quiz, answers);
    const saved = await this.attempts.save(
      this.attempts.create({ userId, quizId, score, maxScore, answers, results, submittedAt: new Date() }),
    );
    return this.attemptDto(saved, true);
  }

  async history(userId: string, quizId?: string): Promise<QuizAttemptDto[]> {
    const rows = await this.attempts.find({
      where: quizId ? { userId, quizId } : { userId },
      order: { submittedAt: 'DESC' },
      take: 50,
    });
    return rows.map(a => this.attemptDto(a, false));
  }

  async attempt(userId: string, id: string): Promise<QuizAttemptDto | null> {
    const a = await this.attempts.findOneBy({ id, userId });
    return a ? this.attemptDto(a, true) : null;
  }

  /** Best percent per quiz, for the dashboard. */
  async bestScores(userId: string): Promise<Map<string, number>> {
    const rows: { quiz_id: string; best: string }[] = await this.attempts.query(
      `SELECT quiz_id, MAX(score * 100.0 / max_score) AS best FROM quiz_attempts WHERE user_id = $1 GROUP BY quiz_id`,
      [userId],
    );
    return new Map(rows.map(r => [r.quiz_id, Math.round(Number(r.best))]));
  }
}
