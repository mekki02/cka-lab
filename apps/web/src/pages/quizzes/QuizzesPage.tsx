import { Box, Card, CardActionArea, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { useQuizAttemptsQuery } from '@/api/api';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/states';
import { useCurriculum } from '@/hooks/useCurriculum';
import { useSelectedCourse } from '@/hooks/useSelectedCourse';
import { CourseSwitcher } from '@/components/CourseSwitcher';

export const QuizzesPage = () => {
  const { index, error, isLoading, refetch } = useCurriculum();
  const { data: attempts } = useQuizAttemptsQuery();
  const { course } = useSelectedCourse();
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !index || !course) return <Loading />;

  const best = new Map<string, number>();
  for (const a of attempts ?? []) best.set(a.quizId, Math.max(best.get(a.quizId) ?? 0, a.percent));
  const quizzes = index.modulesOf(course.id).flatMap(m => m.quizzes.map(q => ({ ...q, module: m })));

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        overline={`${course.code} assessment`}
        title="Quizzes"
        actions={<CourseSwitcher />}
        subtitle="Scenario-driven questions that test whether you understand what Kubernetes does — not whether you memorised flags. Every answer comes with an explanation."
      />
      {quizzes.length === 0 ? (
        <EmptyState icon={<QuizOutlinedIcon fontSize="inherit" />} title={`No ${course.code} quizzes yet`} />
      ) : (
        <Grid container spacing={2}>
          {quizzes.map(q => {
            const score = best.get(q.id);
            return (
              <Grid key={q.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardActionArea component={RouterLink} to={`/quizzes/${q.id}`} sx={{ height: '100%', alignItems: 'stretch' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Chip size="small" variant="outlined" label={`${q.questions} questions`} />
                        {score !== undefined && <Chip size="small" color={score >= 70 ? 'success' : 'warning'} label={`Best ${score}%`} />}
                      </Stack>
                      <Typography variant="h6" component="h2">
                        {q.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {q.module.title}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};
