import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AlertTitle,
  Box,
  Breadcrumbs,
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
  LinearProgress,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import type { CheckResultDto, LabCheck, LabDto, LabTask, VerifyResultDto } from '@cka/contracts';
import {
  useLabQuery,
  useRestartLabSessionMutation,
  useRevealSolutionMutation,
  useRunTaskChecksMutation,
  useUpdateLabProgressMutation,
  useVerifyLabMutation,
} from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { CodeBlock } from '@/components/CodeBlock';
import { Markdown } from '@/components/Markdown';
import { ErrorState, Loading } from '@/components/states';
import { LABS_ENABLED } from '@/config';
import { useCurriculum } from '@/hooks/useCurriculum';
import { LabEnvironment, useLabSession } from '@/labs/LabEnvironment';
import { TerminalBridgeContext, type TerminalBridge } from '@/labs/terminalBridge';
import { LAB_TYPE_LABEL } from './LabsPage';

const MATCH_LABEL: Record<NonNullable<LabCheck['match']>, string> = {
  exact: 'Expected output',
  contains: 'Output contains',
  regex: 'Output matches',
  success: 'Passes when',
};

const ResultIcon = ({ r }: { r?: CheckResultDto }) =>
  !r ? null : r.passed ? <CheckCircleIcon fontSize="small" color="success" /> : <CancelIcon fontSize="small" color="error" />;

/**
 * Checks are read-only commands. Without a lab environment the student runs
 * them; with one, automatic checks (`match` set) run server-side and show a
 * verified result.
 */
export const ChecksList = ({ checks, results }: { checks: LabTask['checks']; results?: Record<string, CheckResultDto> }) =>
  checks.length === 0 ? null : (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Verify
      </Typography>
      {checks.map(c => {
        const r = results?.[c.id];
        return (
          <Box key={c.id} sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <ResultIcon r={r} />
              <Typography variant="body2">{c.description}</Typography>
              {!c.match && LABS_ENABLED && <Chip size="small" variant="outlined" label="check yourself" />}
            </Stack>
            <CodeBlock code={c.command} lang="bash" />
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: -1 }}>
              {c.match ? MATCH_LABEL[c.match] : 'Expected'}: <code>{c.expect}</code>
            </Typography>
            {r && !r.passed && (
              <Box component="pre" sx={{ mt: 1, p: 1, fontSize: '0.75rem', bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>
                {r.output || '(no output)'}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );

const TaskCard = ({
  labId,
  task,
  n,
  done,
  onToggle,
  hideByDefault,
  envReady,
  results,
}: {
  labId: string;
  task: LabTask;
  n: number;
  done: boolean;
  onToggle: (v: boolean) => void;
  hideByDefault: boolean;
  envReady: boolean;
  results: Record<string, CheckResultDto>;
}) => {
  const [reveal, revealState] = useRevealSolutionMutation();
  const [runChecks, checksState] = useRunTaskChecksMutation();
  const [confirming, setConfirming] = useState(false);
  const auto = task.checks.filter(c => c.match);
  const taskResults = Object.fromEntries(
    Object.values(results)
      .filter(r => r.taskId === task.id)
      .map(r => [r.checkId, r]),
  );
  const verified = auto.length > 0 && auto.every(c => taskResults[c.id]?.passed);

  const check = async () => {
    const res = await runChecks(task.id).unwrap().catch(() => null);
    if (res && res.every(r => r.passed) && !done) onToggle(true);
  };

  return (
    <Card sx={{ mb: 2, borderLeft: 4, borderLeftColor: done ? 'success.main' : 'divider' }}>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Typography variant="h6" component="h3">
            Task {n}. {task.title}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
            {verified && <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Verified" />}
            <FormControlLabel control={<Checkbox checked={done} onChange={e => onToggle(e.target.checked)} />} label="Done" sx={{ mr: 0 }} />
          </Stack>
        </Stack>
        <Markdown>{task.description}</Markdown>
        <ChecksList checks={task.checks} results={envReady ? taskResults : undefined} />
        {envReady && auto.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Button variant="contained" color="secondary" startIcon={<FactCheckOutlinedIcon />} onClick={check} disabled={checksState.isLoading}>
              {checksState.isLoading ? 'Checking…' : 'Check my work'}
            </Button>
            {checksState.error && <Alert severity="error" sx={{ mt: 1 }}>{errorMessage(checksState.error)}</Alert>}
          </Box>
        )}

        {task.hints.map((h, i) => (
          <Accordion key={i} disableGutters variant="outlined" sx={{ mt: 1.5, borderRadius: 2, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} alignItems="center">
                <LightbulbOutlinedIcon fontSize="small" color="warning" />
                <Typography fontWeight={600}>Hint {task.hints.length > 1 ? i + 1 : ''}</Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Markdown dense>{h}</Markdown>
            </AccordionDetails>
          </Accordion>
        ))}

        <Box sx={{ mt: 2 }}>
          {task.solution ? (
            <Alert severity="success" variant="outlined" icon={false} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
              <AlertTitle>Solution</AlertTitle>
              <Markdown dense>{task.solution}</Markdown>
            </Alert>
          ) : (
            <Button startIcon={<VisibilityOutlinedIcon />} onClick={() => (hideByDefault ? setConfirming(true) : reveal({ labId, taskId: task.id }))} disabled={revealState.isLoading}>
              Show solution
            </Button>
          )}
          {revealState.error && <Alert severity="error">{errorMessage(revealState.error)}</Alert>}
        </Box>
      </CardContent>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Reveal the solution?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Struggling for a while is where the learning happens — in the exam there is no solution button. Your lab will record that
            this task was solved with help.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Keep trying</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirming(false);
              reveal({ labId, taskId: task.id });
            }}
          >
            Show it
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

const VerifyPanel = ({ lab, envReady }: { lab: LabDto; envReady: boolean }) => {
  const [verify, state] = useVerifyLabMutation();
  const [result, setResult] = useState<VerifyResultDto | null>(null);
  if (!lab.verifyScript) return null;
  return (
    <>
      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        Verify everything
      </Typography>
      {envReady ? (
        <>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            Runs the lab's read-only verify script against your cluster.
          </Typography>
          <Button variant="contained" color="secondary" startIcon={<FactCheckOutlinedIcon />} disabled={state.isLoading} onClick={() => verify().unwrap().then(setResult).catch(() => undefined)}>
            {state.isLoading ? 'Verifying…' : 'Run verify'}
          </Button>
          {state.error && <Alert severity="error" sx={{ mt: 1 }}>{errorMessage(state.error)}</Alert>}
          {result && (
            <Alert severity={result.passed ? 'success' : 'warning'} sx={{ mt: 2 }}>
              <AlertTitle>{result.passed ? 'Every objective passes' : `${result.lines.filter(l => !l.passed).length} objective(s) still failing`}</AlertTitle>
              {result.lines.map(l => (
                <Stack key={l.text} direction="row" spacing={1} alignItems="center">
                  <ResultIcon r={{ passed: l.passed } as CheckResultDto} />
                  <Typography variant="body2">{l.text}</Typography>
                </Stack>
              ))}
            </Alert>
          )}
        </>
      ) : (
        <Typography color="text.secondary">
          A read-only script that checks every objective on your cluster. Save it as <code>verify.sh</code> and run{' '}
          <code>bash verify.sh</code>.
        </Typography>
      )}
      <CodeBlock code={lab.verifyScript} lang="bash" title="verify.sh" />
    </>
  );
};

export const LabPage = () => {
  const { labId = '' } = useParams();
  const { data, error, isLoading, refetch } = useLabQuery(labId);
  const [update, updateState] = useUpdateLabProgressMutation();
  const [restart, restartState] = useRestartLabSessionMutation();
  const { index } = useCurriculum();
  const { data: session } = useLabSession();
  const [paste, setPaste] = useState<((t: string) => void) | null>(null);
  const bridge = useMemo<TerminalBridge | null>(() => (paste ? { paste } : null), [paste]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <Loading />;
  const { lab, progress } = data;
  const completed = new Set(progress?.completedTasks ?? []);
  const pct = Math.round((completed.size / lab.tasks.length) * 100);
  const envReady = LABS_ENABLED && session?.labId === lab.id && session.phase === 'Ready';
  const results = envReady ? session!.results : {};

  const toggle = (taskId: string, on: boolean) => {
    const next = new Set(completed);
    if (on) next.add(taskId);
    else next.delete(taskId);
    update({ labId, patch: { completedTasks: [...next], status: next.size === lab.tasks.length ? 'COMPLETED' : 'IN_PROGRESS' } });
  };

  const instructions = (
    <>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/labs" underline="hover" color="inherit">
          Labs
        </Link>
        <Link component={RouterLink} to={`/learn/${lab.moduleId}`} underline="hover" color="inherit">
          {index?.modules.get(lab.moduleId)?.title ?? 'Module'}
        </Link>
      </Breadcrumbs>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <Chip size="small" color="primary" label={LAB_TYPE_LABEL[lab.type]} />
        <Chip size="small" variant="outlined" label={lab.difficulty} />
        <Chip size="small" variant="outlined" label={`${lab.minutes} min`} />
      </Stack>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
        {lab.title}
      </Typography>

      <Box sx={{ mt: 3 }}>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            {completed.size}/{lab.tasks.length} tasks done
          </Typography>
          {updateState.isLoading && <Typography variant="body2" color="text.secondary">Saving…</Typography>}
        </Stack>
        <LinearProgress variant="determinate" value={pct} sx={{ mt: 1 }} color={pct === 100 ? 'success' : 'primary'} />
        {updateState.error && <Alert severity="error" sx={{ mt: 1 }}>{errorMessage(updateState.error)}</Alert>}
      </Box>

      <Card sx={{ mt: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h5" component="h2" gutterBottom>
            Scenario
          </Typography>
          <Markdown>{lab.scenario}</Markdown>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2 }}>
            Objectives
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mt: 0.5 }}>
            {lab.objectives.map(o => (
              <li key={o}>
                <Markdown dense>{o}</Markdown>
              </li>
            ))}
          </Box>
        </CardContent>
      </Card>

      {LABS_ENABLED ? (
        <Alert severity="info" sx={{ mt: 3 }}>
          <AlertTitle>Your environment</AlertTitle>
          Start the environment beside these instructions to get a private cluster with this lab already set up, a
          terminal, and <strong>Check my work</strong> buttons that verify each task on the cluster. Prefer your own cluster? Run
          the setup below in your terminal instead — then you check the results yourself.
        </Alert>
      ) : (
        <Alert severity={lab.environment.destructive ? 'warning' : 'info'} sx={{ mt: 3 }}>
          <AlertTitle>Environment: {lab.environment.cluster === 'kind' ? 'a local kind cluster' : lab.environment.cluster === 'kubeadm' ? 'a kubeadm cluster you can break (VMs)' : 'any cluster'}</AlertTitle>
          {lab.environment.destructive && <strong>This lab changes or breaks cluster components. Only use a disposable cluster. </strong>}
          Commands run in your own terminal against the cluster in your current kubectl context — nothing is executed by this platform,
          and task status is what you record.
          {lab.environment.requirements.length > 0 && (
            <Box component="ul" sx={{ pl: 2.5, mb: 0 }}>
              {lab.environment.requirements.map(r => (
                <li key={r}>{r}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        Set up
      </Typography>
      {envReady ? (
        <Alert severity="success" variant="outlined">
          Already done: your environment ran the setup when it started.
        </Alert>
      ) : (
        <>
          <Markdown>{lab.setup.description}</Markdown>
          <CodeBlock code={lab.setup.commands} lang="bash" title="setup" />
        </>
      )}

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 2 }}>
        Tasks
      </Typography>
      {lab.tasks.map((t, i) => (
        <TaskCard
          key={t.id}
          labId={lab.id}
          task={t}
          n={i + 1}
          done={completed.has(t.id)}
          onToggle={v => toggle(t.id, v)}
          hideByDefault={lab.type !== 'guided'}
          envReady={envReady}
          results={results}
        />
      ))}

      <VerifyPanel lab={lab} envReady={envReady} />

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        <RestartAltIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        Reset
      </Typography>
      {envReady ? (
        <>
          <Typography color="text.secondary">Replace your environment with a fresh cluster and run the setup again.</Typography>
          <Button sx={{ mt: 1 }} variant="outlined" onClick={() => restart()} disabled={restartState.isLoading}>
            Reset my environment
          </Button>
        </>
      ) : (
        <>
          <Markdown>{lab.reset.description}</Markdown>
          <CodeBlock code={lab.reset.commands} lang="bash" title="reset" />
        </>
      )}
      <Button sx={{ mt: 1, mb: 6, display: 'block' }} onClick={() => update({ labId, patch: { completedTasks: [], status: 'NOT_STARTED' } })}>
        Also reset my task checkboxes
      </Button>
    </>
  );

  if (!LABS_ENABLED) return <Box sx={{ maxWidth: 900, mx: 'auto' }}>{instructions}</Box>;

  // KodeKloud-style split view: instructions scroll on the left, the
  // terminal stays put on the right. Stacked on small screens.
  return (
    <TerminalBridgeContext.Provider value={bridge}>
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 5fr) minmax(0, 6fr)' },
          alignItems: 'start',
        }}
      >
        <Box sx={{ minWidth: 0 }}>{instructions}</Box>
        <Box
          sx={{
            position: { lg: 'sticky' },
            top: { lg: 88 },
            height: { xs: '70vh', lg: 'calc(100vh - 120px)' },
            order: { xs: -1, lg: 0 },
          }}
        >
          <LabEnvironment labId={lab.id} labTitle={lab.title} onTerminal={p => setPaste(() => p)} />
        </Box>
      </Box>
    </TerminalBridgeContext.Provider>
  );
};
