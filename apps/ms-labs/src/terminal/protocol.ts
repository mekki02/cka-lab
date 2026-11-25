import type { TerminalClientMessage } from '@cka/contracts';

/** Validates a browser → server terminal frame. Anything unexpected is dropped. */
export const parseClientMessage = (raw: string): TerminalClientMessage | null => {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.type === 'input' && typeof o.data === 'string') return { type: 'input', data: o.data };
  if (o.type === 'resize' && Number.isInteger(o.cols) && Number.isInteger(o.rows)) {
    const cols = Math.min(Math.max(o.cols as number, 10), 500);
    const rows = Math.min(Math.max(o.rows as number, 3), 200);
    return { type: 'resize', cols, rows };
  }
  return null;
};

/**
 * Cross-site WebSocket hijacking defence: browsers always send Origin on
 * WebSocket handshakes, and a page on another site cannot fake it.
 */
export const originAllowed = (origin: string | undefined, publicUrls: string): boolean => {
  if (!origin) return false;
  const allowed = publicUrls
    .split(',')
    .map(u => u.trim())
    .filter(Boolean)
    .map(u => {
      try {
        return new URL(u).origin;
      } catch {
        return null;
      }
    });
  return allowed.includes(origin);
};
