import type { CookieOptions, Response } from 'express';
import {
  API_PREFIX_IDENTITY,
  COOKIE_ACCESS_TOKEN,
  COOKIE_CSRF,
  COOKIE_REFRESH_TOKEN,
} from '@cka/contracts';

/**
 * Three cookies, three different scopes:
 *
 * | cookie   | HttpOnly | Path                    | why                                       |
 * |----------|----------|-------------------------|-------------------------------------------|
 * | cka_at   | yes      | /api                    | access JWT, sent to every service's API   |
 * | cka_rt   | yes      | /api/identity/auth      | refresh token, only sent where it's used  |
 * | cka_csrf | no       | /                       | the page reads it and echoes it in a header |
 *
 * JavaScript can read none of the credentials, so an XSS bug cannot exfiltrate
 * a session (it can still act within the page — which is why we also keep a
 * strict Content-Security-Policy in front of the SPA).
 */
const REFRESH_PATH = `${API_PREFIX_IDENTITY}/auth`;

const base = (secure: boolean): CookieOptions => ({ secure, sameSite: 'lax' });

export interface CookieValues {
  accessToken: string;
  accessTtlSeconds: number;
  refreshToken?: string;
  refreshExpires?: Date;
  csrfToken: string;
}

export const setSessionCookies = (res: Response, v: CookieValues, secure: boolean): void => {
  res.cookie(COOKIE_ACCESS_TOKEN, v.accessToken, {
    ...base(secure),
    httpOnly: true,
    path: '/api',
    maxAge: v.accessTtlSeconds * 1000,
  });
  if (v.refreshToken && v.refreshExpires) {
    res.cookie(COOKIE_REFRESH_TOKEN, v.refreshToken, {
      ...base(secure),
      httpOnly: true,
      path: REFRESH_PATH,
      expires: v.refreshExpires,
    });
    res.cookie(COOKIE_CSRF, v.csrfToken, {
      ...base(secure),
      httpOnly: false,
      path: '/',
      expires: v.refreshExpires,
    });
  }
};

export const clearSessionCookies = (res: Response, secure: boolean): void => {
  res.clearCookie(COOKIE_ACCESS_TOKEN, { ...base(secure), httpOnly: true, path: '/api' });
  res.clearCookie(COOKIE_REFRESH_TOKEN, { ...base(secure), httpOnly: true, path: REFRESH_PATH });
  res.clearCookie(COOKIE_CSRF, { ...base(secure), path: '/' });
};
