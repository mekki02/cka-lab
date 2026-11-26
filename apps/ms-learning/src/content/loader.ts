import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { z } from 'zod';
import {
  CatalogSchema,
  CheatsheetSchema,
  CourseSchema,
  ExamSchema,
  ExerciseSchema,
  LabSchema,
  QuizSchema,
  type Catalog,
  type Cheatsheet,
  type CourseFile,
  type Exam,
  type Exercise,
  type Lab,
  type Quiz,
} from './schemas';

export interface ContentBundle {
  catalog: Catalog;
  /** In catalogue order. */
  courses: CourseFile[];
  labs: Map<string, Lab>;
  exercises: Map<string, Exercise>;
  quizzes: Map<string, Quiz>;
  exams: Map<string, Exam>;
  cheatsheets: Cheatsheet[];
}

export class ContentError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid course content:\n${problems.map(p => `  - ${p}`).join('\n')}`);
  }
}

const parseFile = <T>(file: string, schema: z.ZodType<T>, problems: string[]): T | undefined => {
  let raw: unknown;
  try {
    raw = parse(readFileSync(file, 'utf8'));
  } catch (err) {
    problems.push(`${file}: YAML syntax error: ${(err as Error).message}`);
    return undefined;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      problems.push(`${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    return undefined;
  }
  return result.data;
};

const yamlFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .sort()
        .map(f => join(dir, f))
    : [];

const collect = <T extends { id: string }>(
  dir: string,
  schema: z.ZodType<T>,
  problems: string[],
): Map<string, T> => {
  const out = new Map<string, T>();
  for (const file of yamlFiles(dir)) {
    const item = parseFile(file, schema, problems);
    if (!item) continue;
    if (out.has(item.id)) problems.push(`${file}: duplicate id "${item.id}"`);
    out.set(item.id, item);
  }
  return out;
};

/**
 * Loads and cross-checks all YAML content. Collects every problem before
 * failing, so an author fixes them in one pass rather than one per restart.
 */
export const loadContent = (contentDir: string): ContentBundle => {
  const problems: string[] = [];
  const catalog = parseFile(join(contentDir, 'curriculum.yaml'), CatalogSchema, problems);
  const courses: CourseFile[] = [];
  for (const courseId of catalog?.courses ?? []) {
    const file = join(contentDir, 'courses', `${courseId}.yaml`);
    if (!existsSync(file)) {
      problems.push(`curriculum.yaml: course "${courseId}" has no file courses/${courseId}.yaml`);
      continue;
    }
    const course = parseFile(file, CourseSchema, problems);
    if (!course) continue;
    if (course.id !== courseId) problems.push(`courses/${courseId}.yaml: id is "${course.id}", expected "${courseId}"`);
    courses.push(course);
  }
  if (catalog) {
    if (new Set(catalog.courses).size !== catalog.courses.length) problems.push('curriculum.yaml: duplicate course ids');
    for (const f of yamlFiles(join(contentDir, 'courses'))) {
      const name = f.replace(/^.*[\\/]/, '').replace(/\.ya?ml$/, '');
      if (!catalog.courses.includes(name)) problems.push(`courses/${name}.yaml is not listed in curriculum.yaml`);
    }
  }
  const labs = collect(join(contentDir, 'labs'), LabSchema, problems);
  const exercises = collect(join(contentDir, 'exercises'), ExerciseSchema, problems);
  const quizzes = collect(join(contentDir, 'quizzes'), QuizSchema, problems);
  const exams = collect(join(contentDir, 'exams'), ExamSchema, problems);
  const cheatsheets = [...collect(join(contentDir, 'cheatsheets'), CheatsheetSchema, problems).values()].sort(
    (a, b) => a.order - b.order,
  );

  // Ids are global: lesson progress, routes (/learn/<module>/<lesson>) and
  // exercises refer to modules and lessons without naming the course.
  const moduleIds = new Set<string>();
  const lessonIds = new Set<string>();
  const domainCourse = new Map<string, string>();
  const competencyIds = new Set<string>();

  for (const course of courses) {
    const where = `courses/${course.id}.yaml`;
    const exam = course.domains.filter(d => d.weight > 0);
    const weights = exam.reduce((sum, d) => sum + d.weight, 0);
    if (exam.length && weights !== 100) problems.push(`${where}: exam domain weights sum to ${weights}, expected 100`);
    for (const d of exam) {
      if (d.competencies.length === 0) problems.push(`${where}: exam domain "${d.id}" needs its official competencies`);
    }
    const covered = new Set<string>();
    const own = new Set<string>();
    for (const d of course.domains) {
      if (domainCourse.has(d.id)) problems.push(`${where}: domain id "${d.id}" is already used by course "${domainCourse.get(d.id)}"`);
      domainCourse.set(d.id, course.id);
      for (const c of d.competencies) {
        if (competencyIds.has(c.id)) problems.push(`${where}: duplicate competency id "${c.id}"`);
        competencyIds.add(c.id);
        own.add(c.id);
      }
    }
    const courseDomains = new Set(course.domains.map(d => d.id));
    for (const m of course.modules) {
      if (!courseDomains.has(m.domain)) problems.push(`${where}: module "${m.id}" uses domain "${m.domain}", which is not a domain of this course`);
      if (moduleIds.has(m.id)) problems.push(`${where}: duplicate module id "${m.id}"`);
      moduleIds.add(m.id);
      for (const c of m.competencies) {
        if (!own.has(c)) problems.push(`${where}: module "${m.id}" references unknown competency "${c}"`);
        covered.add(c);
      }
      for (const l of m.lessons) {
        if (lessonIds.has(l.id)) problems.push(`${where}: duplicate lesson id "${l.id}"`);
        lessonIds.add(l.id);
      }
    }
    for (const c of own) {
      if (!covered.has(c)) problems.push(`${where}: official competency "${c}" is not covered by any module`);
    }
  }
  const allModules = courses.flatMap(c => c.modules);
  for (const m of allModules) {
    for (const l of m.lessons) {
      for (const p of l.prerequisites ?? []) {
        if (!lessonIds.has(p)) problems.push(`lesson "${l.id}" has unknown prerequisite "${p}"`);
      }
    }
  }
  const checkModule = (kind: string, itemId: string, moduleId: string) => {
    if (!moduleIds.has(moduleId)) problems.push(`${kind} "${itemId}" references unknown module "${moduleId}"`);
  };
  labs.forEach(l => checkModule('lab', l.id, l.module));
  quizzes.forEach(q => checkModule('quiz', q.id, q.module));
  const lessonModule = new Map(allModules.flatMap(m => m.lessons.map(l => [l.id, m.id] as const)));
  exercises.forEach(e => {
    checkModule('exercise', e.id, e.module);
    if (e.lesson && lessonModule.get(e.lesson) !== e.module) {
      problems.push(`exercise "${e.id}": lesson "${e.lesson}" is not a lesson of module "${e.module}"`);
    }
  });
  const courseIds = new Set(courses.map(c => c.id));
  exams.forEach(x => {
    if (!courseIds.has(x.course)) problems.push(`exam "${x.id}" references unknown course "${x.course}"`);
    for (const t of x.tasks) {
      if (domainCourse.get(t.domain) !== x.course) {
        problems.push(`exam "${x.id}": task "${t.id}" uses domain "${t.domain}", which is not a domain of course "${x.course}"`);
      }
    }
  });

  if (problems.length > 0 || !catalog) throw new ContentError(problems);
  return { catalog, courses, labs, exercises, quizzes, exams, cheatsheets };
};
