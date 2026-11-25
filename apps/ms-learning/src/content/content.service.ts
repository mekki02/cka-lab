import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import type { CheatsheetDto, Curriculum, CurriculumLesson, CurriculumModule, ExamDomainId, ExerciseSummaryDto } from '@cka/contracts';
import { Env } from '../config/env';
import { loadContent, type ContentBundle } from './loader';
import type { Exam, Exercise, Lab, Quiz } from './schemas';

/**
 * In-memory, read-only view of the course content. Loaded once at startup:
 * content ships inside the image, so it can only change with a new image —
 * which is exactly when the process restarts.
 *
 * Invalid content throws during startup, so a broken content commit fails the
 * deployment's readiness instead of serving half a course.
 */
@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);
  private bundle!: ContentBundle;
  private curriculumDto!: Curriculum;
  private lessons = new Map<string, CurriculumLesson>();
  private modules = new Map<string, CurriculumModule>();
  private orderedExercisesList: Exercise[] = [];

  constructor(private readonly env: Env) {}

  onModuleInit(): void {
    this.bundle = loadContent(this.env.CONTENT_DIR);
    this.orderedExercisesList = this.orderExercises();
    this.curriculumDto = this.buildCurriculum();
    for (const m of this.curriculumDto.modules) {
      this.modules.set(m.id, m);
      for (const l of m.lessons) this.lessons.set(l.id, l);
    }
    const published = [...this.lessons.values()].filter(l => l.status === 'published').length;
    this.logger.log(
      `Loaded content ${this.curriculumDto.version} (Kubernetes ${this.curriculumDto.kubernetesVersion}): ` +
        `${this.modules.size} modules, ${published}/${this.lessons.size} lessons published, ` +
        `${this.bundle.labs.size} labs, ${this.bundle.exercises.size} exercises, ${this.bundle.quizzes.size} quizzes, ${this.bundle.exams.size} exams`,
    );
  }

  /**
   * Course order: by module, then by lesson (a lesson's exercises follow it),
   * with module challenges last; then `order`, then id.
   */
  private orderExercises(): Exercise[] {
    const pos = new Map<string, number>();
    this.bundle.curriculum.modules.forEach((m, mi) => {
      pos.set(m.id, mi * 1000 + 999);
      m.lessons.forEach((l, li) => pos.set(l.id, mi * 1000 + li));
    });
    const key = (e: Exercise) => pos.get(e.lesson ?? e.module) ?? Number.MAX_SAFE_INTEGER;
    return [...this.bundle.exercises.values()].sort((a, b) => key(a) - key(b) || a.order - b.order || a.id.localeCompare(b.id));
  }

  static exerciseSummary(e: Exercise): ExerciseSummaryDto {
    return {
      id: e.id,
      title: e.title,
      moduleId: e.module,
      lessonId: e.lesson ?? null,
      kind: e.kind,
      difficulty: e.difficulty,
      minutes: e.minutes,
      tags: e.tags,
    };
  }

  private buildCurriculum(): Curriculum {
    const c = this.bundle.curriculum;
    const labs = [...this.bundle.labs.values()];
    const quizzes = [...this.bundle.quizzes.values()];
    return {
      version: c.version,
      kubernetesVersion: c.kubernetesVersion,
      source: c.source,
      domains: c.domains,
      modules: c.modules.map(m => {
        const moduleLabs = labs.filter(l => l.module === m.id);
        const moduleExercises = this.orderedExercisesList.filter(e => e.module === m.id);
        const lessons: CurriculumLesson[] = m.lessons.map((l, i) => ({
          id: l.id,
          moduleId: m.id,
          title: l.title,
          summary: l.summary,
          minutes: l.minutes,
          status: l.status,
          prerequisites: l.prerequisites ?? (i > 0 ? [m.lessons[i - 1]!.id] : []),
        }));
        return {
          id: m.id,
          domain: m.domain,
          title: m.title,
          summary: m.summary,
          objectives: m.objectives,
          competencies: m.competencies,
          lessons,
          labs: moduleLabs.map(l => ({ id: l.id, title: l.title, type: l.type, difficulty: l.difficulty, minutes: l.minutes })),
          quizzes: quizzes
            .filter(q => q.module === m.id)
            .map(q => ({ id: q.id, title: q.title, questions: q.questions.length })),
          exercises: moduleExercises.map(ContentService.exerciseSummary),
          minutes:
            lessons.reduce((s, l) => s + l.minutes, 0) +
            moduleLabs.reduce((s, l) => s + l.minutes, 0) +
            moduleExercises.reduce((s, e) => s + e.minutes, 0),
        };
      }),
    };
  }

  get curriculum(): Curriculum {
    return this.curriculumDto;
  }

  /** Lessons in course order. */
  get orderedLessons(): CurriculumLesson[] {
    return this.curriculumDto.modules.flatMap(m => m.lessons);
  }

  lesson(id: string): CurriculumLesson {
    const l = this.lessons.get(id);
    if (!l) throw new NotFoundException(`Unknown lesson "${id}"`);
    return l;
  }

  module(id: string): CurriculumModule | undefined {
    return this.modules.get(id);
  }

  domainOfModule(moduleId: string): ExamDomainId | undefined {
    return this.modules.get(moduleId)?.domain;
  }

  get labs(): Lab[] {
    return [...this.bundle.labs.values()];
  }

  lab(id: string): Lab {
    const l = this.bundle.labs.get(id);
    if (!l) throw new NotFoundException(`Unknown lab "${id}"`);
    return l;
  }

  /** Exercises in course order. */
  get exercises(): Exercise[] {
    return this.orderedExercisesList;
  }

  exercise(id: string): Exercise {
    const e = this.bundle.exercises.get(id);
    if (!e) throw new NotFoundException(`Unknown exercise "${id}"`);
    return e;
  }

  get quizzes(): Quiz[] {
    return [...this.bundle.quizzes.values()];
  }

  quiz(id: string): Quiz {
    const q = this.bundle.quizzes.get(id);
    if (!q) throw new NotFoundException(`Unknown quiz "${id}"`);
    return q;
  }

  get exams(): Exam[] {
    return [...this.bundle.exams.values()];
  }

  exam(id: string): Exam {
    const e = this.bundle.exams.get(id);
    if (!e) throw new NotFoundException(`Unknown exam "${id}"`);
    return e;
  }

  get cheatsheets(): CheatsheetDto[] {
    return this.bundle.cheatsheets.map(({ id, title, description, sections }) => ({ id, title, description, sections }));
  }
}
