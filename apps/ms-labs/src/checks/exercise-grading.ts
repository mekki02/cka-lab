import type { ExerciseMatch, RunnableExercise } from '../content/exercises';
import { STUDENT_HOME } from '../sessions/manifests';

/**
 * Pure grading helpers for exercises (unit-tested). Student input is only
 * ever compared here, in Node: it never reaches a shell.
 */

const lineSet = (s: string) =>
  [...new Set(s.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean))].sort();

/** Strips terminal colour codes and other control sequences. */
// eslint-disable-next-line no-control-regex
export const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

export const compareValue = (
  actual: string,
  expected: string,
  match: Exclude<ExerciseMatch, 'success'>,
  opts: { caseSensitive?: boolean } = {},
): boolean => {
  const fold = (s: string) => (opts.caseSensitive ?? true ? s : s.toLowerCase());
  const a = fold(actual.replace(/\r/g, '').trim());
  const e = fold(expected.replace(/\r/g, '').trim());
  switch (match) {
    case 'exact':
      return a === e;
    case 'contains':
      return e.length > 0 && a.includes(e);
    case 'regex':
      return new RegExp(expected, opts.caseSensitive ?? true ? 'm' : 'mi').test(actual);
    case 'lines': {
      const x = lineSet(a);
      const y = lineSet(e);
      return x.length === y.length && x.every((l, i) => l === y[i]);
    }
    case 'number': {
      const x = Number(a);
      const y = Number(e);
      return a !== '' && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-9;
    }
  }
};

/** Passes when any command in the history matches. */
export const historyMatches = (history: string, pattern: string): boolean => {
  const re = new RegExp(pattern);
  return history
    .split('\n')
    .filter(l => l && !l.startsWith('#')) // `#<timestamp>` lines when HISTTIMEFORMAT is set
    .some(l => re.test(l));
};

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Runs in the `checker` container: wipes the namespaces of **every**
 * exercise (an earlier exercise's Pods would otherwise keep holding the
 * session's quota — and loading an exercise resets it anyway), runs
 * `cleanup`, recreates this exercise's namespaces empty, runs the setup.
 */
export const exerciseClusterScript = (e: RunnableExercise, allExerciseNamespaces: string[] = []): string => {
  const own = [...new Set(e.namespaces)].sort();
  const others = [...new Set(allExerciseNamespaces)].filter(n => !own.includes(n)).sort();
  // Existing namespaces among `names`, one per line ('' if none).
  const existing = (names: string[]) =>
    `$(kubectl get namespaces -o jsonpath='{range .items[*]}{.metadata.name}{"\\n"}{end}' | grep -Fx -e ${names.map(shq).join(' -e ')} || true)`;
  // Force-deleting the Pods frees the quota at once; the namespace finishes terminating on its own.
  const wipe = (v: string, wait: boolean) => `if [ -n "$${v}" ]; then
  for n in $${v}; do kubectl -n "$n" delete pods --all --grace-period=0 --force >/dev/null 2>&1 || true; done
  kubectl delete namespace $${v} --ignore-not-found ${wait ? '--wait=true --timeout=150s' : '--wait=false'}
fi`;
  return [
    'set -e',
    others.length && `others=${existing(others)}\n${wipe('others', false)}`,
    own.length && `own=${existing(own)}\n${wipe('own', true)}`,
    e.cleanup?.trim() && `( ${e.cleanup.trim()} ) || true`,
    ...own.map(n => `kubectl create namespace ${n}`),
    e.setup.trim(),
  ]
    .filter(Boolean)
    .join('\n');
};

/**
 * Runs in the `shell` container (content only, never student input): fresh
 * starter files in ~/<id>/, and no stale answer files from an earlier try.
 */
export const exerciseHomeScript = (e: RunnableExercise): string => {
  const dir = `${STUDENT_HOME}/${e.id}`;
  const lines = ['set -e', `rm -rf ${shq(dir)}`, `mkdir -p ${shq(`${STUDENT_HOME}/answers`)}`];
  for (const c of e.checks) if (c.type === 'file') lines.push(`rm -f ${shq(`${STUDENT_HOME}/${c.path}`)}`);
  for (const f of e.files) {
    const target = `${dir}/${f.path}`;
    lines.push(`mkdir -p "$(dirname ${shq(target)})"`, `printf %s ${shq(b64(f.content))} | base64 -d > ${shq(target)}`);
  }
  return lines.join('\n');
};

export const studentFile = (path: string) => `${STUDENT_HOME}/${path}`;
export const shellQuote = shq;
