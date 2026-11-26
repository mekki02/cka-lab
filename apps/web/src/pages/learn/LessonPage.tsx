import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useEffect, useState, type ComponentType } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { lessons as lessonIndex, loaders } from 'virtual:lessons';
import { useSetBookmarkMutation, useSetLessonStatusMutation, useVisitLessonMutation } from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { EmptyState, ErrorState, Loading } from '@/components/states';
import { proseSx } from '@/components/prose';
import { useCurriculum, useProgressIndex } from '@/hooks/useCurriculum';
import { selectCourse } from '@/hooks/useSelectedCourse';
import { mdxComponents } from '@/lessons/mdx-components';
import { useTerminalDockOpen } from '@/labs/terminalBridge';
import { StatusIcon } from './ModulePage';
import { ExerciseList } from '@/pages/exercises/ExerciseList';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';

type MdxContent = ComponentType<{ components?: object }>;

const useLessonBody = (lessonId: string) => {
  const [state, setState] = useState<{ id: string; Body?: MdxContent; error?: unknown }>({ id: lessonId });
  useEffect(() => {
    const load = loaders[lessonId];
    if (!load) return;
    let alive = true;
    load()
      .then(mod => alive && setState({ id: lessonId, Body: mod.default }))
      .catch(error => alive && setState({ id: lessonId, error }));
    return () => {
      alive = false;
    };
  }, [lessonId]);
  return state.id === lessonId ? state : { id: lessonId };
};

/** Highlights the heading currently in view. */
const useActiveHeading = (anchors: string[], ready: boolean) => {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const els = anchors.map(a => document.getElementById(a)).filter((e): e is HTMLElement => !!e);
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    els.forEach(e => obs.observe(e));
    return () => obs.disconnect();
  }, [anchors, ready]);
  return active;
};

export const LessonPage = () => {
  const { moduleId = '', lessonId = '' } = useParams();
  const { index, error, isLoading, refetch } = useCurriculum();
  const { index: progress } = useProgressIndex();
  const body = useLessonBody(lessonId);
  const [visit] = useVisitLessonMutation();
  const [setStatus, statusState] = useSetLessonStatusMutation();
  const [setBookmark] = useSetBookmarkMutation();
  const dockOpen = useTerminalDockOpen();

  const lesson = index?.lessons.get(lessonId);
  const published = lesson?.status === 'published' && !!loaders[lessonId];
  const headings = lessonIndex[lessonId]?.headings ?? [];
  const active = useActiveHeading(
    headings.map(h => h.anchor),
    !!body.Body,
  );

  const courseId = lesson ? index?.modules.get(lesson.moduleId)?.courseId : undefined;
  useEffect(() => {
    if (courseId) selectCourse(courseId);
  }, [courseId]);

  useEffect(() => {
    if (published) visit(lessonId).catch(() => undefined);
    window.scrollTo({ top: 0 });
  }, [lessonId, published, visit]);

  // Honour #fragment links once the body has rendered.
  useEffect(() => {
    if (body.Body && window.location.hash) {
      document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
    }
  }, [body.Body]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !index) return <Loading />;
  const m = index.modules.get(moduleId);
  if (!lesson || !m || lesson.moduleId !== m.id) return <EmptyState title="Lesson not found">This lesson does not exist.</EmptyState>;

  // Previous/next stay inside the lesson's course.
  const order = index.published.filter(l => index.modules.get(l.moduleId)?.courseId === m.courseId);
  const pos = order.findIndex(l => l.id === lesson.id);
  const prev = pos > 0 ? order[pos - 1] : undefined;
  const next = pos >= 0 ? order[pos + 1] : undefined;
  const status = progress.status.get(lesson.id);
  const completed = status === 'COMPLETED';
  const bookmarked = progress.bookmarks.has(lesson.id);
  const practice = m.exercises.filter(e => e.lessonId === lesson.id);
  const unmetPrereqs = lesson.prerequisites
    .map(p => index.lessons.get(p))
    .filter(p => p && p.status === 'published' && progress.status.get(p.id) !== 'COMPLETED');

  return (
    <Box
      sx={{
        display: 'grid',
        // With the terminal docked, the lesson gets the remaining width as one column.
        gridTemplateColumns: dockOpen ? '1fr' : { xs: '1fr', md: '220px minmax(0, 1fr)', lg: '220px minmax(0, 1fr) 200px' },
        gap: { md: 4 },
        maxWidth: dockOpen ? 900 : 1400,
        mx: 'auto',
      }}
    >
      {/* Module outline */}
      <Box component="nav" aria-label="Module lessons" sx={{ display: dockOpen ? 'none' : { xs: 'none', md: 'block' } }}>
        <Box sx={{ position: 'sticky', top: 88 }}>
          <Link component={RouterLink} to={`/learn/${m.id}`} underline="hover" variant="overline" color="text.secondary">
            {m.title}
          </Link>
          <List dense sx={{ mt: 1 }}>
            {m.lessons.map(l => (
              <ListItemButton
                key={l.id}
                component={l.status === 'planned' ? 'div' : RouterLink}
                to={l.status === 'planned' ? undefined : `/learn/${m.id}/${l.id}`}
                selected={l.id === lesson.id}
                disabled={l.status === 'planned'}
                sx={{ py: 0.75, alignItems: 'flex-start' }}
              >
                <ListItemIcon sx={{ minWidth: 30, mt: 0.25 }}>
                  <StatusIcon status={progress.status.get(l.id)} planned={l.status === 'planned'} />
                </ListItemIcon>
                <ListItemText primary={l.title} slotProps={{ primary: { fontSize: '0.85rem', lineHeight: 1.4 } }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Box>

      {/* Lesson */}
      <Box component="article" sx={{ minWidth: 0, maxWidth: 820, width: '100%', mx: 'auto' }}>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link component={RouterLink} to={`/learn?course=${m.courseId}`} underline="hover" color="inherit">
            {index.courses.get(m.courseId)?.code ?? 'Course'}
          </Link>
          <Link component={RouterLink} to={`/learn/${m.id}`} underline="hover" color="inherit">
            {m.title}
          </Link>
        </Breadcrumbs>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
            {lesson.title}
          </Typography>
          {published && (
            <Tooltip title={bookmarked ? 'Remove bookmark' : 'Bookmark this lesson'}>
              <IconButton onClick={() => setBookmark({ lessonId: lesson.id, on: !bookmarked })} aria-pressed={bookmarked} aria-label="Bookmark">
                {bookmarked ? <BookmarkIcon color="primary" /> : <BookmarkBorderIcon />}
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 1.5, fontSize: '1.05rem' }}>
          {lesson.summary}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Chip size="small" icon={<ScheduleIcon />} label={`${lesson.minutes} min`} />
          {practice.length > 0 && <Chip size="small" icon={<FitnessCenterIcon />} label={`${practice.length} exercise${practice.length > 1 ? 's' : ''}`} />}
          {completed && <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Completed" />}
        </Stack>

        {unmetPrereqs.length > 0 && (
          <Alert severity="info" sx={{ mt: 3 }}>
            Recommended first:{' '}
            {unmetPrereqs.map((p, i) => (
              <span key={p!.id}>
                {i > 0 && ', '}
                <Link component={RouterLink} to={`/learn/${p!.moduleId}/${p!.id}`}>
                  {p!.title}
                </Link>
              </span>
            ))}
          </Alert>
        )}

        <Divider sx={{ my: 3 }} />

        {!published ? (
          <EmptyState icon={<ScheduleIcon fontSize="inherit" />} title="Coming soon">
            This lesson is part of the curriculum but has not been written yet. Its topic is listed so you can study it from the
            official Kubernetes documentation in the meantime.
          </EmptyState>
        ) : body.error ? (
          <ErrorState error={{ error: 'Could not load this lesson. Reload the page to try again.' }} />
        ) : !body.Body ? (
          <Loading label="Loading lesson…" />
        ) : (
          <Box sx={proseSx}>
            <body.Body components={mdxComponents} />
          </Box>
        )}

        {published && body.Body && practice.length > 0 && (
          <Card sx={{ mt: 6, p: { xs: 2, md: 3 }, borderTop: 4, borderTopColor: 'secondary.main' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <FitnessCenterIcon color="secondary" />
              <Typography variant="h5" component="h2">
                Practise on a real cluster
              </Typography>
            </Stack>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 1 }}>
              Each exercise sets up its own starting state in your playground and is graded automatically.
            </Typography>
            <ExerciseList exercises={practice} />
          </Card>
        )}

        {published && body.Body && (
          <Card sx={{ mt: practice.length ? 3 : 6, p: 3, textAlign: 'center' }}>
            {completed ? (
              <Stack spacing={1} alignItems="center">
                <Typography fontWeight={600}>Lesson completed</Typography>
                <Button size="small" onClick={() => setStatus({ lessonId: lesson.id, status: 'IN_PROGRESS' })}>
                  Mark as not completed
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1} alignItems="center">
                <Typography color="text.secondary">Finished reading and did the exercises?</Typography>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<CheckCircleIcon />}
                  disabled={statusState.isLoading}
                  onClick={() => setStatus({ lessonId: lesson.id, status: 'COMPLETED' })}
                >
                  Mark lesson as complete
                </Button>
                {statusState.error && <Alert severity="error">{errorMessage(statusState.error)}</Alert>}
              </Stack>
            )}
          </Card>
        )}

        <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ mt: 4, mb: 6 }}>
          {prev ? (
            <Button component={RouterLink} to={`/learn/${prev.moduleId}/${prev.id}`} startIcon={<ArrowBackIcon />} sx={{ textAlign: 'left' }}>
              {prev.title}
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button component={RouterLink} to={`/learn/${next.moduleId}/${next.id}`} endIcon={<ArrowForwardIcon />} variant="outlined" sx={{ textAlign: 'right' }}>
              {next.title}
            </Button>
          )}
        </Stack>
      </Box>

      {/* On this page */}
      <Box component="nav" aria-label="On this page" sx={{ display: dockOpen ? 'none' : { xs: 'none', lg: 'block' } }}>
        {headings.length > 0 && body.Body && (
          <Box sx={{ position: 'sticky', top: 88 }}>
            <Typography variant="overline" color="text.secondary">
              On this page
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}>
              {headings.map(h => (
                <Box component="li" key={h.anchor} sx={{ pl: h.depth === 3 ? 1.5 : 0, py: 0.4 }}>
                  <Link
                    href={`#${h.anchor}`}
                    underline="hover"
                    variant="body2"
                    sx={{ color: active === h.anchor ? 'primary.main' : 'text.secondary', fontWeight: active === h.anchor ? 600 : 400, fontSize: '0.82rem' }}
                    onClick={e => {
                      e.preventDefault();
                      document.getElementById(h.anchor)?.scrollIntoView({ behavior: 'smooth' });
                      window.history.replaceState(null, '', `#${h.anchor}`);
                    }}
                  >
                    {h.text}
                  </Link>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
