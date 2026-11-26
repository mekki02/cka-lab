import { useCallback, useSyncExternalStore } from 'react';
import type { Course } from '@cka/contracts';
import { useCurriculum } from './useCurriculum';

/**
 * The course the learner is looking at (CKAD, CKA…), shared by every page
 * that lists course content (dashboard, course, exercises, labs, quizzes,
 * exams) and remembered per browser. Opening a module or lesson selects its
 * course, so "back to the course" lands on the right one.
 */
const KEY = 'cka.course';
const listeners = new Set<() => void>();

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
let current = read();

export const selectCourse = (id: string) => {
  if (id === current) return;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* not remembered across reloads */
  }
  listeners.forEach(l => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * @param fallback course to use before the learner picks one (e.g. the course
 *   of their last visited lesson); otherwise the first course of the catalogue.
 */
export const useSelectedCourse = (fallback?: string | null): { course: Course | undefined; courses: Course[]; select: (id: string) => void } => {
  const stored = useSyncExternalStore(subscribe, () => current);
  const { index } = useCurriculum();
  const courses = index?.curriculum.courses ?? [];
  const pick = (id: string | null | undefined) => (id ? index?.courses.get(id) : undefined);
  const course = pick(stored) ?? pick(fallback) ?? courses[0];
  const select = useCallback((id: string) => selectCourse(id), []);
  return { course, courses, select };
};
