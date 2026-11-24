import { gradeQuiz, percent, scoreExam } from './grading';
import type { Exam, Quiz } from '../content/schemas';

const quiz: Quiz = {
  id: 'q',
  title: 'Q',
  module: 'm',
  description: '',
  passPercent: 70,
  questions: [
    {
      id: 'single',
      type: 'single',
      prompt: 'p',
      explanation: 'e',
      options: [
        { id: 'a', text: 'A', correct: false, explanation: 'no' },
        { id: 'b', text: 'B', correct: true, explanation: 'yes' },
      ],
    },
    {
      id: 'multi',
      type: 'multiple',
      prompt: 'p',
      explanation: 'e',
      options: [
        { id: 'a', text: 'A', correct: true, explanation: '' },
        { id: 'b', text: 'B', correct: false, explanation: '' },
        { id: 'c', text: 'C', correct: true, explanation: '' },
      ],
    },
  ],
};

describe('gradeQuiz', () => {
  it('scores exact matches only', () => {
    const r = gradeQuiz(quiz, { single: ['b'], multi: ['c', 'a'] });
    expect(r).toMatchObject({ score: 2, maxScore: 2 });
  });

  it('gives no partial credit on multiple-answer questions', () => {
    expect(gradeQuiz(quiz, { single: ['b'], multi: ['a'] }).score).toBe(1);
    expect(gradeQuiz(quiz, { single: ['b'], multi: ['a', 'b', 'c'] }).score).toBe(1);
  });

  it('ignores unknown option ids and duplicates instead of failing', () => {
    const r = gradeQuiz(quiz, { single: ['b', 'b', 'z'], multi: [] });
    expect(r.results[0]).toMatchObject({ correct: true, selected: ['b'] });
    expect(r.results[1]).toMatchObject({ correct: false, correctOptions: ['a', 'c'] });
  });

  it('treats unanswered questions as wrong', () => {
    expect(gradeQuiz(quiz, {}).score).toBe(0);
  });
});

describe('scoreExam', () => {
  const exam = {
    tasks: [
      { id: 't1', points: 8, checks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      { id: 't2', points: 6, checks: [{ id: 'x' }] },
    ],
  } as unknown as Exam;

  it('awards points proportionally to confirmed checks and ignores unknown ids', () => {
    expect(scoreExam(exam, { t1: { status: 'DONE', passedChecks: ['a', 'zzz'] }, t2: { status: 'DONE', passedChecks: ['x'] } })).toEqual({
      score: 9, // round(8 * 1/3) + 6
      maxScore: 14,
    });
  });

  it('scores zero for untouched tasks', () => {
    expect(scoreExam(exam, {})).toEqual({ score: 0, maxScore: 14 });
  });
});

describe('percent', () => {
  it('rounds and handles zero', () => {
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBe(0);
  });
});
