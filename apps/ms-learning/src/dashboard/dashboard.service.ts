import { Injectable } from '@nestjs/common';
import type { CourseProgressDto, DashboardDto, DomainProgressDto, ExamDomainId } from '@cka/contracts';
import { ExamsService } from '../assessments/exams.service';
import { ExercisesService } from '../assessments/exercises.service';
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
    private readonly exercises: ExercisesService,
  ) {}

  async forUser(userId: string): Promise<DashboardDto> {
    const [completed, recent, labProgress, best, quizHistory, examHistory, exercisesDone] = await Promise.all([
      this.progress.completedLessonIds(userId),
      this.progress.recent(userId),
      this.labs.listProgress(userId),
      this.quizzes.bestScores(userId),
      this.quizzes.history(userId),
      this.exams.history(userId),
      this.exercises.completedIds(userId),
    ]);
    const labIds = new Set(this.content.labs.map(l => l.id));
    const lastVisited = recent[0] ? this.content.lesson(recent[0].lessonId) : undefined;
    const ctx: UserState = { completed, best, labProgress, examHistory, exercisesDone };
    const courses = this.content.courses.map(c => this.course(c.id, ctx));
    const currentCourseId = lastVisited ? (this.content.module(lastVisited.moduleId)?.courseId ?? null) : null;
    const current = courses.find(c => c.courseId === currentCourseId) ?? courses[0];
    const nextLesson = current?.nextLessonId ? this.content.lesson(current.nextLessonId) : undefined;

    return {
      courses,
      currentCourseId,
      currentModuleId: lastVisited?.moduleId ?? nextLesson?.moduleId ?? null,
      recent,
      inProgressLabs: labProgress.filter(p => p.status === 'IN_PROGRESS' && labIds.has(p.labId)).map(p => p.labId),
      recentQuizAttempts: quizHistory.slice(0, 5),
    };
  }

  private course(courseId: string, u: UserState): CourseProgressDto {
    const curriculum = this.content.curriculum;
    const modules = this.content.modulesOf(courseId);
    const moduleIds = new Set(modules.map(m => m.id));
    const ordered = modules.flatMap(m => m.lessons);
    const published = ordered.filter(l => l.status === 'published');
    const { completed, best } = u;

    const domains: DomainProgressDto[] = curriculum.domains
      .filter(d => d.courseId === courseId)
      .map(d => {
        const inDomain = modules.filter(m => m.domain === d.id);
        const lessons = inDomain.flatMap(m => m.lessons).filter(l => l.status === 'published');
        const quizScores = inDomain.flatMap(m => m.quizzes).map(q => best.get(q.id)).filter((s): s is number => s !== undefined);
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

    const weakAreas: CourseProgressDto['weakAreas'] = [];
    for (const d of domains) {
      if (d.weight === 0) continue; // tracks beyond the exam are never "weak areas"
      if (d.quizAverage !== null && d.quizAverage < WEAK_QUIZ_PERCENT) {
        weakAreas.push({ domain: d.domain, reason: `Quiz average ${d.quizAverage}% (target ${WEAK_QUIZ_PERCENT}%)` });
      } else if (d.weight >= 20 && d.lessonsPublished > 0 && d.lessonsCompleted / d.lessonsPublished < 0.25) {
        weakAreas.push({ domain: d.domain, reason: `High-weight domain (${d.weight}%) with little progress` });
      }
    }

    // Next lesson: first published, not-completed lesson whose prerequisites
    // are done (prerequisites that are not published yet do not block).
    const isPublished = (id: string) => this.content.orderedLessons.some(x => x.id === id && x.status === 'published');
    const next = published.find(l => !completed.has(l.id) && l.prerequisites.every(p => completed.has(p) || !isPublished(p)));

    const labs = this.content.labs.filter(l => moduleIds.has(l.module));
    const labIds = new Set(labs.map(l => l.id));
    const exercises = this.content.exercises.filter(e => moduleIds.has(e.module));
    const quizzes = this.content.quizzes.filter(q => moduleIds.has(q.module));
    const examIds = new Set(this.content.exams.filter(e => e.course === courseId).map(e => e.id));
    const lastExamAttempt = u.examHistory.find(a => a.submittedAt !== null && examIds.has(a.examId));

    return {
      courseId,
      totals: {
        lessonsPublished: published.length,
        lessonsCompleted: published.filter(l => completed.has(l.id)).length,
        lessonsPlanned: ordered.length - published.length,
        labsCompleted: u.labProgress.filter(p => p.status === 'COMPLETED' && labIds.has(p.labId)).length,
        labsTotal: labIds.size,
        exercisesCompleted: exercises.filter(e => u.exercisesDone.has(e.id)).length,
        exercisesTotal: exercises.length,
        quizzesPassed: quizzes.filter(q => (best.get(q.id) ?? 0) >= q.passPercent).length,
        quizzesTotal: quizzes.length,
      },
      domains,
      nextLessonId: next?.id ?? null,
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

interface UserState {
  completed: Set<string>;
  best: Map<string, number>;
  labProgress: Awaited<ReturnType<LabsService['listProgress']>>;
  examHistory: Awaited<ReturnType<ExamsService['history']>>;
  exercisesDone: Set<string>;
}

const weightOf = (domains: DomainProgressDto[], id: ExamDomainId) => domains.find(d => d.domain === id)?.weight ?? 0;
