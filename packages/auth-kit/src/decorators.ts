import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser, Role } from '@cka/contracts';

export const IS_PUBLIC_KEY = 'cka:isPublic';
export const ROLES_KEY = 'cka:roles';
export const SKIP_CSRF_KEY = 'cka:skipCsrf';

/** The route needs no session (login, health checks, JWKS…). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route or controller to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Exempt a state-changing route from the CSRF check. Only for routes that run
 * before a session (and so a CSRF cookie) exists: login, accept-invite,
 * reset-password. Those are rate limited instead.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

/** Express request after AuthGuard has run. */
export interface RequestWithUser {
  user?: AuthenticatedUser;
}

/** Inject the verified user: `@CurrentUser() user: AuthenticatedUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined =>
    ctx.switchToHttp().getRequest<RequestWithUser>().user,
);
