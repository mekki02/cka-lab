import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { timingSafeEqual } from 'node:crypto';
import { Env } from '../config/env';
import { User } from '../users/user.entity';
import { Session } from './session.entity';
import { randomSecret, sha256 } from './crypto.util';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  session: Session;
  /** `<session id>.<secret>` — goes into the HttpOnly refresh cookie. */
  refreshToken: string;
}

export type RefreshOutcome =
  | { kind: 'rotated'; session: Session; refreshToken: string }
  /** A concurrent request already rotated; the caller only needs a new access token. */
  | { kind: 'concurrent'; session: Session }
  | { kind: 'invalid' };

/** How long after a rotation the previous secret is still tolerated. */
const ROTATION_GRACE_MS = 60_000;

const hashesEqual = (a: string | null, b: string): boolean =>
  !!a && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly env: Env,
  ) {}

  private expiry(): Date {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }

  async create(user: User, meta: ClientMeta): Promise<IssuedSession> {
    const secret = randomSecret();
    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        refreshHash: sha256(secret),
        previousRefreshHash: null,
        rotatedAt: null,
        lastUsedAt: new Date(),
        expiresAt: this.expiry(),
        revokedAt: null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ip: meta.ip?.slice(0, 64) ?? null,
      }),
    );
    return { session, refreshToken: `${session.id}.${secret}` };
  }

  /**
   * Validates a refresh token and rotates it.
   *
   * Reuse detection: if someone presents a secret that was rotated away more
   * than ROTATION_GRACE_MS ago, either an attacker or the victim is holding a
   * stolen copy. We cannot tell which, so the whole session is revoked and
   * both have to log in again.
   */
  async refresh(raw: string): Promise<RefreshOutcome> {
    const [sessionId, secret] = raw.split('.');
    if (!sessionId || !secret || !/^[0-9a-f-]{36}$/i.test(sessionId)) return { kind: 'invalid' };

    const session = await this.sessions.findOne({ where: { id: sessionId }, relations: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return { kind: 'invalid' };

    const presented = sha256(secret);
    if (hashesEqual(session.refreshHash, presented)) {
      const next = randomSecret();
      session.previousRefreshHash = session.refreshHash;
      session.refreshHash = sha256(next);
      session.rotatedAt = new Date();
      session.lastUsedAt = new Date();
      session.expiresAt = this.expiry(); // sliding expiry while the user is active
      await this.sessions.save(session);
      return { kind: 'rotated', session, refreshToken: `${session.id}.${next}` };
    }

    if (hashesEqual(session.previousRefreshHash, presented)) {
      const age = Date.now() - (session.rotatedAt?.getTime() ?? 0);
      if (age <= ROTATION_GRACE_MS) return { kind: 'concurrent', session };
      this.logger.warn(`Refresh token reuse detected for session ${session.id}; revoking it`);
      await this.sessions.update({ id: session.id }, { revokedAt: new Date() });
    }
    return { kind: 'invalid' };
  }

  async revoke(raw: string | undefined): Promise<void> {
    const sessionId = raw?.split('.')[0];
    if (sessionId && /^[0-9a-f-]{36}$/i.test(sessionId)) {
      await this.sessions.update({ id: sessionId, revokedAt: IsNull() }, { revokedAt: new Date() });
    }
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.sessions.update(
      exceptSessionId
        ? { userId, revokedAt: IsNull(), id: Not(exceptSessionId) }
        : { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }
}
