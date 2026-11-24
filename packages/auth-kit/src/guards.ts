import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { COOKIE_ACCESS_TOKEN, COOKIE_CSRF, HEADER_CSRF, type Role } from '@cka/contracts';
import { IS_PUBLIC_KEY, ROLES_KEY, SKIP_CSRF_KEY, type RequestWithUser } from './decorators';
import { InvalidTokenError, TokenVerifier } from './token-verifier';
import { csrfTokensMatch, SAFE_METHODS } from './csrf';

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');

type Req = Request & RequestWithUser & { cookies?: Record<string, string> };

const flag = (reflector: Reflector, key: string, ctx: ExecutionContext): boolean =>
  reflector.getAllAndOverride<boolean>(key, [ctx.getHandler(), ctx.getClass()]) === true;

/**
 * Rejects state-changing requests whose CSRF header does not match the CSRF
 * cookie. Runs first, before any session work.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Req>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (flag(this.reflector, SKIP_CSRF_KEY, ctx)) return true;

    if (!csrfTokensMatch(req.cookies?.[COOKIE_CSRF], req.headers[HEADER_CSRF])) {
      throw new ForbiddenException('Missing or invalid CSRF token');
    }
    return true;
  }
}

/** Requires a valid access token on every route not marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    if (flag(this.reflector, IS_PUBLIC_KEY, ctx)) return true;

    const req = ctx.switchToHttp().getRequest<Req>();
    const token = req.cookies?.[COOKIE_ACCESS_TOKEN];
    if (!token) throw new UnauthorizedException('Not signed in');

    try {
      req.user = await this.verifier.verify(token);
      return true;
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        this.logger.debug(`Rejected access token: ${err.message}`);
        throw new UnauthorizedException('Session expired or invalid');
      }
      // JWKS unreachable etc. — a server problem, not the client's.
      this.logger.error(`Token verification failed: ${(err as Error).message}`);
      throw err;
    }
  }
}

/** Enforces @Roles(). Runs after AuthGuard, so req.user is set. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<Req>().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
