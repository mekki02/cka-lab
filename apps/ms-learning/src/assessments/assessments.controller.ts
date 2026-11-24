import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '@cka/auth-kit';
import type {
  AuthenticatedUser,
  CheatsheetDto,
  ExamAttemptDto,
  ExamSummaryDto,
  ExamTaskStatus,
  LabDto,
  LabProgressDto,
  LabStatus,
  QuizAttemptDto,
  QuizDto,
  SubmitQuizRequest,
  UpdateExamTaskRequest,
  UpdateLabProgressRequest,
} from '@cka/contracts';
import { ContentService } from '../content/content.service';
import { ExamsService } from './exams.service';
import { LabsService } from './labs.service';
import { QuizzesService } from './quizzes.service';

class UpdateLabProgressDto implements UpdateLabProgressRequest {
  @ApiPropertyOptional() @IsOptional() @IsIn(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']) status?: LabStatus;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) completedTasks?: string[];
}

class SubmitQuizDto implements SubmitQuizRequest {
  @ApiProperty({ example: { q1: ['b'], q2: ['a', 'c'] } }) @IsObject() answers: Record<string, string[]>;
}

class UpdateExamTaskDto implements UpdateExamTaskRequest {
  @ApiPropertyOptional() @IsOptional() @IsIn(['TODO', 'FLAGGED', 'DONE']) status?: ExamTaskStatus;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) passedChecks?: string[];
}

/** Quiz answers arrive as free-form JSON; normalise to string arrays before grading. */
const sanitizeAnswers = (raw: Record<string, unknown>): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(raw)
      .slice(0, 200)
      .map(([k, v]) => [k, Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : []]),
  );

@ApiTags('labs, quizzes, exams, cheat sheets')
@Controller()
export class AssessmentsController {
  constructor(
    private readonly content: ContentService,
    private readonly labs: LabsService,
    private readonly quizzes: QuizzesService,
    private readonly exams: ExamsService,
  ) {}

  // --- Labs ---------------------------------------------------------------
  @Get('labs/progress')
  labProgress(@CurrentUser() u: AuthenticatedUser): Promise<LabProgressDto[]> {
    return this.labs.listProgress(u.id);
  }

  @Get('labs/:id')
  lab(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<{ lab: LabDto; progress: LabProgressDto | null }> {
    return this.labs.get(u.id, id);
  }

  @Post('labs/:id/tasks/:taskId/solution')
  @HttpCode(200)
  revealSolution(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('taskId') taskId: string) {
    return this.labs.revealSolution(u.id, id, taskId);
  }

  @Put('labs/:id/progress')
  updateLab(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLabProgressDto): Promise<LabProgressDto> {
    return this.labs.update(u.id, id, dto);
  }

  // --- Quizzes ------------------------------------------------------------
  @Get('quizzes/attempts')
  quizHistory(@CurrentUser() u: AuthenticatedUser): Promise<QuizAttemptDto[]> {
    return this.quizzes.history(u.id);
  }

  @Get('quizzes/attempts/:attemptId')
  async quizAttempt(@CurrentUser() u: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) id: string): Promise<QuizAttemptDto> {
    const a = await this.quizzes.attempt(u.id, id);
    if (!a) throw new NotFoundException('Attempt not found');
    return a;
  }

  @Get('quizzes/:id')
  quiz(@Param('id') id: string): QuizDto {
    return this.quizzes.get(id);
  }

  @Post('quizzes/:id/attempts')
  submitQuiz(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: SubmitQuizDto): Promise<QuizAttemptDto> {
    return this.quizzes.submit(u.id, id, sanitizeAnswers(dto.answers));
  }

  // --- Mock exams ---------------------------------------------------------
  @Get('exams')
  examList(): ExamSummaryDto[] {
    return this.exams.summaries();
  }

  @Get('exams/attempts')
  examHistory(@CurrentUser() u: AuthenticatedUser): Promise<ExamAttemptDto[]> {
    return this.exams.history(u.id);
  }

  @Post('exams/:id/attempts')
  startExam(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string): Promise<ExamAttemptDto> {
    return this.exams.start(u.id, id);
  }

  @Get('exams/attempts/:attemptId')
  examAttempt(@CurrentUser() u: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) id: string): Promise<ExamAttemptDto> {
    return this.exams.get(u.id, id);
  }

  @Patch('exams/attempts/:attemptId/tasks/:taskId')
  updateExamTask(
    @CurrentUser() u: AuthenticatedUser,
    @Param('attemptId', ParseUUIDPipe) id: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateExamTaskDto,
  ): Promise<ExamAttemptDto> {
    return this.exams.updateTask(u.id, id, taskId, dto);
  }

  @Post('exams/attempts/:attemptId/submit')
  @HttpCode(200)
  submitExam(@CurrentUser() u: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) id: string): Promise<ExamAttemptDto> {
    return this.exams.submit(u.id, id);
  }

  // --- Cheat sheets -------------------------------------------------------
  @Get('cheatsheets')
  cheatsheets(): CheatsheetDto[] {
    return this.content.cheatsheets;
  }
}
