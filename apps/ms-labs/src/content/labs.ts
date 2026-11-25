import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * The slice of a lab that the controller needs: setup, checks, verify.
 *
 * ms-learning owns the strict content schema (and the build fails on invalid
 * content); this loader only reads the fields it executes, and ignores the
 * rest, so the two services cannot disagree about anything but these.
 */
const Check = z.object({
  id: z.string(),
  command: z.string(),
  expect: z.string(),
  match: z.enum(['exact', 'contains', 'regex', 'success']).optional(),
});

const RunnableLab = z.object({
  id: z.string(),
  title: z.string(),
  environment: z.object({ destructive: z.boolean() }).passthrough(),
  setup: z.object({ commands: z.string() }).passthrough(),
  tasks: z.array(z.object({ id: z.string(), checks: z.array(Check).default([]) }).passthrough()),
  verifyScript: z.string().optional(),
});

export type RunnableLab = z.infer<typeof RunnableLab>;
export type RunnableCheck = z.infer<typeof Check>;

export const loadLabs = (contentDir: string): Map<string, RunnableLab> => {
  const dir = join(contentDir, 'labs');
  const labs = new Map<string, RunnableLab>();
  if (!existsSync(dir)) return labs;
  for (const f of readdirSync(dir).filter(f => /\.ya?ml$/.test(f))) {
    const lab = RunnableLab.parse(parse(readFileSync(join(dir, f), 'utf8')));
    labs.set(lab.id, lab);
  }
  return labs;
};
