import { readFileSync } from 'node:fs';

/**
 * Reads a secret from `NAME` or, if unset, from the file named by `NAME_FILE`.
 *
 * The *_FILE form lets Kubernetes mount a Secret as a volume instead of an env
 * var: env vars leak more easily (`kubectl describe`, crash dumps, child
 * processes), files can be rotated without restarting the pod's spec.
 */
export const readSecret = (value: string | undefined, file: string | undefined): string | undefined => {
  if (value) return value;
  if (file) return readFileSync(file, 'utf8').trim();
  return undefined;
};
