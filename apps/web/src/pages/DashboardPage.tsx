import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useDashboardQuery, useMeQuery } from '@/api/api';
import { ErrorState, Loading, PageHeader } from '@/components/states';
import { CourseSwitcher } from '@/components/CourseSwitcher';
import { useCurriculum, type CurriculumIndex } from '@/hooks/useCurriculum';
import { useSelectedCourse } from '@/hooks/useSelectedCourse';
import { timeAgo } from '@/utils/format';

const StatCard = ({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h3" component="div" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {hint}
        </Typography>
      )}
    </CardContent>
  </Card>
);

const lessonLink = (index: CurriculumIndex, lessonId: string) => {
  const l = index.lessons.get(lessonId);
  return l ? { to: `/learn/${l.moduleId}/${l.id}`, title: l.title, module: index.modules.get(l.moduleId)?.title } : null;
};

export const DashboardPage = () => {
  const { data: me } = useMeQuery();
  const { data, error, isLoading, refetch } = useDashboardQuery();
  const { index, error: cError } = useCurriculum();
  const { course } = useSelectedCourse(data?.currentCourseId);

  if (error || cError) return <ErrorState error={error ?? cError} onRetry={refetch} />;
  if (isLoading || !data || !index || !course) return <Loading />;

  const cp = data.courses.find(c => c.courseId === course.id) ?? data.courses[0]!;
  const moduleIds = new Set(course.moduleIds);
  const inCourse = (lessonId: string) => moduleIds.has(index.lessons.get(lessonId)?.moduleId ?? '');
  const next = cp.nextLessonId ? lessonLink(index, cp.nextLessonId) : null;
  const nextLesson = cp.nextLessonId ? index.lessons.get(cp.nextLessonId) : undefined;
  const examDomains = cp.domains.filter(d => d.weight > 0);
  const extraDomains = cp.domains.filter(d => d.weight === 0);
  const t = cp.totals;
  const firstName = me?.displayName.split(' ')[0];
  const labsInProgress = data.inProgressLabs.filter(id => index.curriculum.modules.some(m => moduleIds.has(m.id) && m.labs.some(l => l.id === id)));
  const quizModules = new Map(index.curriculum.modules.flatMap(m => m.quizzes.map(q => [q.id, m.id] as const)));
  const quizAttempts = data.recentQuizAttempts.filter(a => moduleIds.has(quizModules.get(a.quizId) ?? ''));
  const recent = data.recent.filter(r => inCourse(r.lessonId));

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        overline="Dashboard"
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        subtitle={`${course.title} (${course.code}), aligned with Kubernetes v${index.curriculum.kubernetesVersion}. ${t.lessonsPublished} lessons available, ${t.lessonsPlanned} more planned.`}
        actions={<CourseSwitcher fallback={data.currentCourseId} />}
      />

      <Grid container spacing={2.5}>
        {/* Continue learning */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ height: '100%', background: th => (th.palette.mode === 'dark' ? 'linear-gradient(135deg, rgba(79,70,229,0.25), rgba(20,184,166,0.1))' : 'linear-gradient(135deg, #eef2ff, #f0fdfa)') }}>
            <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
              <Typography variant="overline" color="primary">
                {next ? 'Continue learning' : 'Course status'}
              </Typography>
              {next && nextLesson ? (
                <>
                  <Typography variant="h4" component="h2" sx={{ mt: 0.5 }}>
                    {next.title}
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 1, mb: 2.5 }}>
                    {next.module} · {nextLesson.minutes} min — {nextLesson.summary}
                  </Typography>
                  <Button component={RouterLink} to={next.to} variant="contained" size="large" startIcon={<PlayArrowRoundedIcon />}>
                    {t.lessonsCompleted === 0 ? 'Start the course' : 'Continue'}
                  </Button>
                </>
              ) : (
                <Typography variant="h5" sx={{ mt: 1 }}>
                  You have completed every published {course.code} lesson. New lessons appear here as they are released.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Readiness */}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography variant="overline" color="text.secondary">
                  {course.code} study readiness
                </Typography>
                <Tooltip title="Weighted by the official domain weights: half lesson completion, half best quiz scores. A study-coverage indicator — not a prediction of your exam result.">
                  <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                </Tooltip>
              </Stack>
              <Box sx={{ height: 150 }}>
                <Gauge
                  value={cp.readiness}
                  startAngle={-110}
                  endAngle={110}
                  innerRadius="75%"
                  text={({ value }) => `${value}%`}
                  sx={{ [`& .${gaugeClasses.valueText}`]: { fontSize: 28, fontWeight: 700 } }}
                  aria-label={`${course.code} study readiness ${cp.readiness} percent`}
                />
              </Box>
              {cp.lastExam ? (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Last mock exam: <strong>{cp.lastExam.percent}%</strong> (simulated, self-assessed)
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  No mock exam taken yet.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 6, sm: 3, lg: 3 }}>
          <StatCard label="Lessons" value={`${t.lessonsCompleted}/${t.lessonsPublished}`} hint="completed" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3, lg: 3 }}>
          <StatCard label="Labs" value={`${t.labsCompleted}/${t.labsTotal}`} hint={`${labsInProgress.length} in progress`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, lg: 3 }}>
          <StatCard label="Quizzes passed" value={`${t.quizzesPassed}/${t.quizzesTotal}`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, lg: 3 }}>
          <StatCard label="Exercises solved" value={`${t.exercisesCompleted}/${t.exercisesTotal}`} hint={<RouterLink to="/exercises">Practise</RouterLink>} />
        </Grid>

        {/* Domains */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Progress by exam domain
              </Typography>
              <Stack spacing={2.25} sx={{ mt: 2 }}>
                {examDomains.map(d => {
                  const pct = d.lessonsPublished ? Math.round((d.lessonsCompleted / d.lessonsPublished) * 100) : 0;
                  return (
                    <Box key={d.domain}>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
                        <Typography fontWeight={500}>
                          {d.title}{' '}
                          <Typography component="span" variant="body2" color="text.secondary">
                            · {d.weight}% of exam
                          </Typography>
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {d.lessonsCompleted}/{d.lessonsPublished} lessons
                          {d.quizAverage !== null && ` · quiz ${d.quizAverage}%`}
                        </Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={pct} sx={{ mt: 1 }} aria-label={`${d.title} ${pct}%`} />
                    </Box>
                  );
                })}
              </Stack>
              {extraDomains.map(d => (
                <Stack key={d.domain} direction="row" spacing={1} alignItems="center" sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Chip size="small" label="Beyond the exam" variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    {d.title}: {d.lessonsCompleted}/{d.lessonsPublished} lessons — not counted in readiness.
                  </Typography>
                </Stack>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Weak areas + recent */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Focus areas
                </Typography>
                {cp.weakAreas.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Nothing stands out yet. Take module quizzes to get specific feedback.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {cp.weakAreas.map(w => (
                      <Alert key={w.domain} severity="warning" variant="outlined" sx={{ py: 0 }}>
                        <strong>{index.domains.get(w.domain)?.title}</strong>
                        <br />
                        {w.reason}
                      </Alert>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent sx={{ pb: 1 }}>
                <Typography variant="h6">Recently viewed</Typography>
              </CardContent>
              {recent.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
                  Lessons you open appear here.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {recent.slice(0, 5).map(r => {
                    const link = lessonLink(index, r.lessonId);
                    return link ? (
                      <ListItemButton key={r.lessonId} component={RouterLink} to={link.to}>
                        <ListItemText primary={link.title} secondary={`${link.module} · ${timeAgo(r.visitedAt)}`} />
                      </ListItemButton>
                    ) : null;
                  })}
                </List>
              )}
            </Card>
          </Stack>
        </Grid>

        {/* Pending labs & quiz results */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Labs in progress
              </Typography>
              {labsInProgress.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No unfinished labs. <RouterLink to="/labs">Browse labs</RouterLink>
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {labsInProgress.map(id => (
                    <Card key={id} variant="outlined">
                      <CardActionArea component={RouterLink} to={`/labs/${id}`} sx={{ p: 1.5 }}>
                        <Typography fontWeight={500}>{index.curriculum.modules.flatMap(m => m.labs).find(l => l.id === id)?.title ?? id}</Typography>
                      </CardActionArea>
                    </Card>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent quiz results
              </Typography>
              {quizAttempts.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No quizzes taken yet. <RouterLink to="/quizzes">See quizzes</RouterLink>
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {quizAttempts.map(a => (
                    <Stack key={a.id} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2">
                        {index.curriculum.modules.flatMap(m => m.quizzes).find(q => q.id === a.quizId)?.title ?? a.quizId}
                      </Typography>
                      <Chip size="small" color={a.passed ? 'success' : 'warning'} label={`${a.percent}%`} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
