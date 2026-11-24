import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ExamAttemptDto, ExamTaskStatus } from '@cka/contracts';
import { useExamAttemptQuery, useSubmitExamMutation, useUpdateExamTaskMutation } from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { CodeBlock } from '@/components/CodeBlock';
import { Markdown } from '@/components/Markdown';
import { ErrorState, Loading } from '@/components/states';
import { useCurriculum } from '@/hooks/useCurriculum';
import { formatDuration } from '@/utils/format';
import { SIMULATION_NOTICE } from './ExamsPage';

const useNow = (active: boolean) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
};

const taskScore = (a: ExamAttemptDto, taskId: string) => {
  const t = a.tasks.find(x => x.id === taskId)!;
  const passed = a.taskStates[taskId]?.passedChecks.length ?? 0;
  return Math.round((t.points * passed) / t.checks.length);
};

const StatusIcon = ({ status }: { status?: ExamTaskStatus }) =>
  status === 'DONE' ? <CheckCircleIcon fontSize="small" color="success" /> : status === 'FLAGGED' ? <FlagIcon fontSize="small" color="warning" /> : <RadioButtonUncheckedIcon fontSize="small" sx={{ color: 'text.disabled' }} />;

const Results = ({ a }: { a: ExamAttemptDto }) => {
  const { index } = useCurriculum();
  const pct = Math.round(((a.score ?? 0) / a.maxScore) * 100);
  const passed = pct >= a.passPercent;
  const review = a.tasks.filter(t => taskScore(a, t.id) < t.points);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="overline" color="primary">
        Results
      </Typography>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, mb: 2 }}>
        {a.title}
      </Typography>
      <Alert severity={passed ? 'success' : 'warning'} sx={{ mb: 2 }}>
        <AlertTitle>
          Simulated score: {a.score}/{a.maxScore} ({pct}%) — {passed ? 'above' : 'below'} the {a.passPercent}% pass mark
        </AlertTitle>
        {SIMULATION_NOTICE}
      </Alert>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Score by task
          </Typography>
          {a.tasks.map(t => (
            <Stack key={t.id} direction="row" justifyContent="space-between" sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="body2">
                {t.title}{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  · {index?.domains.get(t.domain)?.title ?? t.domain}
                </Typography>
              </Typography>
              <Chip size="small" color={taskScore(a, t.id) === t.points ? 'success' : taskScore(a, t.id) > 0 ? 'warning' : 'error'} label={`${taskScore(a, t.id)}/${t.points}`} />
            </Stack>
          ))}
        </CardContent>
      </Card>

      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
        Review: incorrect or incomplete tasks ({review.length})
      </Typography>
      {review.length === 0 && <Typography color="text.secondary">Every check was confirmed. Still worth skimming the solutions for faster approaches.</Typography>}
      {(review.length ? review : a.tasks).map(t => (
        <Card key={t.id} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6">{t.title}</Typography>
            <Markdown>{t.description}</Markdown>
            {t.solution && (
              <Alert severity="success" variant="outlined" icon={false} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
                <AlertTitle>Solution</AlertTitle>
                <Markdown dense>{t.solution}</Markdown>
              </Alert>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
};

export const ExamAttemptPage = () => {
  const { attemptId = '' } = useParams();
  const { data: a, error, isLoading, refetch } = useExamAttemptQuery(attemptId);
  const [update, updateState] = useUpdateExamTaskMutation();
  const [submit, submitState] = useSubmitExamMutation();
  const [current, setCurrent] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const running = !!a && !a.submittedAt;
  const now = useNow(running);
  const remaining = a ? new Date(a.deadline).getTime() - now : 0;

  // When time runs out, the server finalises the attempt on next read.
  useEffect(() => {
    if (running && remaining <= 0) {
      const t = setTimeout(() => refetch(), 2000);
      return () => clearTimeout(t);
    }
  }, [running, remaining, refetch]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !a) return <Loading />;
  if (a.submittedAt) return <Results a={a} />;

  const task = a.tasks[current]!;
  const state = a.taskStates[task.id] ?? { status: 'TODO' as const, passedChecks: [] };
  const setChecks = (ids: string[]) => update({ attemptId, taskId: task.id, patch: { passedChecks: ids } });
  const setStatus = (status: ExamTaskStatus) => update({ attemptId, taskId: task.id, patch: { status } });
  const done = Object.values(a.taskStates).filter(s => s.status === 'DONE').length;
  const lowTime = remaining < 10 * 60_000;

  return (
    <Box sx={{ maxWidth: 1300, mx: 'auto' }}>
      <Card sx={{ position: 'sticky', top: 72, zIndex: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ px: 2.5, py: 1.5 }}>
          <Typography variant="h6">{a.title}</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              {done}/{a.tasks.length} done
            </Typography>
            <Chip
              icon={<TimerOutlinedIcon />}
              color={remaining <= 0 ? 'error' : lowTime ? 'warning' : 'default'}
              label={remaining > 0 ? formatDuration(remaining) : 'Time is up'}
              sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '1rem' }}
              aria-live="off"
            />
            <Button variant="contained" onClick={() => setConfirm(true)}>
              Finish exam
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px minmax(0,1fr)' }, gap: 3 }}>
        <Card sx={{ alignSelf: 'start' }}>
          <List dense>
            {a.tasks.map((t, i) => (
              <ListItemButton key={t.id} selected={i === current} onClick={() => setCurrent(i)}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <StatusIcon status={a.taskStates[t.id]?.status} />
                </ListItemIcon>
                <ListItemText primary={`${i + 1}. ${t.title}`} secondary={`${t.points} pts`} />
              </ListItemButton>
            ))}
          </List>
        </Card>

        <Card>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Typography variant="overline" color="text.secondary">
                Task {current + 1} of {a.tasks.length} · {task.points} points
              </Typography>
              <Button size="small" color="warning" startIcon={<FlagIcon />} onClick={() => setStatus(state.status === 'FLAGGED' ? 'TODO' : 'FLAGGED')}>
                {state.status === 'FLAGGED' ? 'Unflag' : 'Flag for review'}
              </Button>
            </Stack>
            <Typography variant="h5" component="h2" gutterBottom>
              {task.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Set the context first:
            </Typography>
            <CodeBlock code={task.context} lang="bash" />
            <Markdown>{task.description}</Markdown>

            <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3 }}>
              Self-check
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Run each check on your cluster. Tick it only if the output matches. Your simulated score comes from these.
            </Typography>
            {task.checks.map(c => (
              <Box key={c.id} sx={{ mb: 1.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={state.passedChecks.includes(c.id)}
                      onChange={e => setChecks(e.target.checked ? [...state.passedChecks, c.id] : state.passedChecks.filter(x => x !== c.id))}
                    />
                  }
                  label={c.description}
                />
                <CodeBlock code={c.command} lang="bash" />
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: -1 }}>
                  Expected: <code>{c.expect}</code>
                </Typography>
              </Box>
            ))}
            {updateState.error && <Alert severity="error">{errorMessage(updateState.error)}</Alert>}

            <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
              <Button disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>
                Previous
              </Button>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" color="success" startIcon={<CheckCircleIcon />} onClick={() => setStatus(state.status === 'DONE' ? 'TODO' : 'DONE')}>
                  {state.status === 'DONE' ? 'Mark not done' : 'Mark done'}
                </Button>
                <Button variant="contained" disabled={current === a.tasks.length - 1} onClick={() => setCurrent(c => c + 1)}>
                  Next task
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Finish the exam?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {a.tasks.length - done} task(s) are not marked done. After finishing you can no longer change answers, and the solutions
            become visible.
          </DialogContentText>
          {submitState.error && <Alert severity="error">{errorMessage(submitState.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Keep working</Button>
          <Button variant="contained" disabled={submitState.isLoading} onClick={() => submit(attemptId).unwrap().then(() => setConfirm(false)).catch(() => undefined)}>
            Finish and score
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
