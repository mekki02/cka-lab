import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { OneTimeLinkResponse, Role, UpdateUserRequest } from '@cka/contracts';
import { normalizeEmail } from '../auth/crypto.util';
import { OneTimeTokensService } from '../auth/one-time-tokens.service';
import { SessionsService } from '../auth/sessions.service';
import { toUserDto, User } from './user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly tokens: OneTimeTokensService,
    private readonly sessions: SessionsService,
  ) {}

  list(): Promise<User[]> {
    return this.users.find({ order: { createdAt: 'ASC' } });
  }

  async get(id: string): Promise<User> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Creates an INVITED account and returns its one-time invitation link.
   * Used by the admin UI and by the `create-admin` CLI command.
   */
  async invite(
    input: { email: string; displayName: string; role: Role },
    createdBy: string | null,
  ): Promise<OneTimeLinkResponse> {
    const email = normalizeEmail(input.email);
    return this.db.transaction(async manager => {
      const repo = manager.getRepository(User);
      if (await repo.existsBy({ email })) throw new ConflictException('A user with this email already exists');
      const user = await repo.save(
        repo.create({ email, displayName: input.displayName.trim(), role: input.role, status: 'INVITED', passwordHash: null, lastLoginAt: null }),
      );
      const { link, expiresAt } = await this.tokens.issue(user, 'INVITE', createdBy, manager);
      this.logger.log(`Invited ${email} as ${input.role}`);
      return { user: toUserDto(user), link, expiresAt: expiresAt.toISOString() };
    });
  }

  async reissueInvite(id: string, createdBy: string | null): Promise<OneTimeLinkResponse> {
    const user = await this.get(id);
    if (user.status !== 'INVITED') throw new ConflictException('User has already accepted the invitation');
    const { link, expiresAt } = await this.tokens.issue(user, 'INVITE', createdBy);
    return { user: toUserDto(user), link, expiresAt: expiresAt.toISOString() };
  }

  async issueResetLink(id: string, createdBy: string | null): Promise<OneTimeLinkResponse> {
    const user = await this.get(id);
    if (user.status !== 'ACTIVE') throw new ConflictException('Only active users can reset their password');
    const { link, expiresAt } = await this.tokens.issue(user, 'PASSWORD_RESET', createdBy);
    this.logger.log(`Password reset link issued for ${user.email}`);
    return { user: toUserDto(user), link, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Admin edits. Two guard rails:
   *  - an admin cannot change their own role or status (no accidental self-lockout);
   *  - the last active admin cannot be demoted or disabled.
   */
  async update(id: string, patch: UpdateUserRequest, actorId: string): Promise<User> {
    const user = await this.get(id);
    const changesAccess = (patch.role && patch.role !== user.role) || (patch.status && patch.status !== user.status);

    if (changesAccess && id === actorId) {
      throw new BadRequestException('You cannot change your own role or status');
    }
    if (patch.status === 'ACTIVE' && user.status === 'INVITED') {
      throw new ConflictException('This user has not accepted the invitation yet; send a new invitation link instead');
    }

    const losesAdmin =
      user.role === 'ADMIN' &&
      user.status === 'ACTIVE' &&
      ((patch.role && patch.role !== 'ADMIN') || patch.status === 'DISABLED');
    if (losesAdmin) {
      const activeAdmins = await this.users.countBy({ role: 'ADMIN', status: 'ACTIVE' });
      if (activeAdmins <= 1) throw new ConflictException('At least one active administrator is required');
    }

    if (patch.displayName !== undefined) user.displayName = patch.displayName.trim();
    if (patch.role) user.role = patch.role;
    if (patch.status) user.status = patch.status;
    const saved = await this.users.save(user);

    if (patch.status === 'DISABLED') {
      const n = await this.sessions.revokeAllForUser(id);
      this.logger.log(`Disabled ${user.email}; revoked ${n} session(s)`);
    }
    return saved;
  }

  revokeSessions(id: string): Promise<number> {
    return this.sessions.revokeAllForUser(id);
  }

  countAdmins(): Promise<number> {
    return this.users.countBy({ role: 'ADMIN' });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: normalizeEmail(email) });
  }
}
