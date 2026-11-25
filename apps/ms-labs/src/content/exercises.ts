import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * The executable slice of an exercise: how to load it and how to grade it.
 * ms-learning owns the strict schema (content:check fails on invalid
 * content); this mirrors only the fields ms-labs runs, with the same
 * defaults.
 */
const Match = z.enum(['exact', 'contains', 'regex', 'lines', 'number', 'success']);
export type ExerciseMatch = z.infer<typeof Match>;

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;

const Check = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('cluster'), command: z.string(), expect: z.string(), match: Match }),
  z.object({
    id: z.string(),
    type: z.literal('answer'),
    input: z.string(),
    expect: z.string().optional(),
    expectCommand: z.string().optional(),
    match: Match.default('exact'),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({
    id: z.string(),
    type: z.literal('file'),
    path: z.string().regex(SAFE_PATH),
    expect: z.string().optional(),
    expectCommand: z.string().optional(),
    match: Match.default('exact'),
  }),
  z.object({ id: z.string(), type: z.literal('history'), expect: z.string() }),
  z.object({ id: z.string(), type: z.literal('terminal'), expect: z.string(), match: Match.default('contains') }),
]);
export type ExerciseCheck = z.infer<typeof Check>;

const RunnableExercise = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string(),
  namespaces: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).default([]),
  setup: z.string().default(''),
  cleanup: z.string().optional(),
  files: z.array(z.object({ path: z.string().regex(SAFE_PATH), content: z.string() })).default([]),
  checks: z.array(Check).min(1),
});
export type RunnableExercise = z.infer<typeof RunnableExercise>;

export const loadExercises = (contentDir: string): Map<string, RunnableExercise> => {
  const dir = join(contentDir, 'exercises');
  const out = new Map<string, RunnableExercise>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter(f => /\.ya?ml$/.test(f))) {
    const e = RunnableExercise.parse(parse(readFileSync(join(dir, f), 'utf8')));
    out.set(e.id, e);
  }
  return out;
};
