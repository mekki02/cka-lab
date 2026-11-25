/**
 * Learning domain contracts. The curriculum itself is content (content/ in the
 * repo); these types describe what ms-learning serves about it and about a
 * user's progress through it.
 */
import type { ExerciseSummaryDto } from './exercises';

export type ExamDomainId =
  | 'cluster-architecture'
  | 'workloads-scheduling'
  | 'services-networking'
  | 'storage'
  | 'troubleshooting'
  /** Beyond the exam (Helm authoring, Traefik, Argo CD…). Weight 0. */
  | 'platform-tools';

export interface Competency {
  id: string;
  /** Verbatim wording of the official CNCF competency. */
  text: string;
}

export interface ExamDomain {
  id: ExamDomainId;
  title: string;
  /** Weight in the official exam blueprint, in percent. 0 = not an exam domain. */
  weight: number;
  competencies: Competency[];
}

export interface CurriculumLesson {
  id: string;
  moduleId: string;
  title: string;
  summary: string;
  minutes: number;
  /** `planned` lessons are part of the outline but not written yet. */
  status: 'published' | 'planned';
  prerequisites: string[];
}

export interface CurriculumModule {
  id: string;
  domain: ExamDomainId;
  title: string;
  summary: string;
  objectives: string[];
  competencies: string[];
  lessons: CurriculumLesson[];
  labs: { id: string; title: string; type: LabType; difficulty: Difficulty; minutes: number }[];
  quizzes: { id: string; title: string; questions: number }[];
  /** Exercises of the module's lessons and its challenges, in course order. */
  exercises: ExerciseSummaryDto[];
  /** Sum of lesson + lab minutes. */
  minutes: number;
}

export interface Curriculum {
  version: string;
  /** Kubernetes minor version the content was written against, e.g. "1.37". */
  kubernetesVersion: string;
  source: string;
  domains: ExamDomain[];
  modules: CurriculumModule[];
}

export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface LessonProgressDto {
  lessonId: string;
  status: ProgressStatus;
  updatedAt: string;
  completedAt: string | null;
}

export interface ProgressSummaryDto {
  lessons: LessonProgressDto[];
  bookmarks: string[];
  recent: { lessonId: string; visitedAt: string }[];
}

export interface UpdateLessonProgressRequest {
  status: ProgressStatus;
}

// --- Labs --------------------------------------------------------------------

export type LabType = 'guided' | 'challenge' | 'troubleshooting';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * How a lab environment validates a check automatically (see
 * docs/LAB_ARCHITECTURE.md). null = the student compares the output by eye.
 */
export type CheckMatch = 'exact' | 'contains' | 'regex' | 'success';

export interface LabCheck {
  id: string;
  description: string;
  command: string;
  expect: string;
  match: CheckMatch | null;
}

export interface LabTask {
  id: string;
  title: string;
  description: string;
  hints: string[];
  checks: LabCheck[];
  /** Null until requested through GET /labs/:id/tasks/:taskId/solution. */
  solution: string | null;
}

export interface LabDto {
  id: string;
  title: string;
  moduleId: string;
  type: LabType;
  difficulty: Difficulty;
  minutes: number;
  environment: { cluster: 'kind' | 'kubeadm' | 'any'; destructive: boolean; requirements: string[] };
  scenario: string;
  objectives: string[];
  setup: { description: string; commands: string };
  tasks: LabTask[];
  verifyScript: string | null;
  reset: { description: string; commands: string };
}

export type LabStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface LabProgressDto {
  labId: string;
  status: LabStatus;
  completedTasks: string[];
  revealedSolutions: string[];
  updatedAt: string;
}

export interface UpdateLabProgressRequest {
  status?: LabStatus;
  completedTasks?: string[];
}

// --- Quizzes -----------------------------------------------------------------

export type QuestionType = 'single' | 'multiple' | 'scenario';

/** A question as served before answering: no correctness, no explanations. */
export interface QuizQuestionDto {
  id: string;
  type: QuestionType;
  prompt: string;
  options: { id: string; text: string }[];
}

export interface QuizDto {
  id: string;
  title: string;
  moduleId: string;
  description: string;
  passPercent: number;
  questions: QuizQuestionDto[];
}

export interface SubmitQuizRequest {
  /** questionId -> selected option ids */
  answers: Record<string, string[]>;
}

export interface GradedQuestion {
  questionId: string;
  correct: boolean;
  selected: string[];
  correctOptions: string[];
  explanation: string;
  optionExplanations: Record<string, string>;
}

export interface QuizAttemptDto {
  id: string;
  quizId: string;
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  submittedAt: string;
  results?: GradedQuestion[];
}

// --- Mock exams --------------------------------------------------------------

export interface ExamSummaryDto {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  passPercent: number;
  taskCount: number;
  totalPoints: number;
}

export interface ExamTaskDto {
  id: string;
  title: string;
  domain: ExamDomainId;
  points: number;
  context: string;
  description: string;
  checks: LabCheck[];
  /** Only present once the attempt is submitted. */
  solution: string | null;
}

export type ExamTaskStatus = 'TODO' | 'FLAGGED' | 'DONE';

export interface ExamAttemptDto {
  id: string;
  examId: string;
  title: string;
  environment: string;
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  passPercent: number;
  tasks: ExamTaskDto[];
  /** taskId -> status and the ids of checks the student confirmed passing. */
  taskStates: Record<string, { status: ExamTaskStatus; passedChecks: string[] }>;
  score: number | null;
  maxScore: number;
}

export interface UpdateExamTaskRequest {
  status?: ExamTaskStatus;
  passedChecks?: string[];
}

// --- Cheat sheets ------------------------------------------------------------

export interface CheatsheetDto {
  id: string;
  title: string;
  description: string;
  sections: {
    title: string;
    entries: { title: string; description?: string; code: string; lang: 'bash' | 'yaml' | 'text' | 'json'; tags: string[] }[];
  }[];
}

// --- Dashboard ---------------------------------------------------------------

export interface DomainProgressDto {
  domain: ExamDomainId;
  title: string;
  weight: number;
  lessonsPublished: number;
  lessonsCompleted: number;
  /** Mean of the best score per quiz in this domain, 0-100; null if none taken. */
  quizAverage: number | null;
}

export interface DashboardDto {
  totals: {
    lessonsPublished: number;
    lessonsCompleted: number;
    lessonsPlanned: number;
    labsCompleted: number;
    labsTotal: number;
    exercisesCompleted: number;
    exercisesTotal: number;
    quizzesPassed: number;
    quizzesTotal: number;
  };
  domains: DomainProgressDto[];
  currentModuleId: string | null;
  nextLessonId: string | null;
  recent: { lessonId: string; visitedAt: string }[];
  inProgressLabs: string[];
  recentQuizAttempts: QuizAttemptDto[];
  weakAreas: { domain: ExamDomainId; reason: string }[];
  lastExam: { examId: string; percent: number; submittedAt: string; passPercent: number } | null;
  /**
   * 0-100, weighted by official domain weights, combining lesson completion
   * and quiz scores. A study-coverage indicator — not a prediction of the real
   * exam result.
   */
  readiness: number;
}
