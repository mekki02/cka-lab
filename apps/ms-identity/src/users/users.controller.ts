import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@cka/auth-kit';
import type { AuthenticatedUser, OneTimeLinkResponse, UserDto } from '@cka/contracts';
import { toUserDto } from './user.entity';
import { InviteUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

/** Administration of accounts. Every route here is ADMIN-only. */
@ApiTags('users')
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(): Promise<UserDto[]> {
    return (await this.users.list()).map(toUserDto);
  }

  @Post()
  invite(@Body() dto: InviteUserDto, @CurrentUser() actor: AuthenticatedUser): Promise<OneTimeLinkResponse> {
    return this.users.invite(dto, actor.id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserDto> {
    return toUserDto(await this.users.update(id, dto, actor.id));
  }

  @Post(':id/invite-link')
  @HttpCode(200)
  reissueInvite(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<OneTimeLinkResponse> {
    return this.users.reissueInvite(id, actor.id);
  }

  @Post(':id/reset-link')
  @HttpCode(200)
  resetLink(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<OneTimeLinkResponse> {
    return this.users.issueResetLink(id, actor.id);
  }

  @Post(':id/revoke-sessions')
  @HttpCode(200)
  async revokeSessions(@Param('id', ParseUUIDPipe) id: string): Promise<{ revoked: number }> {
    return { revoked: await this.users.revokeSessions(id) };
  }
}
