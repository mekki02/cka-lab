import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useExamAttemptsQuery, useExamsQuery, useStartExamMutation } from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/states';
import { Markdown } from '@/components/Markdown';

export const SIMULATION_NOTICE =
  'Simulated practice exam. Scores are self-assessed from the checks you confirm on your own cluster. They are not CKA certification results and do not predict your real score.';

export const ExamsPage = () => {
  const { data: exams, error, isLoading, refetch } = useExamsQuery();
  const { data: attempts } = useExamAttemptsQuery();
  const [start, startState] = useStartExamMutation();
  const navigate = useNavigate();

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !exams) return <Loading />;

  const open = new Map((attempts ?? []).filter(a => !a.submittedAt).map(a => [a.examId, a]));
  const finished = (attempts ?? []).filter(a => a.submittedAt);

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader overline="Exam practice" title="Mock exams" subtitle="Timed, performance-based tasks in the style of the CKA. Work in your own cluster, verify each task with the provided checks, and review solutions afterwards." />
      <Alert severity="info" sx={{ mb: 3 }}>
        {SIMULATION_NOTICE}
      </Alert>
      {startState.error && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(startState.error)}</Alert>}

      {exams.length === 0 ? (
        <EmptyState icon={<TimerOutlinedIcon fontSize="inherit" />} title="No mock exams yet" />
      ) : (
        <Grid container spacing={2}>
          {exams.map(e => {
            const resume = open.get(e.id);
            return (
              <Grid key={e.id} size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                      <Chip size="small" icon={<TimerOutlinedIcon />} label={`${e.durationMinutes} min`} />
                      <Chip size="small" variant="outlined" label={`${e.taskCount} tasks · ${e.totalPoints} pts`} />
                      <Chip size="small" variant="outlined" label={`Pass ${e.passPercent}%`} />
                    </Stack>
                    <Typography variant="h5" component="h2">
                      {e.title}
                    </Typography>
                    <Box sx={{ flex: 1, color: 'text.secondary' }}>
                      <Markdown dense>{e.description}</Markdown>
                    </Box>
                    <Button
                      variant="contained"
                      sx={{ mt: 2, alignSelf: 'flex-start' }}
                      disabled={startState.isLoading}
                      onClick={async () => {
                        const a = resume ?? (await start(e.id).unwrap().catch(() => null));
                        if (a) navigate(`/exams/attempts/${a.id}`);
                      }}
                    >
                      {resume ? 'Resume attempt' : 'Start exam'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {finished.length > 0 && (
        <Card sx={{ mt: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Your attempts
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Exam</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Simulated score</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {finished.map(a => {
                  const pct = Math.round(((a.score ?? 0) / a.maxScore) * 100);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>{a.title}</TableCell>
                      <TableCell>{new Date(a.submittedAt!).toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Chip size="small" color={pct >= a.passPercent ? 'success' : 'warning'} label={`${pct}%`} />
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" component={RouterLink} to={`/exams/attempts/${a.id}`}>
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
