/**
 * Wire-level constants shared by the browser, ms-identity (which issues
 * sessions) and every service that verifies them (via @cka/auth-kit).
 *
 * Changing a name here is a breaking change for logged-in users: their
 * existing cookies stop being read.
 */
export const COOKIE_ACCESS_TOKEN = 'cka_at';
export const COOKIE_REFRESH_TOKEN = 'cka_rt';
export const COOKIE_CSRF = 'cka_csrf';
export const HEADER_CSRF = 'x-csrf-token';

/** Path prefixes the Ingress / edge proxy routes on. */
export const API_PREFIX_IDENTITY = '/api/identity';
export const API_PREFIX_LEARNING = '/api/learning';

/** `iss` / `aud` of access tokens. Services reject tokens with other values. */
export const TOKEN_ISSUER = 'cka-lab/ms-identity';
export const TOKEN_AUDIENCE = 'cka-lab';

export type Role = 'ADMIN' | 'STUDENT';
export const ROLES: readonly Role[] = ['ADMIN', 'STUDENT'] as const;

/** Claims carried by the access JWT. Kept small: it travels on every request. */
export interface AccessTokenClaims {
  /** User id (uuid). */
  sub: string;
  /** Session id (uuid) — lets a service correlate logs with a login session. */
  sid: string;
  email: string;
  name: string;
  role: Role;
}

/** What services attach to the request after verifying the access token. */
export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AcceptInviteRequest {
  token: string;
  password: string;
  displayName?: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Returned by GET /auth/token-info?token=… so the UI can greet the invitee. */
export interface TokenInfoResponse {
  type: 'INVITE' | 'PASSWORD_RESET';
  email: string;
  displayName: string;
  expiresAt: string;
}

/** Minimum password policy enforced by ms-identity (and mirrored in the UI). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
