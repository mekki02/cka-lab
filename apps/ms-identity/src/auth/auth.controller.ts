import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public, SkipCsrf, newCsrfToken } from '@cka/auth-kit';
import {
  COOKIE_CSRF,
  COOKIE_REFRESH_TOKEN,
  type AuthenticatedUser,
  type TokenInfoResponse,
  type UserDto,
} from '@cka/contracts';
import { Env } from '../config/env';
import { toUserDto } from '../users/user.entity';
import { AcceptInviteDto, ChangePasswordDto, LoginDto, ResetPasswordDto } from './auth.dto';
import { AuthService, type SignedIn } from './auth.service';
import { clearSessionCookies, setSessionCookies } from './cookies';
import type { ClientMeta } from './sessions.service';

/**
 * Per-IP limit on endpoints that guess at secrets (passwords, link tokens).
 * Read at import time because decorators are static.
 */
const AUTH_LIMIT = { default: { limit: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10), ttl: 60_000 } };

const metaOf = (req: Request): ClientMeta => ({ ip: req.ip, userAgent: req.get('user-agent') });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly env: Env,
  ) {}

  private get secure(): boolean {
    return this.env.COOKIE_SECURE;
  }

  private respond(res: Response, s: SignedIn): UserDto {
    setSessionCookies(
      res,
      {
        accessToken: s.accessToken,
        accessTtlSeconds: this.env.ACCESS_TOKEN_TTL_SECONDS,
        refreshToken: s.refreshToken,
        refreshExpires: s.refreshExpires,
        csrfToken: s.csrfToken,
      },
      this.secure,
    );
    return toUserDto(s.user);
  }

  @Public()
  @SkipCsrf()
  @Throttle(AUTH_LIMIT)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<UserDto> {
    return this.respond(res, await this.auth.login(dto.email, dto.password, metaOf(req)));
  }

  /** Public because the access token may already be expired; the refresh cookie is the credential. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<UserDto> {
    const csrf = (req.cookies?.[COOKIE_CSRF] as string | undefined) ?? newCsrfToken();
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[COOKIE_REFRESH_TOKEN], csrf));
    } catch (err) {
      clearSessionCookies(res, this.secure);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[COOKIE_REFRESH_TOKEN]);
    clearSessionCookies(res, this.secure);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return toUserDto(await this.auth.me(user.id));
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Get('token-info')
  tokenInfo(@Query('token') token: string): Promise<TokenInfoResponse> {
    return this.auth.tokenInfo(String(token ?? ''));
  }

  @Public()
  @SkipCsrf()
  @Throttle(AUTH_LIMIT)
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    return this.respond(res, await this.auth.acceptInvite(dto.token, dto.password, dto.displayName, metaOf(req)));
  }

  @Public()
  @SkipCsrf()
  @Throttle(AUTH_LIMIT)
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    return this.respond(res, await this.auth.resetPassword(dto.token, dto.password, metaOf(req)));
  }

  @Throttle(AUTH_LIMIT)
  @Post('change-password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto): Promise<void> {
    await this.auth.changePassword(user.id, user.sessionId, dto.currentPassword, dto.newPassword);
  }
}
