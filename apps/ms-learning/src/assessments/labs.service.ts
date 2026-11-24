import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { LabDto, LabProgressDto, UpdateLabProgressRequest } from '@cka/contracts';
import { ContentService } from '../content/content.service';
import type { Lab } from '../content/schemas';
import { LabProgress } from './assessment.entities';

const toProgressDto = (p: LabProgress): LabProgressDto => ({
  labId: p.labId,
  status: p.status,
  completedTasks: p.completedTasks,
  revealedSolutions: p.revealedSolutions,
  updatedAt: p.updatedAt.toISOString(),
});

@Injectable()
export class LabsService {
  constructor(
    @InjectRepository(LabProgress) private readonly progress: Repository<LabProgress>,
    private readonly content: ContentService,
  ) {}

  /**
   * Solutions are withheld until the student explicitly asks for one. That
   * keeps challenge labs honest, and lets the platform record which tasks were
   * solved with help.
   */
  toDto(lab: Lab, revealed: string[]): LabDto {
    return {
      id: lab.id,
      title: lab.title,
      moduleId: lab.module,
      type: lab.type,
      difficulty: lab.difficulty,
      minutes: lab.minutes,
      environment: lab.environment,
      scenario: lab.scenario,
      objectives: lab.objectives,
      setup: lab.setup,
      tasks: lab.tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        hints: t.hints,
        checks: t.checks,
        solution: revealed.includes(t.id) ? t.solution : null,
      })),
      verifyScript: lab.verifyScript ?? null,
      reset: lab.reset,
    };
  }

  async listProgress(userId: string): Promise<LabProgressDto[]> {
    return (await this.progress.find({ where: { userId } })).map(toProgressDto);
  }

  async get(userId: string, labId: string): Promise<{ lab: LabDto; progress: LabProgressDto | null }> {
    const lab = this.content.lab(labId);
    const p = await this.progress.findOneBy({ userId, labId });
    return { lab: this.toDto(lab, p?.revealedSolutions ?? []), progress: p ? toProgressDto(p) : null };
  }

  private async load(userId: string, labId: string): Promise<LabProgress> {
    return (
      (await this.progress.findOneBy({ userId, labId })) ??
      this.progress.create({ userId, labId, status: 'IN_PROGRESS', completedTasks: [], revealedSolutions: [] })
    );
  }

  async revealSolution(userId: string, labId: string, taskId: string): Promise<{ solution: string }> {
    const task = this.content.lab(labId).tasks.find(t => t.id === taskId);
    if (!task) throw new NotFoundException(`Unknown task "${taskId}"`);
    const p = await this.load(userId, labId);
    if (!p.revealedSolutions.includes(taskId)) p.revealedSolutions = [...p.revealedSolutions, taskId];
    p.updatedAt = new Date();
    await this.progress.save(p);
    return { solution: task.solution };
  }

  async update(userId: string, labId: string, patch: UpdateLabProgressRequest): Promise<LabProgressDto> {
    const lab = this.content.lab(labId);
    const p = await this.load(userId, labId);
    if (patch.completedTasks) {
      const known = new Set(lab.tasks.map(t => t.id));
      const unknown = patch.completedTasks.filter(t => !known.has(t));
      if (unknown.length) throw new BadRequestException(`Unknown task(s): ${unknown.join(', ')}`);
      p.completedTasks = [...new Set(patch.completedTasks)];
    }
    if (patch.status) p.status = patch.status;
    else if (p.completedTasks.length === lab.tasks.length) p.status = 'COMPLETED';
    p.updatedAt = new Date();
    return toProgressDto(await this.progress.save(p));
  }
}
