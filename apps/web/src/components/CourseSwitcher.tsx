import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useSelectedCourse } from '@/hooks/useSelectedCourse';

/** CKAD | CKA toggle; renders nothing while there is only one course. */
export const CourseSwitcher = ({ fallback, size = 'small' }: { fallback?: string | null; size?: 'small' | 'medium' }) => {
  const { course, courses, select } = useSelectedCourse(fallback);
  if (courses.length < 2 || !course) return null;
  return (
    <ToggleButtonGroup exclusive size={size} color="primary" value={course.id} onChange={(_, v) => v && select(v)} aria-label="Course">
      {courses.map(c => (
        <Tooltip key={c.id} title={c.title}>
          <ToggleButton value={c.id} sx={{ px: 2, fontWeight: 600 }}>
            {c.code}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
};
