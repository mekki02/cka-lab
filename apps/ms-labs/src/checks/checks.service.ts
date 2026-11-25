import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckResultDto, ExerciseCheckResultDto, ExerciseValidationDto, ValidateExerciseRequest, VerifyResultDto } from '@cka/contracts';
import { KubeService } from '../kube/kube.service';
import { ANN, CHECKER_CONTAINER, TOOLBOX_POD } from '../sessions/model';
import { SessionsService } from '../sessions/sessions.service';
import type { ExerciseCheck } from '../content/exercises';
import { loadedExercise } from '../sessions/model';
import { checkOutput, clip, evaluateCheck, parseVerifyOutput, type ExecResult } from './evaluate';
import { compareValue, historyMatches, shellQuote, stripAnsi, studentFile } from './exercise-grading';

/** Bounds on what the browser may send. */
const MAX_ANSWER = 2_000;
const MAX_TERMINAL = 64_000;

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

  // --- Exercises -----------------------------------------------------------

  /**
   * Grades the exercise loaded in the user's playground. Every command comes
   * from the content; answers and terminal text are only compared in Node.
   */
  async validateExercise(userId: string, req: ValidateExerciseRequest): Promise<ExerciseValidationDto> {
    const ns = await this.sessions.requireReady(userId);
    const namespace = ns.metadata!.name!;
    const loaded = loadedExercise(ns.metadata?.annotations ?? {});
    if (!loaded || loaded.id !== req.exerciseId) throw new ConflictException('This exercise is not loaded in your environment');
    if (loaded.state !== 'Ready') throw new ConflictException('The exercise is still loading');
    const exercise = this.sessions.exercise(req.exerciseId);

    const answers = req.answers ?? {};
    const terminal = stripAnsi((req.terminal ?? '').slice(-MAX_TERMINAL));
    const run = (script: string): Promise<ExecResult> => this.kube.run(namespace, TOOLBOX_POD, CHECKER_CONTAINER, script, 30);
    const expected = new Map<string, Promise<ExecResult>>();
    const expectedValue = async (c: { expect?: string; expectCommand?: string }): Promise<string | null> => {
      if (c.expect !== undefined) return c.expect;
      const cmd = c.expectCommand!;
      if (!expected.has(cmd)) expected.set(cmd, run(cmd));
      const r = await expected.get(cmd)!;
      return r.exitCode === 0 && !r.timedOut ? r.stdout.trim() : null;
    };
    // Only commands typed since the exercise was loaded count (not those of earlier exercises).
    const offset = Number.parseInt(ns.metadata?.annotations?.[ANN.exerciseHistoryOffset] ?? '0', 10) || 0;
    const file = shellQuote(studentFile('.bash_history'));
    let history: Promise<string> | undefined;
    const readHistory = () =>
      (history ??= run(
        // A history shorter than the offset was truncated (bash rewrites it on exit): read it all.
        `n=$(wc -l < ${file} 2>/dev/null || echo 0); if [ "$n" -ge ${offset} ]; then tail -n +${offset + 1} ${file}; else cat ${file}; fi | tail -n 3000`,
      ).then(r => r.stdout));

    const grade = async (c: ExerciseCheck): Promise<ExerciseCheckResultDto> => {
      const result = (passed: boolean, output = '') => ({ checkId: c.id, passed, output });
      switch (c.type) {
        case 'cluster': {
          const r = await run(c.command);
          const ok =
            c.match === 'success' ? r.exitCode === 0 && !r.timedOut : r.exitCode === 0 && !r.timedOut && compareValue(r.stdout, c.expect, c.match);
          return result(ok, checkOutput(r));
        }
        case 'answer': {
          const given = String(answers[c.input] ?? '').slice(0, MAX_ANSWER);
          if (!given.trim()) return result(false, 'No answer given.');
          const want = await expectedValue(c);
          if (want === null) return result(false, 'Could not read the expected value from your cluster. Did something get deleted?');
          const ok = c.match !== 'success' && compareValue(given, want, c.match, { caseSensitive: c.caseSensitive });
          return result(ok, ok ? '' : 'Not the expected answer.');
        }
        case 'file': {
          const file = await run(`cat -- ${shellQuote(studentFile(c.path))}`);
          if (file.exitCode !== 0) return result(false, `~/${c.path} does not exist or cannot be read.`);
          const want = await expectedValue(c);
          if (want === null) return result(false, 'Could not compute the expected content from your cluster.');
          const ok = c.match !== 'success' && compareValue(file.stdout, want, c.match);
          return result(ok, clip(file.stdout.trim() || '(empty file)', 15, 1500));
        }
        case 'history': {
          const ok = historyMatches(await readHistory(), c.expect);
          return result(ok, ok ? '' : 'No matching command in your shell history.');
        }
        case 'terminal': {
          const ok = c.match !== 'success' && compareValue(terminal, c.expect, c.match === 'regex' ? 'regex' : 'contains');
          return result(ok, ok ? '' : 'Not found in your terminal. Run the command so its output is on screen, then validate.');
        }
      }
    };

    // Sequential: checks are cheap, and parallel execs would compete for the checker's 256 MiB.
    const results: ExerciseCheckResultDto[] = [];
    for (const c of exercise.checks) results.push(await grade(c));
    void this.sessions.touch(namespace);
    return { exerciseId: exercise.id, passed: results.every(r => r.passed), results, checkedAt: new Date().toISOString() };
  }
}
