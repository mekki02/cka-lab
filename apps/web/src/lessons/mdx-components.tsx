import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TerminalIcon from '@mui/icons-material/Terminal';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { isValidElement, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { MDXComponents } from 'mdx/types';
import { codeFrameSx, CodeTitle, CopyButton, RunInTerminalButton } from '@/components/CodeBlock';
import { useTerminalBridge } from '@/labs/terminalBridge';
import { anchorOf } from './anchor';
import { Diagram } from './Diagram';

/**
 * Everything a lesson can use. Authors write these by name in .mdx without
 * importing them — see docs/CONTENT_AUTHORING.md for the full reference.
 */

type Children = { children?: ReactNode };

const textOf = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<Children>(node)) return textOf(node.props.children);
  return '';
};

const SCROLL_MARGIN = { scrollMarginTop: '88px' };

// --- code -----------------------------------------------------------------

/** Fenced code, already highlighted by Shiki at build time. */
const Pre = (props: Children & { 'data-title'?: string; className?: string; style?: object; tabIndex?: number }) => {
  const dark = useTheme().palette.mode === 'dark';
  const { children, 'data-title': title, className } = props;
  const runnable = useTerminalBridge() !== null && /language-(bash|shell)/.test(className ?? '');
  return (
    <Box sx={codeFrameSx(dark, runnable)}>
      {title && <CodeTitle>{title}</CodeTitle>}
      <CopyButton text={textOf(children).replace(/\n$/, '')} />
      {runnable && <RunInTerminalButton text={textOf(children).replace(/\n$/, '')} />}
      <pre className={className} tabIndex={0}>
        {children}
      </pre>
    </Box>
  );
};

/**
 * A command and what it prints, so learners know what "working" looks like.
 *
 *   <Terminal command="kubectl get svc web" output={`NAME  TYPE ...`} />
 *
 * MDX strips leading indentation from multi-line JSX attribute strings, so
 * output whose indentation matters (YAML, JSON) goes in a fenced block as
 * children instead:
 *
 *   <Terminal command="kubectl get svc web -o yaml">
 *   ```text
 *   spec:
 *     ports: ...
 *   ```
 *   </Terminal>
 */
const Terminal = ({
  command,
  output: outputProp,
  prompt = '$',
  title,
  children,
}: Children & { command: string; output?: string; prompt?: string; title?: string }) => {
  const dark = useTheme().palette.mode === 'dark';
  const cmd = command.trim();
  const runnable = useTerminalBridge() !== null;
  const output = outputProp ?? (children ? textOf(children) : undefined);
  return (
    <Box sx={{ ...codeFrameSx(dark, runnable), bgcolor: dark ? '#0a0e14' : '#0f172a', color: '#e2e8f0' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <TerminalIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
        <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
          {title ?? 'terminal'}
        </Typography>
      </Stack>
      <CopyButton text={cmd} />
      {runnable && <RunInTerminalButton text={cmd} />}
      <pre>
        <code>
          {cmd.split('\n').map((line, i) => (
            <Box component="span" key={i} sx={{ display: 'block' }}>
              <Box component="span" sx={{ color: '#5eead4', userSelect: 'none' }}>
                {i === 0 || !cmd.split('\n')[i - 1]!.endsWith('\\') ? `${prompt} ` : '  '}
              </Box>
              <Box component="span" sx={{ color: '#f8fafc' }}>{line}</Box>
            </Box>
          ))}
          {output && (
            <Box component="span" sx={{ display: 'block', color: '#94a3b8', mt: 0.5 }}>
              {output.replace(/^\n+|\n+$/g, '')}
            </Box>
          )}
        </code>
      </pre>
    </Box>
  );
};

// --- callouts ---------------------------------------------------------------

const CALLOUTS = {
  note: { severity: 'info', title: 'Note' },
  tip: { severity: 'success', title: 'Tip' },
  warning: { severity: 'warning', title: 'Warning' },
  danger: { severity: 'error', title: 'Careful' },
  exam: { severity: 'info', title: 'Exam tip' },
  mistakes: { severity: 'warning', title: 'Common mistakes' },
} as const;

const Callout = ({ type = 'note', title, children }: Children & { type?: keyof typeof CALLOUTS; title?: string }) => {
  const c = CALLOUTS[type] ?? CALLOUTS.note;
  return (
    <Alert
      severity={c.severity}
      icon={type === 'exam' ? <FlagOutlinedIcon /> : undefined}
      variant="outlined"
      sx={{ my: 2.5, '& .MuiAlert-message': { width: '100%' }, '& p:first-of-type': { mt: 0 }, '& p:last-child': { mb: 0 } }}
    >
      <AlertTitle sx={{ fontWeight: 650 }}>{title ?? c.title}</AlertTitle>
      {children}
    </Alert>
  );
};

// --- methodology ------------------------------------------------------------

const PHASES = {
  theory: 'Theory',
  visualization: 'Visualization',
  'command-line': 'Command line',
  example: 'Practical example',
  guided: 'Guided exercise',
  challenge: 'Independent challenge',
  troubleshooting: 'Troubleshooting',
  solution: 'Solution',
  check: 'Knowledge check',
} as const;

/** Marks which step of the teaching method a section is: <Phase step="theory" /> */
const Phase = ({ step }: { step: keyof typeof PHASES }) => {
  const index = Object.keys(PHASES).indexOf(step) + 1;
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 6, mb: -1 }}>
      <Chip size="small" color="primary" variant="outlined" label={`Step ${index}`} />
      <Typography variant="overline" color="primary">
        {PHASES[step] ?? step}
      </Typography>
    </Stack>
  );
};

// --- exercises --------------------------------------------------------------

const EXERCISE = {
  guided: { label: 'Guided exercise', icon: <ScienceOutlinedIcon />, color: 'primary' },
  challenge: { label: 'Challenge', icon: <FlagOutlinedIcon />, color: 'secondary' },
  troubleshooting: { label: 'Troubleshooting', icon: <BugReportOutlinedIcon />, color: 'warning' },
} as const;

const Exercise = ({ kind = 'guided', title, children }: Children & { kind?: keyof typeof EXERCISE; title: string }) => {
  const e = EXERCISE[kind];
  return (
    <Paper variant="outlined" sx={{ my: 3, p: { xs: 2, md: 3 }, borderRadius: 3, borderLeft: 4, borderLeftColor: `${e.color}.main` }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: `${e.color}.main`, mb: 1 }}>
        {e.icon}
        <Typography variant="overline">{e.label}</Typography>
      </Stack>
      <Typography variant="h6" component="p" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
};

/** Collapsed until the learner asks for it. */
const Reveal = ({ label, icon, children }: Children & { label: string; icon: ReactNode }) => (
  <Accordion disableGutters variant="outlined" sx={{ my: 1.5, borderRadius: 2, '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Stack direction="row" spacing={1} alignItems="center">
        {icon}
        <Typography fontWeight={600}>{label}</Typography>
      </Stack>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
  </Accordion>
);

const Hint = ({ children }: Children) => (
  <Reveal label="Hint" icon={<LightbulbOutlinedIcon fontSize="small" color="warning" />}>
    {children}
  </Reveal>
);

const Solution = ({ children, title = 'Show solution' }: Children & { title?: string }) => (
  <Reveal label={title} icon={<CheckCircleOutlineIcon fontSize="small" color="success" />}>
    {children}
  </Reveal>
);

/**
 * Inline, self-graded question. Not stored — module quizzes are the graded,
 * persisted assessment.
 *
 *   <KnowledgeCheck question="..." options={['a', 'b']} answer={1} explanation="..." />
 */
const KnowledgeCheck = ({
  question,
  options,
  answer,
  explanation,
}: {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}) => {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  return (
    <Paper variant="outlined" sx={{ my: 3, p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Typography variant="overline" color="primary">
        Check your understanding
      </Typography>
      <Typography fontWeight={600} sx={{ mb: 2 }}>
        {question}
      </Typography>
      <Stack spacing={1}>
        {options.map((o, i) => {
          const isAnswer = i === answer;
          const color = !done ? 'inherit' : isAnswer ? 'success' : i === picked ? 'error' : 'inherit';
          return (
            <Button
              key={i}
              variant={done && (isAnswer || i === picked) ? 'contained' : 'outlined'}
              color={color}
              disabled={done && !isAnswer && i !== picked}
              onClick={() => setPicked(i)}
              sx={{ justifyContent: 'flex-start', textAlign: 'left', ...(done ? { pointerEvents: 'none' } : {}) }}
            >
              {o}
            </Button>
          );
        })}
      </Stack>
      {done && (
        <Alert severity={picked === answer ? 'success' : 'error'} sx={{ mt: 2 }}>
          <AlertTitle>{picked === answer ? 'Correct' : 'Not quite'}</AlertTitle>
          {explanation}
          <Box sx={{ mt: 1 }}>
            <Link component="button" onClick={() => setPicked(null)}>
              Try again
            </Link>
          </Box>
        </Alert>
      )}
    </Paper>
  );
};

/** Links to other parts of the platform from a lesson. */
const LabLink = ({ id, children }: Children & { id: string }) => (
  <Button component={RouterLink} to={`/labs/${id}`} variant="outlined" startIcon={<ScienceOutlinedIcon />} sx={{ my: 1 }}>
    {children ?? 'Open the lab'}
  </Button>
);
const QuizLink = ({ id, children }: Children & { id: string }) => (
  <Button component={RouterLink} to={`/quizzes/${id}`} variant="outlined" sx={{ my: 1 }}>
    {children ?? 'Take the quiz'}
  </Button>
);

// --- markdown elements ---------------------------------------------------------

const heading =
  (variant: 'h2' | 'h3' | 'h4', component: 'h2' | 'h3' | 'h4', mt: number) =>
  ({ children }: Children) => (
    <Typography variant={variant} component={component} id={anchorOf(textOf(children))} sx={{ mt, mb: 1.5, ...SCROLL_MARGIN }}>
      {children}
    </Typography>
  );

export const mdxComponents: MDXComponents = {
  h1: heading('h2', 'h2', 5),
  h2: heading('h2', 'h2', 5),
  h3: heading('h3', 'h3', 4),
  h4: heading('h4', 'h4', 3),
  pre: Pre as MDXComponents['pre'],
  a: ({ href, children }) =>
    href?.startsWith('/') ? (
      <Link component={RouterLink} to={href}>
        {children}
      </Link>
    ) : (
      <Link href={href} target="_blank" rel="noreferrer">
        {children}
      </Link>
    ),
  Terminal,
  Callout,
  Phase,
  Exercise,
  Hint,
  Solution,
  KnowledgeCheck,
  Diagram,
  LabLink,
  QuizLink,
};
