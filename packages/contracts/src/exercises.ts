/**
 * Exercises: short, auto-graded practice tied to a lesson (or, for
 * challenges, to a module). They run in the student's playground cluster:
 * loading one creates its namespaces and starting state in seconds, without
 * a new virtual cluster.
 *
 * ms-learning serves the statement (never the answer key) and records
 * progress; ms-labs loads exercises into the cluster and grades them.
 */
import type { Difficulty } from './learning';

/** `exercise` practises one lesson; `challenge` combines a module, with fewer hints. */
export type ExerciseKind = 'exercise' | 'challenge';

/**
 * What a test case looks at:
 *   cluster   a read-only command against the student's cluster
 *   answer    what the student typed or chose in an answer field
 *   file      a file the student wrote in their home directory (CKA-style "save the output to …")
 *   history   a command the student ran (their shell history)
 *   terminal  what the student's terminal currently shows
 */
export type ExerciseCheckType = 'cluster' | 'answer' | 'file' | 'history' | 'terminal';

export interface ExerciseInputDto {
  id: string;
  label: string;
  /** `choice` renders radio buttons; `text` a single-line field. */
  kind: 'text' | 'choice';
  placeholder: string | null;
  options: { id: string; text: string }[];
}

/** A test case as the student sees it: what is checked, never the expected value. */
export interface ExerciseCheckDto {
  id: string;
  description: string;
  type: ExerciseCheckType;
}

export interface ExerciseSummaryDto {
  id: string;
  title: string;
  moduleId: string;
  /** null for module-level challenges. */
  lessonId: string | null;
  kind: ExerciseKind;
  difficulty: Difficulty;
  minutes: number;
  /** Tags shown as chips (e.g. "troubleshooting", "jsonpath"). */
  tags: string[];
}

export interface ExerciseDto extends ExerciseSummaryDto {
  statement: string;
  /** Namespaces the exercise creates in the cluster (reset deletes and recreates them). */
  namespaces: string[];
  /** Starter files placed in ~/<exercise id>/ in the terminal. */
  files: string[];
  inputs: ExerciseInputDto[];
  checks: ExerciseCheckDto[];
  hints: string[];
  /** Null until requested through POST /exercises/:id/solution. */
  solution: string | null;
  /** Setup commands, for students without a browser environment. */
  setup: string;
}

export type ExerciseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ExerciseProgressDto {
  exerciseId: string;
  status: ExerciseStatus;
  attempts: number;
  solutionRevealed: boolean;
  completedAt: string | null;
  updatedAt: string;
}

export interface ExerciseDetailDto {
  exercise: ExerciseDto;
  progress: ExerciseProgressDto | null;
  /** The next exercise in course order, for the "Next" button. */
  nextId: string | null;
  previousId: string | null;
}

export interface RecordExerciseAttemptRequest {
  passed: boolean;
}

// --- Grading (ms-labs) ---------------------------------------------------------

/** Loading → Ready (or Failed): the exercise's starting state in the cluster. */
export type ExerciseLoadState = 'Loading' | 'Ready' | 'Failed';

export interface LoadedExerciseDto {
  id: string;
  state: ExerciseLoadState;
  message: string | null;
  loadedAt: string;
}

export interface LoadExerciseRequest {
  exerciseId: string;
}

export interface ValidateExerciseRequest {
  exerciseId: string;
  /** inputId -> the student's answer. */
  answers?: Record<string, string>;
  /** Recent terminal text, for `terminal` test cases. */
  terminal?: string;
}

export interface ExerciseCheckResultDto {
  checkId: string;
  passed: boolean;
  /**
   * What the check saw, to help the student debug. Never contains the
   * expected answer: empty for `answer` checks.
   */
  output: string;
}

export interface ExerciseValidationDto {
  exerciseId: string;
  passed: boolean;
  results: ExerciseCheckResultDto[];
  checkedAt: string;
}
