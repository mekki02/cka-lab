import { useMemo } from 'react';
import type { Course, Curriculum, CurriculumLesson, CurriculumModule, ExamDomain } from '@cka/contracts';
import { useCurriculumQuery, useProgressQuery } from '@/api/api';

export interface CurriculumIndex {
  curriculum: Curriculum;
  courses: Map<string, Course>;
  modules: Map<string, CurriculumModule>;
  lessons: Map<string, CurriculumLesson>;
  domains: Map<string, ExamDomain>;
  /** All lessons, course by course, in learning order. */
  ordered: CurriculumLesson[];
  /** Published lessons in learning order. Walk them per course with `courseOfLesson`. */
  published: CurriculumLesson[];
  modulesOf: (courseId: string) => CurriculumModule[];
  courseOfModule: (moduleId: string) => Course | undefined;
  courseOfLesson: (lessonId: string) => Course | undefined;
}

const build = (c: Curriculum): CurriculumIndex => {
  const ordered = c.modules.flatMap(m => m.lessons);
  const courses = new Map(c.courses.map(x => [x.id, x]));
  const modules = new Map(c.modules.map(m => [m.id, m]));
  const lessons = new Map(ordered.map(l => [l.id, l]));
  const courseOfModule = (id: string) => {
    const m = modules.get(id);
    return m ? courses.get(m.courseId) : undefined;
  };
  return {
    curriculum: c,
    courses,
    modules,
    lessons,
    domains: new Map(c.domains.map(d => [d.id, d])),
    ordered,
    published: ordered.filter(l => l.status === 'published'),
    modulesOf: id => c.modules.filter(m => m.courseId === id),
    courseOfModule,
    courseOfLesson: id => {
      const l = lessons.get(id);
      return l ? courseOfModule(l.moduleId) : undefined;
    },
  };
};

export const useCurriculum = () => {
  const q = useCurriculumQuery();
  const index = useMemo(() => (q.data ? build(q.data) : undefined), [q.data]);
  return { ...q, index };
};

/** lessonId -> status, plus bookmarks, from the progress endpoint. */
export const useProgressIndex = () => {
  const q = useProgressQuery();
  const index = useMemo(() => {
    const status = new Map((q.data?.lessons ?? []).map(l => [l.lessonId, l.status]));
    return { status, bookmarks: new Set(q.data?.bookmarks ?? []), recent: q.data?.recent ?? [] };
  }, [q.data]);
  return { ...q, index };
};

export const moduleCompletion = (m: CurriculumModule, status: Map<string, string>) => {
  const published = m.lessons.filter(l => l.status === 'published');
  const done = published.filter(l => status.get(l.id) === 'COMPLETED').length;
  return { done, total: published.length, percent: published.length ? Math.round((done / published.length) * 100) : 0 };
};
