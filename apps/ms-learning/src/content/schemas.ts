import { z } from 'zod';

/**
 * Schemas for everything under content/ that ms-learning serves.
 * (Lesson bodies are MDX and compiled into the web app; they are checked by
 * the web build and by content/check.ts for existence only.)
 *
 * The loader rejects unknown keys (`.strict()`), so a typo in a YAML key
 * fails loudly instead of silently dropping data.
 */

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids are kebab-case: lowercase letters, digits, dashes');
const markdown = z.string().min(1);

/** The five official CKA exam domains. */
export const EXAM_DOMAIN_IDS = [
  'cluster-architecture',
  'workloads-scheduling',
  'services-networking',
  'storage',
  'troubleshooting',
] as const;

/**
 * All domains: the exam domains plus extra tracks that go beyond the exam
 * (weight 0 — they never count toward exam readiness).
 */
export const DOMAIN_IDS = [...EXAM_DOMAIN_IDS, 'platform-tools'] as const;

// --- curriculum.yaml -------------------------------------------------------

export const LessonSchema = z
  .object({
    id,
    title: z.string().min(3),
    summary: z.string().min(10),
    minutes: z.number().int().positive().max(240),
    /** `planned` lessons appear in the outline but have no body yet. */
    status: z.enum(['published', 'planned']),
    /** Defaults to the previous lesson of the module. */
    prerequisites: z.array(id).optional(),
  })
  .strict();

export const ModuleSchema = z
  .object({
    id,
    domain: z.enum(DOMAIN_IDS),
    title: z.string().min(3),
    summary: z.string().min(10),
    objectives: z.array(z.string().min(5)).min(1),
    /**
     * Official competency ids (from domains[].competencies) this module covers.
     * Empty for foundation modules (e.g. kubectl workflow) that support every domain.
     */
    competencies: z.array(id).default([]),
    lessons: z.array(LessonSchema).min(1),
  })
  .strict();

export const CurriculumSchema = z
  .object({
    version: z.string(),
    kubernetesVersion: z.string().regex(/^1\.\d+$/),
    source: z.string().url(),
    domains: z
      .array(
        z
          .object({
            id: z.enum(DOMAIN_IDS),
            title: z.string(),
            /** Official exam weight in percent; 0 for tracks beyond the exam. */
            weight: z.number().int().min(0).max(100),
            competencies: z.array(z.object({ id, text: z.string() }).strict()).default([]),
          })
          .strict(),
      )
      .min(EXAM_DOMAIN_IDS.length),
    modules: z.array(ModuleSchema).min(1),
  })
  .strict();

// --- labs/*.yaml -----------------------------------------------------------

/**
 * A check is a read-only command and the output it should print.
 *
 * Without `match`, the student runs it and compares by eye. With `match`, a
 * lab environment (ms-labs) runs it server-side and decides:
 *   exact     trimmed stdout equals `expect`
 *   contains  stdout contains `expect`
 *   regex     stdout matches the regular expression `expect`
 *   success   the command exits 0 (`expect` describes what that means)
 */
export const CheckSchema = z
  .object({
    id,
    description: z.string(),
    command: z.string().min(1),
    expect: z.string().min(1),
    match: z.enum(['exact', 'contains', 'regex', 'success']).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.match && /<[a-z]+(?:-[a-z]+)+>/.test(c.command)) {
      ctx.addIssue({ code: 'custom', message: `${c.id}: auto checks cannot contain placeholders like <node-ip>` });
    }
    if (c.match === 'regex') {
      try {
        new RegExp(c.expect);
      } catch {
        ctx.addIssue({ code: 'custom', message: `${c.id}: expect is not a valid regular expression` });
      }
    }
  });

export const LabSchema = z
  .object({
    id,
    title: z.string(),
    module: id,
    type: z.enum(['guided', 'challenge', 'troubleshooting']),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    minutes: z.number().int().positive(),
    environment: z
      .object({
        /** `kind` labs run on a disposable local kind cluster. */
        cluster: z.enum(['kind', 'kubeadm', 'any']),
        /** Breaks or reconfigures the cluster itself: never run on a shared cluster. */
        destructive: z.boolean(),
        requirements: z.array(z.string()).default([]),
      })
      .strict(),
    scenario: markdown,
    objectives: z.array(z.string()).min(1),
    setup: z.object({ description: markdown, commands: z.string() }).strict(),
    tasks: z
      .array(
        z
          .object({
            id,
            title: z.string(),
            description: markdown,
            hints: z.array(markdown).default([]),
            solution: markdown,
            checks: z.array(CheckSchema).default([]),
          })
          .strict(),
      )
      .min(1),
    /** Optional all-in-one read-only verification script, run by the student. */
    verifyScript: z.string().optional(),
    reset: z.object({ description: markdown, commands: z.string() }).strict(),
  })
  .strict();

// --- quizzes/*.yaml --------------------------------------------------------

export const QuestionSchema = z
  .object({
    id,
    /** `scenario` is a single-answer question with a longer situational stem. */
    type: z.enum(['single', 'multiple', 'scenario']),
    prompt: markdown,
    options: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z]$/, 'option ids are single letters'),
            text: markdown,
            correct: z.boolean().default(false),
            /** Why this option is right or wrong; shown after answering. */
            explanation: markdown,
          })
          .strict(),
      )
      .min(2)
      .max(6),
    explanation: markdown,
  })
  .strict()
  .superRefine((q, ctx) => {
    const correct = q.options.filter(o => o.correct).length;
    if (q.type !== 'multiple' && correct !== 1) {
      ctx.addIssue({ code: 'custom', message: `${q.id}: ${q.type} questions need exactly one correct option (found ${correct})` });
    }
    if (q.type === 'multiple' && correct < 1) {
      ctx.addIssue({ code: 'custom', message: `${q.id}: multiple-answer questions need at least one correct option` });
    }
    if (new Set(q.options.map(o => o.id)).size !== q.options.length) {
      ctx.addIssue({ code: 'custom', message: `${q.id}: duplicate option ids` });
    }
  });

export const QuizSchema = z
  .object({
    id,
    title: z.string(),
    module: id,
    description: z.string(),
    passPercent: z.number().int().min(1).max(100).default(70),
    questions: z.array(QuestionSchema).min(1),
  })
  .strict();

// --- exams/*.yaml ----------------------------------------------------------

export const ExamSchema = z
  .object({
    id,
    title: z.string(),
    description: markdown,
    durationMinutes: z.number().int().positive(),
    passPercent: z.number().int().min(1).max(100),
    environment: markdown,
    tasks: z
      .array(
        z
          .object({
            id,
            title: z.string(),
            domain: z.enum(DOMAIN_IDS),
            points: z.number().int().positive(),
            /** e.g. `kubectl config use-context kind-cka` */
            context: z.string(),
            description: markdown,
            checks: z.array(CheckSchema).min(1),
            solution: markdown,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

// --- cheatsheets/*.yaml ----------------------------------------------------

export const CheatsheetSchema = z
  .object({
    id,
    title: z.string(),
    description: z.string(),
    order: z.number().int(),
    sections: z
      .array(
        z
          .object({
            title: z.string(),
            entries: z
              .array(
                z
                  .object({
                    title: z.string(),
                    description: z.string().optional(),
                    code: z.string(),
                    lang: z.enum(['bash', 'yaml', 'text', 'json']).default('bash'),
                    tags: z.array(z.string()).default([]),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type CurriculumFile = z.infer<typeof CurriculumSchema>;
export type Lab = z.infer<typeof LabSchema>;
export type Quiz = z.infer<typeof QuizSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Exam = z.infer<typeof ExamSchema>;
export type Cheatsheet = z.infer<typeof CheatsheetSchema>;
