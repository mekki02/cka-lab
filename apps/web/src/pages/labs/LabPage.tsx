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
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import type { LabTask } from '@cka/contracts';
import { useLabQuery, useRevealSolutionMutation, useUpdateLabProgressMutation } from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { CodeBlock } from '@/components/CodeBlock';
import { Markdown } from '@/components/Markdown';
import { ErrorState, Loading } from '@/components/states';
import { useCurriculum } from '@/hooks/useCurriculum';
import { LAB_TYPE_LABEL } from './LabsPage';

/** Checks are commands for the student's terminal; the platform never runs them. */
export const ChecksList = ({ checks }: { checks: LabTask['checks'] }) =>
  checks.length === 0 ? null : (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Verify on your cluster
      </Typography>
      {checks.map(c => (
        <Box key={c.id} sx={{ mb: 1.5 }}>
          <Typography variant="body2">{c.description}</Typography>
          <CodeBlock code={c.command} lang="bash" />
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: -1 }}>
            Expected: <code>{c.expect}</code>
          </Typography>
        </Box>
      ))}
    </Box>
  );

const TaskCard = ({
  labId,
  task,
  n,
  done,
  onToggle,
  hideByDefault,
}: {
  labId: string;
  task: LabTask;
  n: number;
  done: boolean;
  onToggle: (v: boolean) => void;
  hideByDefault: boolean;
}) => {
  const [reveal, revealState] = useRevealSolutionMutation();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card sx={{ mb: 2, borderLeft: 4, borderLeftColor: done ? 'success.main' : 'divider' }}>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Typography variant="h6" component="h3">
            Task {n}. {task.title}
          </Typography>
          <FormControlLabel control={<Checkbox checked={done} onChange={e => onToggle(e.target.checked)} />} label="Done" sx={{ mr: 0, flexShrink: 0 }} />
        </Stack>
        <Markdown>{task.description}</Markdown>
        <ChecksList checks={task.checks} />

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

export const LabPage = () => {
  const { labId = '' } = useParams();
  const { data, error, isLoading, refetch } = useLabQuery(labId);
  const [update, updateState] = useUpdateLabProgressMutation();
  const { index } = useCurriculum();

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <Loading />;
  const { lab, progress } = data;
  const completed = new Set(progress?.completedTasks ?? []);
  const pct = Math.round((completed.size / lab.tasks.length) * 100);

  const toggle = (taskId: string, on: boolean) => {
    const next = new Set(completed);
    if (on) next.add(taskId);
    else next.delete(taskId);
    update({ labId, patch: { completedTasks: [...next], status: next.size === lab.tasks.length ? 'COMPLETED' : 'IN_PROGRESS' } });
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
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

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        Set up
      </Typography>
      <Markdown>{lab.setup.description}</Markdown>
      <CodeBlock code={lab.setup.commands} lang="bash" title="setup" />

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 2 }}>
        Tasks
      </Typography>
      {lab.tasks.map((t, i) => (
        <TaskCard key={t.id} labId={lab.id} task={t} n={i + 1} done={completed.has(t.id)} onToggle={v => toggle(t.id, v)} hideByDefault={lab.type !== 'guided'} />
      ))}

      {lab.verifyScript && (
        <>
          <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
            Verify everything
          </Typography>
          <Typography color="text.secondary">
            A read-only script that checks every objective on your cluster. Save it as <code>verify.sh</code> and run{' '}
            <code>bash verify.sh</code>.
          </Typography>
          <CodeBlock code={lab.verifyScript} lang="bash" title="verify.sh" />
        </>
      )}

      <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
        <RestartAltIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        Reset
      </Typography>
      <Markdown>{lab.reset.description}</Markdown>
      <CodeBlock code={lab.reset.commands} lang="bash" title="reset" />
      <Button sx={{ mt: 1, mb: 6 }} onClick={() => update({ labId, patch: { completedTasks: [], status: 'NOT_STARTED' } })}>
        Also reset my task checkboxes
      </Button>
    </Box>
  );
};
