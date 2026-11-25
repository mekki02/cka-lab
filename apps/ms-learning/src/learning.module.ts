import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrentUser } from '@cka/auth-kit';
import type { AuthenticatedUser, DashboardDto } from '@cka/contracts';
import { AssessmentsController } from './assessments/assessments.controller';
import { ExamAttempt, ExerciseProgress, LabProgress, QuizAttempt } from './assessments/assessment.entities';
import { ExamsService } from './assessments/exams.service';
import { ExercisesController } from './assessments/exercises.controller';
import { ExercisesService } from './assessments/exercises.service';
import { LabsService } from './assessments/labs.service';
import { QuizzesService } from './assessments/quizzes.service';
import { ContentService } from './content/content.service';
import { DashboardService } from './dashboard/dashboard.service';
import { ProgressController } from './progress/progress.controller';
import { Bookmark, LessonProgress, LessonVisit } from './progress/progress.entities';
import { ProgressService } from './progress/progress.service';

@ApiTags('dashboard')
@Controller('dashboard')
class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<DashboardDto> {
    return this.dashboard.forUser(user.id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([LessonProgress, LessonVisit, Bookmark, LabProgress, QuizAttempt, ExamAttempt, ExerciseProgress])],
  controllers: [ProgressController, AssessmentsController, ExercisesController, DashboardController],
  providers: [ContentService, ProgressService, LabsService, ExercisesService, QuizzesService, ExamsService, DashboardService],
})
export class LearningModule {}
