import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { COOKIE_CSRF, HEADER_CSRF } from '@cka/contracts';

/**
 * The one base query of the app (same idea as the boilerplate's
 * `appBaseQuery`), adapted to cookie sessions:
 *
 * - No token handling in JavaScript: the session cookies are HttpOnly and the
 *   browser attaches them. All API calls are same-origin (`/api/...`), routed
 *   by the Ingress (prod) or the Vite proxy (dev).
 * - The CSRF token is read from its (readable) cookie and echoed in a header.
 * - On 401, refresh the session once — shared by concurrent requests — and
 *   retry. If the refresh fails, the session is over: `onSessionExpired` runs.
 */

const readCookie = (name: string): string | undefined =>
  document.cookie
    .split('; ')
    .find(c => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const raw = fetchBaseQuery({
  baseUrl: '/api/',
  credentials: 'same-origin',
  prepareHeaders: headers => {
    const csrf = readCookie(COOKIE_CSRF);
    if (csrf) headers.set(HEADER_CSRF, decodeURIComponent(csrf));
    return headers;
  },
});

let inFlightRefresh: Promise<boolean> | null = null;
let onSessionExpired: () => void = () => undefined;

export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

const NO_REFRESH = ['identity/auth/login', 'identity/auth/refresh', 'identity/auth/logout', 'identity/auth/accept-invite', 'identity/auth/reset-password'];

export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  const result = await raw(args, api, extra);
  const url = typeof args === 'string' ? args : args.url;
  if (result.error?.status !== 401 || NO_REFRESH.some(p => url.startsWith(p))) return result;

  inFlightRefresh ??= Promise.resolve(raw({ url: 'identity/auth/refresh', method: 'POST' }, api, extra))
    .then(r => !r.error)
    .finally(() => {
      inFlightRefresh = null;
    });

  if (await inFlightRefresh) return raw(args, api, extra);
  onSessionExpired();
  return result;
};

/** Turns any RTK Query / Nest error into one human-readable line. */
export const errorMessage = (err: unknown, fallback = 'Something went wrong'): string => {
  const e = err as { status?: number | string; data?: { message?: string | string[] }; error?: string };
  if (!e) return fallback;
  const msg = e.data?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  if (typeof msg === 'string') return msg;
  if (e.status === 'FETCH_ERROR') return 'Cannot reach the server. Check your connection.';
  if (e.status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (typeof e.status === 'number' && e.status >= 500) return 'The server had a problem. Try again in a moment.';
  return e.error ?? fallback;
};
