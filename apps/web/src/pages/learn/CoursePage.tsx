import { Alert, Box, Card, CardActionArea, CardContent, Chip, Grid, LinearProgress, Link, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useEffect } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import type { CurriculumModule } from '@cka/contracts';
import { CourseSwitcher } from '@/components/CourseSwitcher';
import { ErrorState, Loading, PageHeader } from '@/components/states';
import { moduleCompletion, useCurriculum, useProgressIndex } from '@/hooks/useCurriculum';
import { useSelectedCourse } from '@/hooks/useSelectedCourse';
import { minutes } from '@/utils/format';

const ModuleCard = ({ m, n, status }: { m: CurriculumModule; n: number; status: Map<string, string> }) => {
  const c = moduleCompletion(m, status);
  const planned = m.lessons.length - c.total;
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea component={RouterLink} to={`/learn/${m.id}`} sx={{ height: '100%', alignItems: 'stretch' }}>
        <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Module {n}
            </Typography>
            {c.total > 0 && c.done === c.total ? (
              <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Completed" />
            ) : c.total === 0 ? (
              <Chip size="small" variant="outlined" label="Coming soon" />
            ) : null}
          </Stack>
          <Typography variant="h6" component="h3" gutterBottom>
            {m.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {m.summary}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
            {m.lessons.length} lessons · {minutes(m.minutes)}
            {m.labs.length > 0 && ` · ${m.labs.length} lab${m.labs.length > 1 ? 's' : ''}`}
            {m.quizzes.length > 0 && ' · quiz'}
            {planned > 0 && c.total > 0 && ` · ${planned} planned`}
          </Typography>
          {c.total > 0 && <LinearProgress variant="determinate" value={c.percent} sx={{ mt: 1 }} aria-label={`${c.percent}% complete`} />}
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export const CoursePage = () => {
  const { index, error, isLoading, refetch } = useCurriculum();
  const { index: progress } = useProgressIndex();
  const [params] = useSearchParams();
  const { course, select } = useSelectedCourse(params.get('course'));
  // ?course=ckad (from a breadcrumb or a shared link) selects that course.
  const wanted = params.get('course');
  useEffect(() => {
    if (wanted && index?.courses.has(wanted)) select(wanted);
  }, [wanted, index, select]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !index || !course) return <Loading />;

  const { curriculum } = index;
  const modules = index.modulesOf(course.id);
  const numbered = new Map(modules.map((m, i) => [m.id, i + 1]));
  const lessons = modules.flatMap(m => m.lessons);
  const published = lessons.filter(l => l.status === 'published').length;

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader overline={`${course.code} course`} title={course.title} subtitle={course.summary} actions={<CourseSwitcher />} />
      <Alert severity="info" variant="outlined" sx={{ mb: 4 }}>
        {course.audience} {modules.length} modules · {published}/{lessons.length} lessons published · Kubernetes v{curriculum.kubernetesVersion} ·{' '}
        <Link href={course.source} target="_blank" rel="noreferrer">
          official curriculum
        </Link>
      </Alert>
      {curriculum.domains
        .filter(d => d.courseId === course.id)
        .map(d => {
          const inDomain = modules.filter(m => m.domain === d.id);
          if (!inDomain.length) return null;
          return (
            <Box key={d.id} component="section" sx={{ mb: 5 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h3" component="h2">
                  {d.title}
                </Typography>
                <Chip
                  size="small"
                  color={d.weight ? 'primary' : 'default'}
                  variant={d.weight ? 'filled' : 'outlined'}
                  label={d.weight ? `${d.weight}% of exam` : 'Not on the exam'}
                />
              </Stack>
              {d.competencies.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 900 }}>
                  Official competencies: {d.competencies.map(c => c.text).join(' · ')}
                </Typography>
              )}
              <Grid container spacing={2}>
                {inDomain.map(m => (
                  <Grid key={m.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                    <ModuleCard m={m} n={numbered.get(m.id)!} status={progress.status} />
                  </Grid>
                ))}
              </Grid>
            </Box>
          );
        })}
    </Box>
  );
};
