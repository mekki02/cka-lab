import type { GradedQuestion } from '@cka/contracts';
import type { Exam, Quiz } from '../content/schemas';
import type { ExamTaskStates } from './assessment.entities';

/**
 * Pure grading functions — no I/O, so they are trivial to unit test.
 */

/**
 * A question scores 1 only if the selected set equals the correct set
 * exactly. Partial selections on multiple-answer questions score 0: the
 * real exam does not reward "half a NetworkPolicy" either.
 */
export const gradeQuiz = (
  quiz: Quiz,
  answers: Record<string, string[]>,
): { score: number; maxScore: number; results: GradedQuestion[] } => {
  const results = quiz.questions.map(q => {
    const selected = [...new Set(answers[q.id] ?? [])].filter(id => q.options.some(o => o.id === id)).sort();
    const correctOptions = q.options.filter(o => o.correct).map(o => o.id).sort();
    const correct = selected.length === correctOptions.length && selected.every((id, i) => id === correctOptions[i]);
    return {
      questionId: q.id,
      correct,
      selected,
      correctOptions,
      explanation: q.explanation,
      optionExplanations: Object.fromEntries(q.options.map(o => [o.id, o.explanation])),
    };
  });
  return { score: results.filter(r => r.correct).length, maxScore: quiz.questions.length, results };
};

/**
 * Mock exam score: each task is worth `points`, split evenly across its
 * checks; a check counts when the student confirmed it passes. Mirrors how
 * the real exam awards partial credit per verified outcome.
 *
 * Self-reported: the platform does not run the checks against the student's
 * cluster. The UI labels the result accordingly.
 */
export const scoreExam = (exam: Exam, states: ExamTaskStates): { score: number; maxScore: number } => {
  let score = 0;
  let maxScore = 0;
  for (const task of exam.tasks) {
    maxScore += task.points;
    const passed = new Set(states[task.id]?.passedChecks ?? []);
    const ok = task.checks.filter(c => passed.has(c.id)).length;
    score += (task.points * ok) / task.checks.length;
  }
  return { score: Math.round(score), maxScore };
};

export const percent = (score: number, max: number): number => (max === 0 ? 0 : Math.round((score / max) * 100));
