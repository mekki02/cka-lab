import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { z } from 'zod';
import {
  CheatsheetSchema,
  CurriculumSchema,
  EXAM_DOMAIN_IDS,
  ExamSchema,
  LabSchema,
  QuizSchema,
  type Cheatsheet,
  type CurriculumFile,
  type Exam,
  type Lab,
  type Quiz,
} from './schemas';

export interface ContentBundle {
  curriculum: CurriculumFile;
  labs: Map<string, Lab>;
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
  const curriculum = parseFile(join(contentDir, 'curriculum.yaml'), CurriculumSchema, problems);
  const labs = collect(join(contentDir, 'labs'), LabSchema, problems);
  const quizzes = collect(join(contentDir, 'quizzes'), QuizSchema, problems);
  const exams = collect(join(contentDir, 'exams'), ExamSchema, problems);
  const cheatsheets = [...collect(join(contentDir, 'cheatsheets'), CheatsheetSchema, problems).values()].sort(
    (a, b) => a.order - b.order,
  );

  if (curriculum) {
    const moduleIds = new Set<string>();
    const lessonIds = new Set<string>();
    const competencyIds = new Set(curriculum.domains.flatMap(d => d.competencies.map(c => c.id)));
    const covered = new Set<string>();

    const weights = curriculum.domains.reduce((sum, d) => sum + d.weight, 0);
    if (weights !== 100) problems.push(`curriculum.yaml: domain weights sum to ${weights}, expected 100`);
    for (const examDomain of EXAM_DOMAIN_IDS) {
      const d = curriculum.domains.find(x => x.id === examDomain);
      if (!d) problems.push(`curriculum.yaml: exam domain "${examDomain}" is missing`);
      else if (d.weight === 0 || d.competencies.length === 0) {
        problems.push(`curriculum.yaml: exam domain "${examDomain}" needs a weight and its official competencies`);
      }
    }
    const domainIds = new Set(curriculum.domains.map(d => d.id));
    if (domainIds.size !== curriculum.domains.length) problems.push('curriculum.yaml: duplicate domain ids');
    for (const m of curriculum.modules) {
      if (!domainIds.has(m.domain)) problems.push(`curriculum.yaml: module "${m.id}" uses undeclared domain "${m.domain}"`);
    }

    for (const m of curriculum.modules) {
      if (moduleIds.has(m.id)) problems.push(`curriculum.yaml: duplicate module id "${m.id}"`);
      moduleIds.add(m.id);
      for (const c of m.competencies) {
        if (!competencyIds.has(c)) problems.push(`curriculum.yaml: module "${m.id}" references unknown competency "${c}"`);
        covered.add(c);
      }
      for (const l of m.lessons) {
        if (lessonIds.has(l.id)) problems.push(`curriculum.yaml: duplicate lesson id "${l.id}"`);
        lessonIds.add(l.id);
      }
    }
    for (const m of curriculum.modules) {
      for (const l of m.lessons) {
        for (const p of l.prerequisites ?? []) {
          if (!lessonIds.has(p)) problems.push(`curriculum.yaml: lesson "${l.id}" has unknown prerequisite "${p}"`);
        }
      }
    }
    for (const c of competencyIds) {
      if (!covered.has(c)) problems.push(`curriculum.yaml: official competency "${c}" is not covered by any module`);
    }
    const checkModule = (kind: string, itemId: string, moduleId: string) => {
      if (!moduleIds.has(moduleId)) problems.push(`${kind} "${itemId}" references unknown module "${moduleId}"`);
    };
    labs.forEach(l => checkModule('lab', l.id, l.module));
    quizzes.forEach(q => checkModule('quiz', q.id, q.module));
  }

  if (problems.length > 0 || !curriculum) throw new ContentError(problems);
  return { curriculum, labs, quizzes, exams, cheatsheets };
};
