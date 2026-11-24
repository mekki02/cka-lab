import { Injectable } from '@nestjs/common';
import type { DashboardDto, DomainProgressDto, ExamDomainId } from '@cka/contracts';
import { ExamsService } from '../assessments/exams.service';
import { LabsService } from '../assessments/labs.service';
import { QuizzesService } from '../assessments/quizzes.service';
import { percent } from '../assessments/grading';
import { ContentService } from '../content/content.service';
import { ProgressService } from '../progress/progress.service';

/** Weight of reading vs. quiz performance in the readiness indicator. */
const READING_WEIGHT = 0.5;
const QUIZ_WEIGHT = 0.5;
const WEAK_QUIZ_PERCENT = 70;

@Injectable()
export class DashboardService {
  constructor(
    private readonly content: ContentService,
    private readonly progress: ProgressService,
    private readonly labs: LabsService,
    private readonly quizzes: QuizzesService,
    private readonly exams: ExamsService,
  ) {}

  async forUser(userId: string): Promise<DashboardDto> {
    const [completed, recent, labProgress, best, quizHistory, examHistory] = await Promise.all([
      this.progress.completedLessonIds(userId),
      this.progress.recent(userId),
      this.labs.listProgress(userId),
      this.quizzes.bestScores(userId),
      this.quizzes.history(userId),
      this.exams.history(userId),
    ]);

    const curriculum = this.content.curriculum;
    const ordered = this.content.orderedLessons;
    const published = ordered.filter(l => l.status === 'published');

    const domains: DomainProgressDto[] = curriculum.domains.map(d => {
      const modules = curriculum.modules.filter(m => m.domain === d.id);
      const lessons = modules.flatMap(m => m.lessons).filter(l => l.status === 'published');
      const quizScores = modules.flatMap(m => m.quizzes).map(q => best.get(q.id)).filter((s): s is number => s !== undefined);
      return {
        domain: d.id,
        title: d.title,
        weight: d.weight,
        lessonsPublished: lessons.length,
        lessonsCompleted: lessons.filter(l => completed.has(l.id)).length,
        quizAverage: quizScores.length ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : null,
      };
    });

    // Readiness: per domain, half reading coverage, half quiz performance,
    // weighted by the official exam weights. Deliberately conservative — an
    // untaken quiz counts as 0.
    const readiness = Math.round(
      domains.reduce((sum, d) => {
        const reading = d.lessonsPublished ? d.lessonsCompleted / d.lessonsPublished : 0;
        const quiz = (d.quizAverage ?? 0) / 100;
        return sum + d.weight * (READING_WEIGHT * reading + QUIZ_WEIGHT * quiz);
      }, 0),
    );

    const weakAreas: DashboardDto['weakAreas'] = [];
    for (const d of domains) {
      if (d.weight === 0) continue; // tracks beyond the exam are never "weak areas"
      if (d.quizAverage !== null && d.quizAverage < WEAK_QUIZ_PERCENT) {
        weakAreas.push({ domain: d.domain, reason: `Quiz average ${d.quizAverage}% (target ${WEAK_QUIZ_PERCENT}%)` });
      } else if (d.weight >= 20 && d.lessonsPublished > 0 && d.lessonsCompleted / d.lessonsPublished < 0.25) {
        weakAreas.push({ domain: d.domain, reason: `High-weight domain (${d.weight}%) with little progress` });
      }
    }

    // Next lesson: first published, not-completed lesson whose prerequisites are done.
    const next = published.find(l => !completed.has(l.id) && l.prerequisites.every(p => completed.has(p) || !published.some(x => x.id === p)));
    const lastVisited = recent[0] ? this.content.lesson(recent[0].lessonId) : undefined;

    const labIds = new Set(this.content.labs.map(l => l.id));
    const lastExamAttempt = examHistory.find(a => a.submittedAt !== null);

    return {
      totals: {
        lessonsPublished: published.length,
        lessonsCompleted: published.filter(l => completed.has(l.id)).length,
        lessonsPlanned: ordered.length - published.length,
        labsCompleted: labProgress.filter(p => p.status === 'COMPLETED' && labIds.has(p.labId)).length,
        labsTotal: labIds.size,
        quizzesPassed: this.content.quizzes.filter(q => (best.get(q.id) ?? 0) >= q.passPercent).length,
        quizzesTotal: this.content.quizzes.length,
      },
      domains,
      currentModuleId: lastVisited?.moduleId ?? next?.moduleId ?? null,
      nextLessonId: next?.id ?? null,
      recent,
      inProgressLabs: labProgress.filter(p => p.status === 'IN_PROGRESS' && labIds.has(p.labId)).map(p => p.labId),
      recentQuizAttempts: quizHistory.slice(0, 5),
      weakAreas: weakAreas.sort((a, b) => weightOf(domains, b.domain) - weightOf(domains, a.domain)),
      lastExam: lastExamAttempt
        ? {
            examId: lastExamAttempt.examId,
            percent: percent(lastExamAttempt.score ?? 0, lastExamAttempt.maxScore),
            submittedAt: lastExamAttempt.submittedAt!,
            passPercent: lastExamAttempt.passPercent,
          }
        : null,
      readiness,
    };
  }
}

const weightOf = (domains: DomainProgressDto[], id: ExamDomainId) => domains.find(d => d.domain === id)?.weight ?? 0;
