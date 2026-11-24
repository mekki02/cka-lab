import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe. Used for refresh secrets and one-time links. */
export const randomSecret = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/**
 * SHA-256 is right for *random* secrets (refresh tokens, invite tokens): they
 * have full entropy, so a fast hash is enough and lets us look them up by
 * hash. Passwords are different — low entropy — and use argon2id instead.
 */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
