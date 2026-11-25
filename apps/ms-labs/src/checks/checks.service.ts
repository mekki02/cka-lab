import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckResultDto, VerifyResultDto } from '@cka/contracts';
import { KubeService } from '../kube/kube.service';
import { ANN, CHECKER_CONTAINER, TOOLBOX_POD } from '../sessions/model';
import { SessionsService } from '../sessions/sessions.service';
import { checkOutput, evaluateCheck, parseVerifyOutput } from './evaluate';

/**
 * Server-side validation. Only commands written in the course content run —
 * never anything from the request — and they run in the `checker`
 * container, whose filesystem the student cannot modify.
 */
@Injectable()
export class ChecksService {
  constructor(
    private readonly sessions: SessionsService,
    private readonly kube: KubeService,
  ) {}

  private async labOf(userId: string) {
    const ns = await this.sessions.requireReady(userId);
    const labId = ns.metadata?.annotations?.[ANN.lab];
    if (!labId) throw new BadRequestException('The playground has no checks');
    return { namespace: ns.metadata!.name!, lab: this.sessions.lab(labId) };
  }

  async runTask(userId: string, taskId: string): Promise<CheckResultDto[]> {
    const { namespace, lab } = await this.labOf(userId);
    const task = lab.tasks.find(t => t.id === taskId);
    if (!task) throw new NotFoundException(`Unknown task "${taskId}"`);
    const auto = task.checks.filter(c => c.match);
    if (auto.length === 0) throw new BadRequestException('This task has no automatic checks');

    const results: CheckResultDto[] = [];
    for (const c of auto) {
      const r = await this.kube.run(namespace, TOOLBOX_POD, CHECKER_CONTAINER, c.command, 30);
      results.push({
        taskId,
        checkId: c.id,
        passed: evaluateCheck(c.match!, c.expect, r),
        output: checkOutput(r),
        checkedAt: new Date().toISOString(),
      });
    }
    await this.sessions.saveResults(namespace, results);
    void this.sessions.touch(namespace);
    return results;
  }

  async verify(userId: string): Promise<VerifyResultDto> {
    const { namespace, lab } = await this.labOf(userId);
    if (!lab.verifyScript) throw new BadRequestException('This lab has no verify script');
    const r = await this.kube.run(namespace, TOOLBOX_POD, CHECKER_CONTAINER, lab.verifyScript, 120);
    void this.sessions.touch(namespace);
    return parseVerifyOutput(r);
  }
}
