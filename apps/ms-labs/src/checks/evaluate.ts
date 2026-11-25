import type { CheckMatch, VerifyResultDto } from '@cka/contracts';

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

/**
 * Decides whether a check passed. Output is compared after trimming
 * surrounding whitespace, and quotes around `expect` in content are not
 * part of the value (YAML already removed them).
 */
export const evaluateCheck = (match: CheckMatch, expect: string, r: ExecResult): boolean => {
  if (r.timedOut) return false;
  if (match === 'success') return r.exitCode === 0;
  if (r.exitCode !== 0) return false;
  const out = r.stdout.trim();
  switch (match) {
    case 'exact':
      return out === expect.trim();
    case 'contains':
      return out.includes(expect);
    case 'regex':
      return new RegExp(expect, 'm').test(out);
  }
};

export const clip = (s: string, maxLines = 30, maxChars = 4000): string => {
  const lines = s.replace(/\r/g, '').split('\n');
  const head = lines.slice(0, maxLines).join('\n');
  const clipped = head.length > maxChars ? `${head.slice(0, maxChars)}…` : head;
  return lines.length > maxLines ? `${clipped}\n… (${lines.length - maxLines} more lines)` : clipped;
};

export const checkOutput = (r: ExecResult): string =>
  clip([r.stdout.trim(), r.stderr.trim(), r.timedOut ? '(timed out)' : ''].filter(Boolean).join('\n'));

/** Parses the course's verify-script convention: lines starting with PASS or FAIL. */
export const parseVerifyOutput = (r: ExecResult, checkedAt = new Date()): VerifyResultDto => {
  const lines = r.stdout
    .split('\n')
    .map(l => l.trimEnd())
    .filter(l => /^(PASS|FAIL)\b/.test(l))
    .map(l => ({ passed: l.startsWith('PASS'), text: l.replace(/^(PASS|FAIL)\s*/, '') }));
  return {
    passed: !r.timedOut && r.exitCode === 0 && lines.every(l => l.passed),
    exitCode: r.exitCode,
    lines,
    output: checkOutput(r),
    checkedAt: checkedAt.toISOString(),
  };
};
