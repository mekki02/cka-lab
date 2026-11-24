import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import type { ExamTaskStatus, GradedQuestion, LabStatus } from '@cka/contracts';

@Entity({ name: 'lab_progress' })
export class LabProgress {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string;
  @PrimaryColumn({ name: 'lab_id', type: 'varchar', length: 120 }) labId: string;
  @Column({ type: 'varchar', length: 16 }) status: LabStatus;
  @Column({ name: 'completed_tasks', type: 'jsonb', default: () => "'[]'" }) completedTasks: string[];
  @Column({ name: 'revealed_solutions', type: 'jsonb', default: () => "'[]'" }) revealedSolutions: string[];
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity({ name: 'quiz_attempts' })
export class QuizAttempt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ name: 'quiz_id', type: 'varchar', length: 120 }) quizId: string;
  @Column({ type: 'int' }) score: number;
  @Column({ name: 'max_score', type: 'int' }) maxScore: number;
  @Column({ type: 'jsonb' }) answers: Record<string, string[]>;
  @Column({ type: 'jsonb' }) results: GradedQuestion[];
  @Column({ name: 'submitted_at', type: 'timestamptz' }) submittedAt: Date;
}

export type ExamTaskStates = Record<string, { status: ExamTaskStatus; passedChecks: string[] }>;

@Entity({ name: 'exam_attempts' })
export class ExamAttempt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ name: 'exam_id', type: 'varchar', length: 120 }) examId: string;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt: Date;
  @Column({ type: 'timestamptz' }) deadline: Date;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true }) submittedAt: Date | null;
  @Column({ name: 'task_states', type: 'jsonb' }) taskStates: ExamTaskStates;
  @Column({ type: 'int', nullable: true }) score: number | null;
  @Column({ name: 'max_score', type: 'int' }) maxScore: number;
}
