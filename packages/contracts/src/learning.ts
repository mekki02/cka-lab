/**
 * Learning domain contracts. The curriculum itself is content (content/ in the
 * repo); these types describe what ms-learning serves about it and about a
 * user's progress through it.
 */

export type ExamDomainId =
  | 'cluster-architecture'
  | 'workloads-scheduling'
  | 'services-networking'
  | 'storage'
  | 'troubleshooting';

export interface ExamDomain {
  id: ExamDomainId;
  title: string;
  /** Weight in the official exam blueprint, in percent. */
  weight: number;
}

export type LessonKind = 'lesson' | 'lab' | 'quiz';

export interface CurriculumLesson {
  id: string;
  moduleId: string;
  title: string;
  summary: string;
  minutes: number;
  kind: LessonKind;
  /** Lesson ids that should be completed first. */
  prerequisites: string[];
  order: number;
}

export interface CurriculumModule {
  id: string;
  domain: ExamDomainId;
  title: string;
  summary: string;
  objectives: string[];
  order: number;
  lessons: CurriculumLesson[];
  /** Ids of labs attached to the module. */
  labs: string[];
  /** Ids of quizzes attached to the module. */
  quizzes: string[];
}

export interface Curriculum {
  version: string;
  /** Kubernetes minor version the content was written against, e.g. "1.35". */
  kubernetesVersion: string;
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
