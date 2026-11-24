import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CurrentUser } from '@cka/auth-kit';
import type { AuthenticatedUser, Curriculum, ProgressStatus, ProgressSummaryDto, UpdateLessonProgressRequest } from '@cka/contracts';
import { ContentService } from '../content/content.service';
import { ProgressService } from './progress.service';

const STATUSES: ProgressStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];

class UpdateLessonProgressDto implements UpdateLessonProgressRequest {
  @ApiProperty({ enum: STATUSES }) @IsIn(STATUSES) status: ProgressStatus;
}

@ApiTags('curriculum & progress')
@Controller()
export class ProgressController {
  constructor(
    private readonly content: ContentService,
    private readonly progress: ProgressService,
  ) {}

  @Get('curriculum')
  curriculum(): Curriculum {
    return this.content.curriculum;
  }

  @Get('progress')
  summary(@CurrentUser() user: AuthenticatedUser): Promise<ProgressSummaryDto> {
    return this.progress.summary(user.id);
  }

  @Put('progress/lessons/:lessonId')
  @HttpCode(204)
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonProgressDto,
  ): Promise<void> {
    return this.progress.setStatus(user.id, lessonId, dto.status);
  }

  @Post('progress/lessons/:lessonId/visit')
  @HttpCode(204)
  visit(@CurrentUser() user: AuthenticatedUser, @Param('lessonId') lessonId: string): Promise<void> {
    return this.progress.visit(user.id, lessonId);
  }

  @Put('bookmarks/:lessonId')
  @HttpCode(204)
  bookmark(@CurrentUser() user: AuthenticatedUser, @Param('lessonId') lessonId: string): Promise<void> {
    return this.progress.addBookmark(user.id, lessonId);
  }

  @Delete('bookmarks/:lessonId')
  @HttpCode(204)
  unbookmark(@CurrentUser() user: AuthenticatedUser, @Param('lessonId') lessonId: string): Promise<void> {
    return this.progress.removeBookmark(user.id, lessonId);
  }
}
