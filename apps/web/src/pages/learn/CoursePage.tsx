import { Box, Card, CardActionArea, CardContent, Chip, Grid, LinearProgress, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { Link as RouterLink } from 'react-router-dom';
import type { CurriculumModule } from '@cka/contracts';
import { ErrorState, Loading, PageHeader } from '@/components/states';
import { moduleCompletion, useCurriculum, useProgressIndex } from '@/hooks/useCurriculum';
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
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !index) return <Loading />;

  const { curriculum } = index;
  let n = 0;
  const numbered = new Map(curriculum.modules.map(m => [m.id, ++n]));

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        overline="Course"
        title="Certified Kubernetes Administrator"
        subtitle={
          <>
            Organised around the official CKA domains and competencies (Kubernetes v{curriculum.kubernetesVersion}). Modules are ordered
            for learning: foundations first, then each domain, then troubleshooting — which carries 30% of the exam.
          </>
        }
      />
      {curriculum.domains.map(d => {
        const modules = curriculum.modules.filter(m => m.domain === d.id);
        if (!modules.length) return null;
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
              {modules.map(m => (
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
