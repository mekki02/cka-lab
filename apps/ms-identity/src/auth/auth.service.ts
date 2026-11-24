import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { TokenInfoResponse } from '@cka/contracts';
import { User } from '../users/user.entity';
import { normalizeEmail } from './crypto.util';
import { KeysService } from './keys.service';
import { OneTimeTokensService } from './one-time-tokens.service';
import { PasswordService } from './password.service';
import { SessionsService, type ClientMeta } from './sessions.service';
import { newCsrfToken } from '@cka/auth-kit';

export interface SignedIn {
  user: User;
  accessToken: string;
  /** Absent when a concurrent refresh already rotated the refresh token. */
  refreshToken?: string;
  refreshExpires?: Date;
  csrfToken: string;
}

/** One message for every login failure: never reveal which part was wrong. */
const BAD_CREDENTIALS = 'Invalid email or password';
const BAD_LINK = 'This link is invalid or has expired. Ask an administrator for a new one.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly keys: KeysService,
    private readonly tokens: OneTimeTokensService,
  ) {}

  private async signIn(user: User, meta: ClientMeta): Promise<SignedIn> {
    const { session, refreshToken } = await this.sessions.create(user, meta);
    await this.users.update({ id: user.id }, { lastLoginAt: new Date() });
    return {
      user,
      accessToken: await this.accessTokenFor(user, session.id),
      refreshToken,
      refreshExpires: session.expiresAt,
      csrfToken: newCsrfToken(),
    };
  }

  private accessTokenFor(user: User, sessionId: string): Promise<string> {
    return this.keys.signAccessToken({
      sub: user.id,
      sid: sessionId,
      email: user.email,
      name: user.displayName,
      role: user.role,
    });
  }

  private findWithPassword(where: { id: string } | { email: string }): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where(where)
      .getOne();
  }

  async login(email: string, password: string, meta: ClientMeta): Promise<SignedIn> {
    const user = await this.findWithPassword({ email: normalizeEmail(email) });
    const ok = await this.passwords.verify(user?.passwordHash, password);
    if (!user || !ok || user.status !== 'ACTIVE') {
      this.logger.log(`Failed login for ${normalizeEmail(email)} from ${meta.ip ?? 'unknown'}`);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    if (user.passwordHash && this.passwords.needsRehash(user.passwordHash)) {
      await this.users.update({ id: user.id }, { passwordHash: await this.passwords.hash(password) });
    }
    return this.signIn(user, meta);
  }

  /**
   * Exchanges a refresh token for a new access token. The user row is re-read
   * every time, so a role change or deactivation takes effect here — at most
   * ACCESS_TOKEN_TTL_SECONDS after it was made.
   */
  async refresh(rawRefresh: string | undefined, csrfToken: string): Promise<SignedIn> {
    if (!rawRefresh) throw new UnauthorizedException('Not signed in');
    const outcome = await this.sessions.refresh(rawRefresh);
    if (outcome.kind === 'invalid') throw new UnauthorizedException('Session expired');

    const user = outcome.session.user;
    if (!user || user.status !== 'ACTIVE') {
      await this.sessions.revoke(rawRefresh);
      throw new UnauthorizedException('Account is not active');
    }

    const accessToken = await this.accessTokenFor(user, outcome.session.id);
    return outcome.kind === 'rotated'
      ? { user, accessToken, refreshToken: outcome.refreshToken, refreshExpires: outcome.session.expiresAt, csrfToken }
      : { user, accessToken, csrfToken };
  }

  logout(rawRefresh: string | undefined): Promise<void> {
    return this.sessions.revoke(rawRefresh);
  }

  async me(userId: string): Promise<User> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
    return user;
  }

  async tokenInfo(raw: string): Promise<TokenInfoResponse> {
    const token = await this.tokens.findValid(raw);
    if (!token?.user || token.user.status === 'DISABLED') throw new BadRequestException(BAD_LINK);
    return {
      type: token.type,
      email: token.user.email,
      displayName: token.user.displayName,
      expiresAt: token.expiresAt.toISOString(),
    };
  }

  /** Invitation accepted: set the password, activate, and sign in. All or nothing. */
  async acceptInvite(raw: string, password: string, displayName: string | undefined, meta: ClientMeta): Promise<SignedIn> {
    const hash = await this.passwords.hash(password);
    const user = await this.db.transaction(async manager => {
      const token = await this.tokens.findValid(raw, manager);
      if (!token?.user || token.type !== 'INVITE' || token.user.status !== 'INVITED') {
        throw new BadRequestException(BAD_LINK);
      }
      await this.tokens.consume(token, manager);
      const u = token.user;
      u.passwordHash = hash;
      u.status = 'ACTIVE';
      if (displayName?.trim()) u.displayName = displayName.trim();
      return manager.getRepository(User).save(u);
    });
    this.logger.log(`Invitation accepted by ${user.email}`);
    return this.signIn(user, meta);
  }

  /** Password reset: every existing session is revoked, then a fresh one is created. */
  async resetPassword(raw: string, password: string, meta: ClientMeta): Promise<SignedIn> {
    const hash = await this.passwords.hash(password);
    const user = await this.db.transaction(async manager => {
      const token = await this.tokens.findValid(raw, manager);
      if (!token?.user || token.type !== 'PASSWORD_RESET' || token.user.status !== 'ACTIVE') {
        throw new BadRequestException(BAD_LINK);
      }
      await this.tokens.consume(token, manager);
      await manager.getRepository(User).update({ id: token.user.id }, { passwordHash: hash });
      return token.user;
    });
    await this.sessions.revokeAllForUser(user.id);
    this.logger.log(`Password reset completed for ${user.email}`);
    return this.signIn(user, meta);
  }

  /** Signs out every *other* device, keeps the current session. */
  async changePassword(userId: string, sessionId: string, current: string, next: string): Promise<void> {
    const user = await this.findWithPassword({ id: userId });
    if (!user || !(await this.passwords.verify(user.passwordHash, current))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.users.update({ id: userId }, { passwordHash: await this.passwords.hash(next) });
    await this.sessions.revokeAllForUser(userId, sessionId);
  }
}
