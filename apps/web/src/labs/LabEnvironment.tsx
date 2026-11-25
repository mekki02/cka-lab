import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  Chip,
  LinearProgress,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Tooltip,
  Typography,
} from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { LabSessionDto, LabSessionPhase } from '@cka/contracts';
import {
  useEndLabSessionMutation,
  useLabSessionQuery,
  useRestartLabSessionMutation,
  useStartLabSessionMutation,
} from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
// xterm.js is ~300 kB: only download it when a terminal is actually shown.
const LabTerminal = lazy(() => import('./LabTerminal').then(m => ({ default: m.LabTerminal })));

const STEPS: { phase: LabSessionPhase; label: string }[] = [
  { phase: 'Provisioning', label: 'Cluster' },
  { phase: 'Starting', label: 'Terminal' },
  { phase: 'SettingUp', label: 'Lab setup' },
  { phase: 'Ready', label: 'Ready' },
];

const useNow = (ms: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
};

const minutesLeft = (iso: string, now: number) => Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));

/** The current session, polled quickly while it is starting and slowly after. */
export const useLabSession = () => {
  const [interval, setIntervalMs] = useState(0);
  const q = useLabSessionQuery(undefined, { pollingInterval: interval, skipPollingIfUnfocused: true });
  const phase = q.data?.phase;
  const exerciseLoading = q.data?.exercise?.state === 'Loading';
  useEffect(() => {
    const settled = (phase === 'Ready' || phase === 'Failed') && !exerciseLoading;
    setIntervalMs(!q.data ? 0 : settled ? 60_000 : 2_000);
  }, [q.data, phase, exerciseLoading]);
  return q;
};

const SessionBar = ({ session }: { session: LabSessionDto }) => {
  const now = useNow(30_000);
  const [restart, restartState] = useRestartLabSessionMutation();
  const [end, endState] = useEndLabSessionMutation();
  const idle = minutesLeft(session.idleExpiresAt, now);
  const hard = minutesLeft(session.expiresAt, now);
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, flexWrap: 'wrap', rowGap: 1 }}>
      <TerminalIcon fontSize="small" color="secondary" />
      <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
        Your cluster · Kubernetes v{session.kubernetesVersion}
      </Typography>
      <Tooltip title="Idle environments are deleted; typing in the terminal or running checks keeps it alive.">
        <Chip size="small" variant="outlined" label={`${Math.min(idle, hard)} min left`} />
      </Tooltip>
      <Tooltip title="Delete this cluster and start a fresh one (runs the lab setup again)">
        <span>
          <Button size="small" startIcon={<RestartAltIcon />} onClick={() => restart()} disabled={restartState.isLoading}>
            Reset
          </Button>
        </span>
      </Tooltip>
      <Button size="small" color="inherit" startIcon={<StopCircleOutlinedIcon />} onClick={() => end()} disabled={endState.isLoading}>
        End
      </Button>
    </Stack>
  );
};

/**
 * Everything about the student's lab environment for one lab (or the
 * playground, labId = null): start it, watch it provision, use the terminal.
 */
export const LabEnvironment = ({
  labId,
  labTitle,
  exercise,
  onTerminal,
  onReader,
}: {
  labId: string | null;
  labTitle?: string;
  /** Playground started for an exercise: it is loaded as soon as the cluster is ready. */
  exercise?: { id: string; title: string };
  onTerminal?: (paste: ((t: string) => void) | null) => void;
  onReader?: (read: (() => string) | null) => void;
}) => {
  const { data: session, isLoading, error } = useLabSession();
  const [start, startState] = useStartLabSessionMutation();
  const [restart, restartState] = useRestartLabSessionMutation();
  const [end] = useEndLabSessionMutation();
  const now = useNow(1000);

  const frame = (children: React.ReactNode) => (
    <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {children}
    </Card>
  );

  if (isLoading) return frame(<LinearProgress />);
  if (error) return frame(<Alert severity="error">{errorMessage(error, 'Lab environments are unavailable right now.')}</Alert>);

  const mine = session && session.labId === labId ? session : null;

  if (!mine) {
    const other = session ? (session.labId ? `the lab "${session.labId}"` : 'the playground') : null;
    return frame(
      <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ flex: 1, p: 4, textAlign: 'center', bgcolor: '#0d1117', color: '#e6edf3' }}>
        <TerminalIcon sx={{ fontSize: 48, color: 'secondary.main' }} />
        <Typography variant="h6">
          {labId ? 'Do this lab in your browser' : exercise ? 'Solve this exercise in your browser' : 'Your Kubernetes playground'}
        </Typography>
        <Typography variant="body2" sx={{ maxWidth: 420, color: '#9da7b3' }}>
          {labId
            ? `You get a private cluster with ${labTitle ? `"${labTitle}"` : 'the lab'} already set up, a terminal with kubectl, and checks that verify your work.`
            : exercise
              ? 'Starts your playground cluster with this exercise already set up. Later exercises load into the same cluster in seconds.'
              : 'An empty cluster where you are cluster-admin. Try anything — it is yours alone and deleted when you are done.'}
        </Typography>
        {other && (
          <Alert severity="info" variant="outlined" sx={{ color: 'inherit' }}>
            You have an environment running for {other}. Starting this one ends it.
          </Alert>
        )}
        <Button
          variant="contained"
          size="large"
          onClick={() => start(labId ? { labId } : exercise ? { exerciseId: exercise.id } : {})}
          disabled={startState.isLoading}
        >
          {startState.isLoading ? 'Starting…' : 'Start environment'}
        </Button>
        {startState.error && <Alert severity="error">{errorMessage(startState.error)}</Alert>}
      </Stack>,
    );
  }

  if (mine.phase === 'Failed') {
    return frame(
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          <AlertTitle>Your environment could not start</AlertTitle>
          {mine.message}
        </Alert>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => restart()} disabled={restartState.isLoading}>
            Try again
          </Button>
          <Button onClick={() => end()}>Remove it</Button>
        </Stack>
      </Box>,
    );
  }

  if (mine.phase !== 'Ready') {
    const active = STEPS.findIndex(s => s.phase === mine.phase);
    const elapsed = Math.max(0, Math.round((now - new Date(mine.createdAt).getTime()) / 1000));
    return frame(
      <Stack spacing={3} justifyContent="center" sx={{ flex: 1, p: 4, bgcolor: '#0d1117', color: '#e6edf3' }}>
        <Typography variant="h6" textAlign="center">
          Preparing your cluster…
        </Typography>
        <Stepper activeStep={active} alternativeLabel sx={{ '& .MuiStepLabel-label': { color: '#9da7b3 !important' } }}>
          {STEPS.filter(s => s.phase !== 'SettingUp' || labId).map(s => (
            <Step key={s.phase}>
              <StepLabel>{s.label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <LinearProgress color="secondary" />
        <Typography variant="body2" textAlign="center" sx={{ color: '#9da7b3' }}>
          {mine.message ?? 'Working'} · {elapsed}s (usually under a minute)
        </Typography>
      </Stack>,
    );
  }

  return frame(
    <>
      <SessionBar session={mine} />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', p: 1, pt: 0 }}>
        <Suspense fallback={<LinearProgress sx={{ flex: 1, alignSelf: 'flex-start' }} />}>
          <LabTerminal sessionId={mine.id} onReady={onTerminal} onReader={onReader} />
        </Suspense>
      </Box>
    </>,
  );
};
