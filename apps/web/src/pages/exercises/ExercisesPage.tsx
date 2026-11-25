import { Box, Card, CardContent, Chip, LinearProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import { useState } from 'react';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/states';
import { LABS_ENABLED } from '@/config';
import { useCurriculum } from '@/hooks/useCurriculum';
import { ExerciseList, useExerciseStatus } from './ExerciseList';

type Filter = 'all' | 'todo' | 'done' | 'challenge';

/** Every exercise, by module and lesson: the course's practice track. */
export const ExercisesPage = () => {
  const { index, error, isLoading, refetch } = useCurriculum();
  const status = useExerciseStatus();
  const [filter, setFilter] = useState<Filter>('all');

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !index) return <Loading />;

  const all = index.curriculum.modules.flatMap(m => m.exercises);
  const done = all.filter(e => status.get(e.id) === 'COMPLETED').length;
  const keep = (id: string, kind: string) =>
    filter === 'all' ||
    (filter === 'done' && status.get(id) === 'COMPLETED') ||
    (filter === 'todo' && status.get(id) !== 'COMPLETED') ||
    (filter === 'challenge' && kind === 'challenge');
  const modules = index.curriculum.modules
    .map(m => ({ m, exercises: m.exercises.filter(e => keep(e.id, e.kind)) }))
    .filter(x => x.exercises.length > 0);

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        overline="Practice"
        title="Exercises"
        subtitle={
          LABS_ENABLED
            ? 'Short tasks on a real cluster, graded automatically. Each one sets up its own starting state — often something broken — in your playground: read the statement, work in the terminal, answer, and press Validate.'
            : 'Short tasks for each lesson. Run the setup on your own practice cluster; automatic grading needs the browser lab environments.'
        }
      />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2">
                {done}/{all.length} solved
              </Typography>
              <LinearProgress variant="determinate" value={all.length ? (done / all.length) * 100 : 0} sx={{ mt: 1 }} color={done === all.length && done > 0 ? 'success' : 'primary'} />
            </Box>
            <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v) => v && setFilter(v)}>
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="todo">To do</ToggleButton>
              <ToggleButton value="done">Solved</ToggleButton>
              <ToggleButton value="challenge">Challenges</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </CardContent>
      </Card>

      {modules.length === 0 && <EmptyState icon={<FitnessCenterIcon />} title="Nothing here with this filter" />}
      {modules.map(({ m, exercises }) => {
        const groups = [
          ...m.lessons
            .map(l => ({ key: l.id, title: l.title, items: exercises.filter(e => e.lessonId === l.id) }))
            .filter(g => g.items.length),
          ...(exercises.some(e => !e.lessonId) ? [{ key: '_challenges', title: 'Module challenges', items: exercises.filter(e => !e.lessonId) }] : []),
        ];
        return (
          <Card key={m.id} sx={{ mb: 3 }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6" sx={{ flex: 1 }}>
                  {m.title}
                </Typography>
                <Chip size="small" label={`${m.exercises.filter(e => status.get(e.id) === 'COMPLETED').length}/${m.exercises.length}`} />
              </Stack>
              {groups.map(g => (
                <Box key={g.key} sx={{ mt: 1.5 }}>
                  <Typography variant="overline" color="text.secondary">
                    {g.title}
                  </Typography>
                  <ExerciseList exercises={g.items} />
                </Box>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
};
