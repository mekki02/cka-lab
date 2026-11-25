import {
  Alert,
  AlertTitle,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Link,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ReplayIcon from '@mui/icons-material/Replay';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import type {
  ExerciseCheckDto,
  ExerciseCheckResultDto,
  ExerciseCheckType,
  ExerciseDetailDto,
  ExerciseDto,
  ExerciseValidationDto,
  LabSessionDto,
} from '@cka/contracts';
import {
  useExerciseQuery,
  useLoadExerciseMutation,
  useRecordExerciseAttemptMutation,
  useRevealExerciseSolutionMutation,
  useValidateExerciseMutation,
} from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { CodeBlock } from '@/components/CodeBlock';
import { Markdown } from '@/components/Markdown';
import { ErrorState, Loading } from '@/components/states';
import { LABS_ENABLED } from '@/config';
import { useCurriculum } from '@/hooks/useCurriculum';
import { LabEnvironment, useLabSession } from '@/labs/LabEnvironment';
import { TerminalBridgeContext, type TerminalBridge } from '@/labs/terminalBridge';
import { EXERCISE_KIND_LABEL } from './ExerciseList';

const CHECK_TYPE_LABEL: Record<ExerciseCheckType, string> = {
  cluster: 'Cluster',
  answer: 'Your answer',
  file: 'File',
  history: 'Command used',
  terminal: 'Terminal output',
};

const CHECK_TYPE_HELP: Record<ExerciseCheckType, string> = {
  cluster: 'Inspects the objects in your cluster',
  answer: 'Compares what you entered below',
  file: 'Reads a file you saved in your home directory',
  history: 'Looks for a command in your shell history',
  terminal: 'Looks at what your terminal currently shows',
};

/** The loaded-exercise state of the session, as this page sees it. */
const envState = (session: LabSessionDto | null | undefined, id: string) => {
  if (!session || session.labId !== null) return 'none' as const;
  if (session.phase !== 'Ready') return session.phase === 'Failed' ? ('failed' as const) : ('starting' as const);
  if (session.exercise?.id !== id) return 'other' as const;
  return session.exercise.state === 'Ready' ? ('ready' as const) : session.exercise.state === 'Failed' ? ('load-failed' as const) : ('loading' as const);
};

// --- Left pane: statement, hints, solution ------------------------------------

const StatementPane = ({ detail }: { detail: ExerciseDetailDto }) => {
  const { exercise: e, progress } = detail;
  const { index } = useCurriculum();
  const [tab, setTab] = useState(0);
  const [hints, setHints] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [reveal, revealState] = useRevealExerciseSolutionMutation();
  const module = index?.modules.get(e.moduleId);
  const lesson = e.lessonId ? index?.lessons.get(e.lessonId) : undefined;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 2, md: 3 }, pt: 2 }}>
        <Breadcrumbs sx={{ mb: 1, fontSize: '0.85rem' }}>
          <Link component={RouterLink} to="/exercises" underline="hover" color="inherit">
            Exercises
          </Link>
          {module && (
            <Link component={RouterLink} to={`/learn/${module.id}`} underline="hover" color="inherit">
              {module.title}
            </Link>
          )}
          {lesson && (
            <Link component={RouterLink} to={`/learn/${module?.id}/${lesson.id}`} underline="hover" color="inherit">
              {lesson.title}
            </Link>
          )}
        </Breadcrumbs>
        <Stack direction="row" spacing={0.75} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.75 }}>
          <Chip size="small" color={e.kind === 'challenge' ? 'secondary' : 'primary'} label={EXERCISE_KIND_LABEL[e.kind]} />
          <Chip size="small" variant="outlined" label={e.difficulty} />
          <Chip size="small" variant="outlined" label={`${e.minutes} min`} />
          {e.tags.map(t => (
            <Chip key={t} size="small" variant="outlined" label={t} />
          ))}
          {progress?.status === 'COMPLETED' && <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Solved" />}
        </Stack>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', md: '1.85rem' } }}>
          {e.title}
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Statement" />
          <Tab label={`Hints${e.hints.length ? ` (${e.hints.length})` : ''}`} disabled={e.hints.length === 0} />
          <Tab label="Solution" />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 2, md: 3 }, py: 2 }}>
        {tab === 0 && (
          <>
            <Markdown>{e.statement}</Markdown>
            {(e.namespaces.length > 0 || e.files.length > 0) && (
              <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
                {e.namespaces.length > 0 && (
                  <div>
                    Namespace{e.namespaces.length > 1 ? 's' : ''}: {e.namespaces.map(n => <code key={n}>{n} </code>)}
                  </div>
                )}
                {e.files.length > 0 && (
                  <div>
                    Starter files: {e.files.map(f => <code key={f}>~/{f} </code>)}
                  </div>
                )}
              </Alert>
            )}
            {!LABS_ENABLED && e.setup.trim() && (
              <>
                <Typography variant="h6" sx={{ mt: 3 }}>
                  Set up on your own cluster
                </Typography>
                <CodeBlock code={[...e.namespaces.map(n => `kubectl create namespace ${n}`), e.setup.trim()].join('\n')} lang="bash" title="setup" />
              </>
            )}
          </>
        )}

        {tab === 1 && (
          <Stack spacing={1.5}>
            {e.hints.slice(0, hints).map((h, i) => (
              <Alert key={i} severity="warning" variant="outlined" icon={<LightbulbOutlinedIcon />}>
                <AlertTitle>Hint {i + 1}</AlertTitle>
                <Markdown dense>{h}</Markdown>
              </Alert>
            ))}
            {hints < e.hints.length ? (
              <Button startIcon={<LightbulbOutlinedIcon />} onClick={() => setHints(n => n + 1)} sx={{ alignSelf: 'flex-start' }}>
                {hints === 0 ? 'Show the first hint' : 'Show the next hint'}
              </Button>
            ) : (
              <Typography variant="body2" color="text.secondary">
                That was the last hint.
              </Typography>
            )}
          </Stack>
        )}

        {tab === 2 &&
          (e.solution ? (
            <Markdown>{e.solution}</Markdown>
          ) : (
            <Stack spacing={2} alignItems="flex-start">
              <Typography color="text.secondary">
                Try the hints first. Exams have no solution button: the time you spend stuck is where the learning happens.
              </Typography>
              <Button variant="outlined" startIcon={<VisibilityOutlinedIcon />} onClick={() => setConfirming(true)} disabled={revealState.isLoading}>
                Show the solution
              </Button>
              {revealState.error && <Alert severity="error">{errorMessage(revealState.error)}</Alert>}
            </Stack>
          ))}
      </Box>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Reveal the solution?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your progress will record that this {e.kind} was solved with help. You can still validate it afterwards.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Keep trying</Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirming(false);
              void reveal(e.id);
            }}
          >
            Show it
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

// --- Bottom-right pane: answers, test cases, Validate ---------------------------

const TestCase = ({ check, result, n }: { check: ExerciseCheckDto; result?: ExerciseCheckResultDto; n: number }) => {
  const [open, setOpen] = useState(false);
  const failed = result && !result.passed;
  useEffect(() => setOpen(!!failed), [failed, result]);
  return (
    <Box sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Stack direction="row" spacing={1} alignItems="center" onClick={() => result?.output && setOpen(o => !o)} sx={{ cursor: result?.output ? 'pointer' : 'default' }}>
        {!result ? (
          <RadioButtonUncheckedIcon fontSize="small" color="disabled" />
        ) : result.passed ? (
          <CheckCircleIcon fontSize="small" color="success" />
        ) : (
          <CancelIcon fontSize="small" color="error" />
        )}
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          <Box component="span" sx={{ color: 'text.secondary', mr: 0.75 }}>
            Test {n}
          </Box>
          {check.description}
        </Typography>
        <Tooltip title={CHECK_TYPE_HELP[check.type]}>
          <Chip size="small" variant="outlined" label={CHECK_TYPE_LABEL[check.type]} />
        </Tooltip>
      </Stack>
      <Collapse in={open && !!result?.output}>
        <Box
          component="pre"
          sx={{ m: 0, mt: 0.75, ml: 3.5, p: 1, fontSize: '0.75rem', bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}
        >
          {result?.output}
        </Box>
      </Collapse>
    </Box>
  );
};

const AnswerFields = ({ e, answers, setAnswers, disabled }: { e: ExerciseDto; answers: Record<string, string>; setAnswers: (f: (a: Record<string, string>) => Record<string, string>) => void; disabled: boolean }) =>
  e.inputs.length === 0 ? null : (
    <Stack spacing={1.5} sx={{ mb: 2 }}>
      {e.inputs.map(i =>
        i.kind === 'choice' ? (
          <Box key={i.id}>
            <Typography variant="subtitle2">{i.label}</Typography>
            <RadioGroup value={answers[i.id] ?? ''} onChange={ev => setAnswers(a => ({ ...a, [i.id]: ev.target.value }))}>
              {i.options.map(o => (
                <FormControlLabel
                  key={o.id}
                  value={o.id}
                  disabled={disabled}
                  control={<Radio size="small" />}
                  label={<Markdown dense>{o.text}</Markdown>}
                  sx={{ alignItems: 'flex-start', '& .MuiRadio-root': { pt: 0.5 } }}
                />
              ))}
            </RadioGroup>
          </Box>
        ) : (
          <TextField
            key={i.id}
            size="small"
            label={i.label}
            placeholder={i.placeholder ?? undefined}
            value={answers[i.id] ?? ''}
            disabled={disabled}
            onChange={ev => setAnswers(a => ({ ...a, [i.id]: ev.target.value }))}
            slotProps={{ htmlInput: { spellCheck: false, autoComplete: 'off', style: { fontFamily: '"JetBrains Mono", Menlo, monospace' } } }}
          />
        ),
      )}
    </Stack>
  );

const ValidatePanel = ({
  detail,
  session,
  readTerminal,
}: {
  detail: ExerciseDetailDto;
  session: LabSessionDto | null | undefined;
  readTerminal: (() => string) | null;
}) => {
  const e = detail.exercise;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExerciseValidationDto | null>(null);
  const [validate, validateState] = useValidateExerciseMutation();
  const [record] = useRecordExerciseAttemptMutation();
  const [load, loadState] = useLoadExerciseMutation();
  const state = envState(session, e.id);
  const ready = state === 'ready';
  const byId = useMemo(() => new Map((result?.results ?? []).map(r => [r.checkId, r])), [result]);
  const passedCount = result?.results.filter(r => r.passed).length ?? 0;

  const run = async () => {
    const res = await validate({ exerciseId: e.id, answers, terminal: readTerminal?.() ?? '' })
      .unwrap()
      .catch(() => null);
    if (!res) return;
    setResult(res);
    void record({ exerciseId: e.id, passed: res.passed });
  };

  const reset = () => {
    setResult(null);
    void load(e.id);
  };

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {e.inputs.length ? 'Your answer & test cases' : 'Test cases'}
        </Typography>
        {state === 'loading' && (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              {session?.exercise?.message ?? 'Setting up the exercise'}
            </Typography>
          </Stack>
        )}
        {(ready || state === 'load-failed') && (
          <Tooltip title="Delete this exercise's namespaces and files and set it up again">
            <span>
              <Button size="small" startIcon={<ReplayIcon />} onClick={reset} disabled={loadState.isLoading}>
                Reset exercise
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2, py: 1.5 }}>
        {state === 'load-failed' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>The exercise could not be set up</AlertTitle>
            {session?.exercise?.message}
          </Alert>
        )}
        {loadState.error && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(loadState.error)}</Alert>}

        <AnswerFields e={e} answers={answers} setAnswers={setAnswers} disabled={!LABS_ENABLED} />

        {e.checks.map((c, i) => (
          <TestCase key={c.id} check={c} n={i + 1} result={byId.get(c.id)} />
        ))}

        {result && (
          <Alert severity={result.passed ? 'success' : 'warning'} sx={{ mt: 1.5 }}>
            <AlertTitle sx={{ mb: result.passed ? 0.5 : 0 }}>
              {result.passed ? 'Solved: every test passes' : `${passedCount}/${result.results.length} tests pass`}
            </AlertTitle>
            {result.passed
              ? detail.progress && detail.progress.attempts > 1
                ? `Took ${detail.progress.attempts} attempts. `
                : ''
              : 'Open a failed test to see what the checker saw.'}
          </Alert>
        )}
        {validateState.error && <Alert severity="error" sx={{ mt: 1.5 }}>{errorMessage(validateState.error)}</Alert>}
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
        {detail.previousId && (
          <Tooltip title="Previous exercise">
            <Button component={RouterLink} to={`/exercises/${detail.previousId}`} color="inherit" sx={{ minWidth: 0 }}>
              <ArrowBackIcon fontSize="small" />
            </Button>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        {result?.passed && detail.nextId && (
          <Button component={RouterLink} to={`/exercises/${detail.nextId}`} endIcon={<ArrowForwardIcon />}>
            Next exercise
          </Button>
        )}
        {LABS_ENABLED ? (
          <Button
            variant="contained"
            color={result?.passed ? 'success' : 'secondary'}
            size="large"
            startIcon={validateState.isLoading ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            onClick={run}
            disabled={!ready || validateState.isLoading}
          >
            {validateState.isLoading ? 'Validating…' : result?.passed ? 'Validate again' : 'Validate'}
          </Button>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Automatic validation needs browser lab environments.
          </Typography>
        )}
        {!result?.passed && detail.nextId && !LABS_ENABLED && (
          <Button component={RouterLink} to={`/exercises/${detail.nextId}`} endIcon={<ArrowForwardIcon />}>
            Next
          </Button>
        )}
      </Stack>
    </Card>
  );
};

// --- Page -------------------------------------------------------------------

/**
 * CodinGame-style exercise page: the statement on the left; on the right
 * the terminal (the student's playground with the exercise loaded) above
 * the answer fields, the test cases and Validate.
 */
export const ExercisePage = () => {
  const { exerciseId = '' } = useParams();
  const { data, error, isLoading, refetch } = useExerciseQuery(exerciseId);
  const { data: session } = useLabSession();
  const [load] = useLoadExerciseMutation();
  const [paste, setPaste] = useState<((t: string) => void) | null>(null);
  const [reader, setReader] = useState<(() => string) | null>(null);
  const bridge = useMemo<TerminalBridge | null>(() => (paste ? { paste } : null), [paste]);
  const requested = useRef<string | null>(null);

  // Opening an exercise with a playground running loads it into that
  // cluster. Once per visit: a failed load waits for "Reset exercise".
  const state = envState(session, exerciseId);
  useEffect(() => {
    if (!LABS_ENABLED || state !== 'other' || requested.current === exerciseId) return;
    requested.current = exerciseId;
    void load(exerciseId);
  }, [state, exerciseId, load]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <Loading />;
  const e = data.exercise;

  if (!LABS_ENABLED) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto', display: 'grid', gap: 3 }}>
        <Box sx={{ minHeight: 400 }}>
          <StatementPane key={e.id} detail={data} />
        </Box>
        <ValidatePanel key={`v-${e.id}`} detail={data} session={null} readTerminal={null} />
      </Box>
    );
  }

  return (
    <TerminalBridgeContext.Provider value={bridge}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 5fr) minmax(0, 7fr)' },
          height: { lg: 'calc(100vh - 112px)' },
        }}
      >
        <Box sx={{ minHeight: 0, height: { xs: 'auto', lg: '100%' }, maxHeight: { xs: '70vh', lg: 'none' } }}>
          <StatementPane key={e.id} detail={data} />
        </Box>
        <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ flex: '1 1 58%', minHeight: { xs: '60vh', lg: 280 } }}>
            <LabEnvironment
              labId={null}
              exercise={{ id: e.id, title: e.title }}
              onTerminal={p => setPaste(() => p)}
              onReader={r => setReader(() => r)}
            />
          </Box>
          <Box sx={{ flex: '0 1 42%', minHeight: 0, display: 'flex' }}>
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <ValidatePanel key={`v-${e.id}`} detail={data} session={session} readTerminal={reader} />
            </Box>
          </Box>
        </Box>
      </Box>
    </TerminalBridgeContext.Provider>
  );
};
