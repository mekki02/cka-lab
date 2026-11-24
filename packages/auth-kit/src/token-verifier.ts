import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type KeyLike } from 'jose';
import {
  ROLES,
  TOKEN_AUDIENCE,
  TOKEN_ISSUER,
  type AuthenticatedUser,
  type Role,
} from '@cka/contracts';

/** Signing algorithm used by ms-identity. Ed25519: small keys, fast, no parameter footguns. */
export const ACCESS_TOKEN_ALG = 'EdDSA';

export type KeySource =
  /** Fetch the public keys from ms-identity's JWKS endpoint (other services). */
  | { jwksUrl: string }
  /** Verify with a key already in memory (ms-identity verifying its own tokens). */
  | { key: KeyLike | Uint8Array | JWTVerifyGetKey };

export class InvalidTokenError extends Error {}

/**
 * Verifies access tokens. Every service holds one; none of them can mint
 * tokens, because only ms-identity has the private key.
 *
 * With a remote JWKS, jose caches the key set and refetches only when it sees
 * an unknown `kid` (key rotation) — so a running service does not call
 * ms-identity per request, and keeps verifying while ms-identity is down.
 */
export class TokenVerifier {
  private readonly key: KeyLike | Uint8Array | JWTVerifyGetKey;

  constructor(source: KeySource) {
    this.key =
      'jwksUrl' in source
        ? createRemoteJWKSet(new URL(source.jwksUrl), {
            cooldownDuration: 30_000,
            cacheMaxAge: 10 * 60_000,
            timeoutDuration: 5_000,
          })
        : source.key;
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    try {
      const { payload } = await jwtVerify(token, this.key as JWTVerifyGetKey, {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        algorithms: [ACCESS_TOKEN_ALG],
        clockTolerance: 5,
      });

      const { sub, sid, email, name, role } = payload as Record<string, unknown>;
      if (
        typeof sub !== 'string' ||
        typeof sid !== 'string' ||
        typeof email !== 'string' ||
        typeof name !== 'string' ||
        !ROLES.includes(role as Role)
      ) {
        throw new InvalidTokenError('Token is missing required claims');
      }
      return { id: sub, sessionId: sid, email, name, role: role as Role };
    } catch (err) {
      if (err instanceof InvalidTokenError) throw err;
      // Expired, bad signature, wrong issuer… The reason is for logs, never
      // for the client: it would help an attacker tune forged tokens.
      throw new InvalidTokenError((err as Error).message);
    }
  }
}
