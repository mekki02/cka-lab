import { resolve } from 'node:path';
import { ExercisesService } from '../assessments/exercises.service';
import type { ContentService } from './content.service';
import { loadContent } from './loader';
import { ExerciseSchema } from './schemas';

const base = {
  id: 'ex-1',
  title: 'An exercise',
  module: 'services',
  lesson: 'services-fundamentals',
  kind: 'exercise',
  difficulty: 'beginner',
  minutes: 5,
  statement: 'Do it.',
  solution: 'Like this.',
  checks: [{ id: 'c', description: 'cluster ok', type: 'cluster', command: 'true', expect: 'ok', match: 'success' }],
};
const issues = (e: unknown) => {
  const r = ExerciseSchema.safeParse(e);
  return r.success ? [] : r.error.issues.map(i => i.message);
};

describe('ExerciseSchema', () => {
  it('accepts a minimal exercise', () => expect(issues(base)).toEqual([]));

  it('requires exactly one of expect / expectCommand on answers', () => {
    const e = { ...base, inputs: [{ id: 'ip', label: 'IP' }], checks: [{ id: 'a', description: 'the ip', type: 'answer', input: 'ip' }] };
    expect(issues(e).join()).toMatch(/exactly one of expect or expectCommand/);
  });

  it('rejects choice answers that are not an option id, and unchecked inputs', () => {
    const e = {
      ...base,
      inputs: [
        { id: 'q', label: 'Q', kind: 'choice', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
        { id: 'orphan', label: 'nobody checks me' },
      ],
      checks: [{ id: 'a', description: 'the choice', type: 'answer', input: 'q', expect: 'z' }],
    };
    const all = issues(e).join('\n');
    expect(all).toMatch(/must expect one of the option ids/);
    expect(all).toMatch(/input "orphan" is not checked/);
  });

  it('only lets files live under the home directory', () => {
    for (const path of ['/etc/passwd', '../x', 'a/../../b']) {
      const e = { ...base, checks: [{ id: 'f', description: 'a file', type: 'file', path, expect: 'x' }] };
      expect(issues(e).length).toBeGreaterThan(0);
    }
  });

  it('needs a lesson unless it is a challenge', () => {
    expect(issues({ ...base, lesson: undefined }).join()).toMatch(/needs a lesson/);
    expect(issues({ ...base, lesson: undefined, kind: 'challenge' })).toEqual([]);
  });
});

describe('exercise DTOs', () => {
  const bundle = loadContent(resolve(__dirname, '../../../../content'));
  const service = new ExercisesService(undefined as never, undefined as unknown as ContentService);

  it('never serve expected values or the autotest', () => {
    for (const e of bundle.exercises.values()) {
      const json = JSON.stringify(service.toDto(e, false));
      expect(json).not.toMatch(/"expect|expectCommand|autotest|"solve"/);
      expect(service.toDto(e, false).solution).toBeNull();
      for (const c of e.checks) if (c.type === 'answer' && c.expect && c.expect.length > 3) expect(json).not.toContain(c.expect);
    }
  });

  it('every exercise has an autotest (content is tested end to end)', () => {
    for (const e of bundle.exercises.values()) expect(e.autotest, e.id).toBeDefined();
  });
});
