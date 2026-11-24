import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, Loading } from '@/components/states';
import { moduleCompletion, useCurriculum, useProgressIndex } from '@/hooks/useCurriculum';
import { minutes } from '@/utils/format';

export const StatusIcon = ({ status, planned }: { status?: string; planned?: boolean }) =>
  planned ? (
    <ScheduleIcon fontSize="small" sx={{ color: 'text.disabled' }} />
  ) : status === 'COMPLETED' ? (
    <CheckCircleIcon fontSize="small" color="success" />
  ) : status === 'IN_PROGRESS' ? (
    <TimelapseIcon fontSize="small" color="primary" />
  ) : (
    <RadioButtonUncheckedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
  );

export const ModulePage = () => {
  const { moduleId = '' } = useParams();
  const { index, error, isLoading, refetch } = useCurriculum();
  const { index: progress } = useProgressIndex();
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !index) return <Loading />;
  const m = index.modules.get(moduleId);
  if (!m) return <EmptyState title="Module not found">Check the link, or go back to the course.</EmptyState>;

  const domain = index.domains.get(m.domain);
  const c = moduleCompletion(m, progress.status);
  const firstOpen = m.lessons.find(l => l.status === 'published' && progress.status.get(l.id) !== 'COMPLETED');
  const competencies = domain?.competencies.filter(x => m.competencies.includes(x.id)) ?? [];

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/learn" underline="hover" color="inherit">
          Course
        </Link>
        <Typography color="text.primary">{m.title}</Typography>
      </Breadcrumbs>

      <Typography variant="overline" color="primary">
        {domain?.title}
      </Typography>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
        {m.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 760, fontSize: '1.05rem' }}>
        {m.summary}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
        <Chip size="small" icon={<ScheduleIcon />} label={`About ${minutes(m.minutes)}`} />
        <Chip size="small" label={`${m.lessons.length} lessons`} />
        {c.total > 0 && <Chip size="small" color={c.done === c.total ? 'success' : 'default'} label={`${c.done}/${c.total} completed`} />}
      </Stack>
      {firstOpen && (
        <Button component={RouterLink} to={`/learn/${m.id}/${firstOpen.id}`} variant="contained" size="large" sx={{ mt: 3 }}>
          {c.done === 0 ? 'Start module' : 'Continue module'}
        </Button>
      )}

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Typography variant="h6">Lessons</Typography>
              {c.total > 0 && <LinearProgress variant="determinate" value={c.percent} sx={{ mt: 1.5 }} />}
            </CardContent>
            <List>
              {m.lessons.map((l, i) => {
                const planned = l.status === 'planned';
                return (
                  <ListItemButton
                    key={l.id}
                    component={planned ? 'div' : RouterLink}
                    to={planned ? undefined : `/learn/${m.id}/${l.id}`}
                    disabled={planned}
                    sx={{ alignItems: 'flex-start', py: 1.5 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                      <StatusIcon status={progress.status.get(l.id)} planned={planned} />
                    </ListItemIcon>
                    <ListItemText
                      primary={`${i + 1}. ${l.title}`}
                      secondary={`${planned ? 'Coming soon · ' : ''}${l.minutes} min — ${l.summary}`}
                      slotProps={{ primary: { fontWeight: 500 } }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Learning objectives
                </Typography>
                <Box component="ul" sx={{ pl: 2.5, my: 0, '& li': { mb: 1 } }}>
                  {m.objectives.map(o => (
                    <li key={o}>
                      <Typography variant="body2">{o}</Typography>
                    </li>
                  ))}
                </Box>
                {competencies.length > 0 && (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: 2 }}>
                      Official CKA competencies covered
                    </Typography>
                    {competencies.map(x => (
                      <Typography key={x.id} variant="body2" color="text.secondary">
                        • {x.text}
                      </Typography>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
            {(m.labs.length > 0 || m.quizzes.length > 0) && (
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Practice
                  </Typography>
                  <Stack spacing={1}>
                    {m.labs.map(l => (
                      <Button key={l.id} component={RouterLink} to={`/labs/${l.id}`} variant="outlined" startIcon={<ScienceOutlinedIcon />} sx={{ justifyContent: 'flex-start' }}>
                        {l.title} · {l.minutes} min
                      </Button>
                    ))}
                    {m.quizzes.map(q => (
                      <Button key={q.id} component={RouterLink} to={`/quizzes/${q.id}`} variant="outlined" startIcon={<QuizOutlinedIcon />} sx={{ justifyContent: 'flex-start' }}>
                        {q.title} · {q.questions} questions
                      </Button>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
};
