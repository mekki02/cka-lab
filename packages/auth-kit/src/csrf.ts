import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * CSRF protection: "double-submit cookie".
 *
 * At login the server sets a random token in a cookie the page CAN read
 * (not HttpOnly). For every state-changing request the page copies it into a
 * header. A malicious site can make the browser *send* our cookies, but it
 * cannot *read* them, so it cannot produce the matching header.
 *
 * This sits on top of SameSite=Lax cookies, which already stop most
 * cross-site POSTs; the header check covers older browsers and same-site
 * subdomain attacks.
 */
export const newCsrfToken = (): string => randomBytes(32).toString('base64url');

export const csrfTokensMatch = (cookie: unknown, header: unknown): boolean => {
  if (typeof cookie !== 'string' || typeof header !== 'string') return false;
  if (cookie.length === 0 || cookie.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
};

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
