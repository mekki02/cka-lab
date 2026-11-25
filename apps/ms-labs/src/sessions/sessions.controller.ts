import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { CurrentUser } from '@cka/auth-kit';
import type {
  AuthenticatedUser,
  CheckResultDto,
  LabSessionDto,
  LabsInfoDto,
  StartLabSessionRequest,
  VerifyResultDto,
} from '@cka/contracts';
import { ChecksService } from '../checks/checks.service';
import { Env } from '../config/env';
import { SessionsService } from './sessions.service';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class StartSessionDto implements StartLabSessionRequest {
  @ApiPropertyOptional({ description: 'Omit for a playground' })
  @IsOptional()
  @Matches(ID)
  labId?: string;
}

/** One session per user, so every route is about "my session": no ids to guess. */
@ApiTags('lab sessions')
@Controller()
export class SessionsController {
  constructor(
    private readonly env: Env,
    private readonly sessions: SessionsService,
    private readonly checks: ChecksService,
  ) {}

  @Get('info')
  info(): LabsInfoDto {
    return {
      enabled: true,
      kubernetesVersion: this.env.LABS_KUBERNETES_VERSION,
      idleMinutes: this.env.LABS_IDLE_MINUTES,
      maxMinutes: this.env.LABS_MAX_MINUTES,
    };
  }

  @Get('session')
  async get(@CurrentUser() u: AuthenticatedUser): Promise<{ session: LabSessionDto | null }> {
    return { session: await this.sessions.get(u.id) };
  }

  @Post('session')
  @HttpCode(202)
  start(@CurrentUser() u: AuthenticatedUser, @Body() dto: StartSessionDto): Promise<LabSessionDto> {
    return this.sessions.start(u.id, dto.labId ?? null);
  }

  @Post('session/restart')
  @HttpCode(202)
  restart(@CurrentUser() u: AuthenticatedUser): Promise<LabSessionDto> {
    return this.sessions.restart(u.id);
  }

  @Delete('session')
  @HttpCode(204)
  end(@CurrentUser() u: AuthenticatedUser): Promise<void> {
    return this.sessions.end(u.id);
  }

  @Post('session/tasks/:taskId/checks')
  @HttpCode(200)
  runChecks(@CurrentUser() u: AuthenticatedUser, @Param('taskId') taskId: string): Promise<CheckResultDto[]> {
    return this.checks.runTask(u.id, taskId);
  }

  @Post('session/verify')
  @HttpCode(200)
  verify(@CurrentUser() u: AuthenticatedUser): Promise<VerifyResultDto> {
    return this.checks.verify(u.id);
  }
}
