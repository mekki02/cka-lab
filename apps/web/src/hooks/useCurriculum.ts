import { useMemo } from 'react';
import type { Curriculum, CurriculumLesson, CurriculumModule, ExamDomain } from '@cka/contracts';
import { useCurriculumQuery, useProgressQuery } from '@/api/api';

export interface CurriculumIndex {
  curriculum: Curriculum;
  modules: Map<string, CurriculumModule>;
  lessons: Map<string, CurriculumLesson>;
  domains: Map<string, ExamDomain>;
  /** All lessons in course order. */
  ordered: CurriculumLesson[];
  /** Published lessons in course order (what prev/next walks through). */
  published: CurriculumLesson[];
}

const build = (c: Curriculum): CurriculumIndex => {
  const ordered = c.modules.flatMap(m => m.lessons);
  return {
    curriculum: c,
    modules: new Map(c.modules.map(m => [m.id, m])),
    lessons: new Map(ordered.map(l => [l.id, l])),
    domains: new Map(c.domains.map(d => [d.id, d])),
    ordered,
    published: ordered.filter(l => l.status === 'published'),
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
