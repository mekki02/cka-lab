import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { CurrentUser } from '@cka/auth-kit';
import type {
  AuthenticatedUser,
  ExerciseDetailDto,
  ExerciseProgressDto,
  ExerciseSummaryDto,
  RecordExerciseAttemptRequest,
} from '@cka/contracts';
import { ContentService } from '../content/content.service';
import { ExercisesService } from './exercises.service';

class RecordAttemptDto implements RecordExerciseAttemptRequest {
  @ApiProperty() @IsBoolean() passed: boolean;
}

@ApiTags('exercises')
@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly content: ContentService,
    private readonly exercises: ExercisesService,
  ) {}

  /** Every exercise in course order. */
  @Get()
  list(): ExerciseSummaryDto[] {
    return this.content.exercises.map(ContentService.exerciseSummary);
  }

  @Get('progress')
  progress(@CurrentUser() u: AuthenticatedUser): Promise<ExerciseProgressDto[]> {
    return this.exercises.listProgress(u.id);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<ExerciseDetailDto> {
    return this.exercises.get(u.id, id);
  }

  @Post(':id/solution')
  @HttpCode(200)
  solution(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<{ solution: string }> {
    return this.exercises.revealSolution(u.id, id);
  }

  @Post(':id/attempts')
  @HttpCode(200)
  attempt(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: RecordAttemptDto): Promise<ExerciseProgressDto> {
    return this.exercises.recordAttempt(u.id, id, dto.passed);
  }

  @Delete(':id/progress')
  @HttpCode(204)
  reset(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.exercises.reset(u.id, id);
  }
}
