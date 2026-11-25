import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ExerciseDetailDto, ExerciseDto, ExerciseProgressDto } from '@cka/contracts';
import { ContentService } from '../content/content.service';
import type { Exercise } from '../content/schemas';
import { ExerciseProgress } from './assessment.entities';

const toProgressDto = (p: ExerciseProgress): ExerciseProgressDto => ({
  exerciseId: p.exerciseId,
  status: p.status,
  attempts: p.attempts,
  solutionRevealed: p.solutionRevealed,
  completedAt: p.completedAt?.toISOString() ?? null,
  updatedAt: p.updatedAt.toISOString(),
});

/**
 * Exercise statements and progress. Grading happens in ms-labs, against the
 * student's cluster; this service never sees the cluster and never serves
 * expected values (`expect`, `expectCommand`, `autotest`).
 */
@Injectable()
export class ExercisesService {
  constructor(
    @InjectRepository(ExerciseProgress) private readonly progress: Repository<ExerciseProgress>,
    private readonly content: ContentService,
  ) {}

  toDto(e: Exercise, solutionRevealed: boolean): ExerciseDto {
    return {
      ...ContentService.exerciseSummary(e),
      statement: e.statement,
      namespaces: e.namespaces,
      files: e.files.map(f => `${e.id}/${f.path}`),
      inputs: e.inputs.map(i => ({ id: i.id, label: i.label, kind: i.kind, placeholder: i.placeholder ?? null, options: i.options })),
      checks: e.checks.map(c => ({ id: c.id, description: c.description, type: c.type })),
      hints: e.hints,
      solution: solutionRevealed ? e.solution : null,
      setup: e.setup,
    };
  }

  async listProgress(userId: string): Promise<ExerciseProgressDto[]> {
    return (await this.progress.find({ where: { userId } })).map(toProgressDto);
  }

  async completedIds(userId: string): Promise<Set<string>> {
    const rows = await this.progress.find({ where: { userId, status: 'COMPLETED' }, select: { exerciseId: true } });
    return new Set(rows.map(r => r.exerciseId));
  }

  async get(userId: string, exerciseId: string): Promise<ExerciseDetailDto> {
    const e = this.content.exercise(exerciseId);
    const p = await this.progress.findOneBy({ userId, exerciseId });
    const all = this.content.exercises;
    const i = all.findIndex(x => x.id === e.id);
    return {
      exercise: this.toDto(e, p?.solutionRevealed ?? false),
      progress: p ? toProgressDto(p) : null,
      nextId: all[i + 1]?.id ?? null,
      previousId: all[i - 1]?.id ?? null,
    };
  }

  private async load(userId: string, exerciseId: string): Promise<ExerciseProgress> {
    return (
      (await this.progress.findOneBy({ userId, exerciseId })) ??
      this.progress.create({ userId, exerciseId, status: 'IN_PROGRESS', attempts: 0, solutionRevealed: false, completedAt: null })
    );
  }

  async revealSolution(userId: string, exerciseId: string): Promise<{ solution: string }> {
    const e = this.content.exercise(exerciseId);
    const p = await this.load(userId, exerciseId);
    p.solutionRevealed = true;
    p.updatedAt = new Date();
    await this.progress.save(p);
    return { solution: e.solution };
  }

  /**
   * The web app reports each Validate. Completion is never undone by a
   * later failing attempt (students re-run exercises to practise).
   */
  async recordAttempt(userId: string, exerciseId: string, passed: boolean): Promise<ExerciseProgressDto> {
    this.content.exercise(exerciseId);
    const p = await this.load(userId, exerciseId);
    p.attempts += 1;
    if (passed && p.status !== 'COMPLETED') {
      p.status = 'COMPLETED';
      p.completedAt = new Date();
    }
    p.updatedAt = new Date();
    return toProgressDto(await this.progress.save(p));
  }

  async reset(userId: string, exerciseId: string): Promise<void> {
    this.content.exercise(exerciseId);
    await this.progress.delete({ userId, exerciseId });
  }
}
