import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository, type EntityManager } from 'typeorm';
import { Env } from '../config/env';
import { User } from '../users/user.entity';
import { UserToken, type UserTokenType } from './user-token.entity';
import { randomSecret, sha256 } from './crypto.util';

/** Path on the web app that consumes each kind of link. */
const LINK_PATHS: Record<UserTokenType, string> = {
  INVITE: '/accept-invite',
  PASSWORD_RESET: '/reset-password',
};

@Injectable()
export class OneTimeTokensService {
  constructor(
    @InjectRepository(UserToken) private readonly tokens: Repository<UserToken>,
    private readonly env: Env,
  ) {}

  /**
   * Issues a fresh link and invalidates any earlier unused link of the same
   * type for that user, so only the most recent link works.
   *
   * The token travels in the URL *fragment* (`#token=…`): browsers never send
   * fragments to servers, so it stays out of access logs, proxies and
   * Referer headers.
   */
  async issue(
    user: User,
    type: UserTokenType,
    createdBy: string | null,
    manager: EntityManager = this.tokens.manager,
  ): Promise<{ link: string; expiresAt: Date }> {
    const repo = manager.getRepository(UserToken);
    await repo.update({ userId: user.id, type, usedAt: IsNull() }, { usedAt: new Date() });

    const raw = randomSecret();
    const hours = type === 'INVITE' ? this.env.INVITE_TTL_HOURS : this.env.RESET_TTL_HOURS;
    const expiresAt = new Date(Date.now() + hours * 3_600_000);
    await repo.insert({ userId: user.id, type, tokenHash: sha256(raw), expiresAt, createdBy });

    const base = this.env.PUBLIC_URL.replace(/\/+$/, '');
    return { link: `${base}${LINK_PATHS[type]}#token=${raw}`, expiresAt };
  }

  /** Finds a usable (unused, unexpired) token; does not consume it. */
  findValid(raw: string, manager: EntityManager = this.tokens.manager): Promise<UserToken | null> {
    return manager.getRepository(UserToken).findOne({
      where: { tokenHash: sha256(raw), usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      relations: { user: true },
    });
  }

  async consume(token: UserToken, manager: EntityManager): Promise<void> {
    await manager.getRepository(UserToken).update({ id: token.id }, { usedAt: new Date() });
  }
}
