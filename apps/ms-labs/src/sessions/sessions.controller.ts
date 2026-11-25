import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentUser } from '@cka/auth-kit';
import type {
  AuthenticatedUser,
  CheckResultDto,
  ExerciseValidationDto,
  LabSessionDto,
  LoadExerciseRequest,
  LabsInfoDto,
  StartLabSessionRequest,
  ValidateExerciseRequest,
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

  @ApiPropertyOptional({ description: 'Playground only: an exercise to load when ready' })
  @IsOptional()
  @Matches(ID)
  exerciseId?: string;
}

class LoadExerciseDto implements LoadExerciseRequest {
  @ApiProperty() @Matches(ID) exerciseId: string;
}

class ValidateExerciseDto implements ValidateExerciseRequest {
  @ApiProperty() @Matches(ID) exerciseId: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() answers?: Record<string, string>;
  /** The browser sends the recent terminal text; capped well above what checks need. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200_000) terminal?: string;
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
    return this.sessions.start(u.id, dto.labId ?? null, dto.exerciseId ?? null);
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

  /** Loads an exercise into the playground, or reloads it (its reset). */
  @Post('session/exercise')
  @HttpCode(202)
  loadExercise(@CurrentUser() u: AuthenticatedUser, @Body() dto: LoadExerciseDto): Promise<LabSessionDto> {
    return this.sessions.loadExercise(u.id, dto.exerciseId);
  }

  @Post('session/exercise/validate')
  @HttpCode(200)
  validateExercise(@CurrentUser() u: AuthenticatedUser, @Body() dto: ValidateExerciseDto): Promise<ExerciseValidationDto> {
    const answers = Object.fromEntries(
      Object.entries(dto.answers ?? {})
        .slice(0, 50)
        .filter(([k, v]) => ID.test(k) && typeof v === 'string'),
    );
    return this.checks.validateExercise(u.id, { exerciseId: dto.exerciseId, answers, terminal: dto.terminal });
  }
}
