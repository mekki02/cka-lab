import {
  Box,
  Button,
  Chip,
  Dialog,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type MiniSearch from 'minisearch';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCheatsheetsQuery } from '@/api/api';
import { useCurriculum } from '@/hooks/useCurriculum';

interface Doc {
  id: string;
  kind: 'lesson' | 'cheatsheet';
  title: string;
  subtitle: string;
  to: string;
  body: string;
}

/**
 * Ctrl/⌘+K search over lessons (title, headings, full text) and cheat-sheet
 * entries. The index is built on first open: the lesson text is a separate
 * chunk (virtual:lessons-search), so it costs nothing until used.
 */
export const SearchButton = () => {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        onClick={() => setOpen(true)}
        startIcon={<SearchIcon />}
        sx={{ color: 'text.secondary', borderColor: 'divider', minWidth: compact ? 0 : 220, justifyContent: 'flex-start' }}
        aria-label="Search"
      >
        {!compact && (
          <>
            <Box component="span" sx={{ flex: 1, textAlign: 'left' }}>
              Search…
            </Box>
            <Chip size="small" label="⌘K" sx={{ height: 20, fontSize: '0.7rem' }} />
          </>
        )}
      </Button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
};

const SearchDialog = ({ onClose }: { onClose: () => void }) => {
  const { index } = useCurriculum();
  const { data: sheets } = useCheatsheetsQuery();
  const [engine, setEngine] = useState<MiniSearch<Doc> | null>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!index) return;
    let alive = true;
    (async () => {
      const [{ default: Mini }, { documents }] = await Promise.all([import('minisearch'), import('virtual:lessons-search')]);
      const text = new Map(documents.map(d => [d.id, d]));
      const docs: Doc[] = [
        ...index.ordered.map(l => ({
          id: `lesson:${l.id}`,
          kind: 'lesson' as const,
          title: l.title,
          subtitle: index.modules.get(l.moduleId)?.title ?? '',
          to: `/learn/${l.moduleId}/${l.id}`,
          body: `${l.summary} ${text.get(l.id)?.headings ?? ''} ${text.get(l.id)?.text ?? ''}`,
        })),
        ...(sheets ?? []).flatMap(s =>
          s.sections.flatMap((sec, si) =>
            sec.entries.map((e, ei) => ({
              id: `sheet:${s.id}:${si}:${ei}`,
              kind: 'cheatsheet' as const,
              title: e.title,
              subtitle: `${s.title} · ${sec.title}`,
              to: `/cheatsheets?sheet=${s.id}&q=${encodeURIComponent(e.title)}`,
              body: `${e.description ?? ''} ${e.code} ${e.tags.join(' ')}`,
            })),
          ),
        ),
      ];
      const mini = new Mini<Doc>({
        fields: ['title', 'subtitle', 'body'],
        storeFields: ['kind', 'title', 'subtitle', 'to'],
        searchOptions: { boost: { title: 3, subtitle: 1.5 }, prefix: true, fuzzy: 0.15 },
      });
      mini.addAll(docs);
      if (alive) setEngine(mini);
    })();
    return () => {
      alive = false;
    };
  }, [index, sheets]);

  const results = useMemo(
    () => (engine && q.trim().length > 1 ? (engine.search(q).slice(0, 12) as unknown as Doc[]) : []),
    [engine, q],
  );

  const go = (d: Doc | undefined) => {
    if (!d) return;
    onClose();
    navigate(d.to);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: '10vh' } } }}>
      <Box sx={{ p: 2 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Search lessons and cheat sheets"
          value={q}
          onChange={e => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, results.length - 1));
            if (e.key === 'ArrowUp') setActive(a => Math.max(a - 1, 0));
            if (e.key === 'Enter') go(results[active]);
          }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        />
      </Box>
      <List dense sx={{ maxHeight: 420, overflowY: 'auto', pt: 0 }}>
        {results.map((r, i) => (
          <ListItemButton key={r.to + i} selected={i === active} onClick={() => go(r)}>
            <ListItemText primary={r.title} secondary={r.subtitle} />
            <Chip size="small" variant="outlined" label={r.kind === 'lesson' ? 'Lesson' : 'Cheat sheet'} />
          </ListItemButton>
        ))}
        {q.trim().length > 1 && engine && results.length === 0 && (
          <Typography color="text.secondary" sx={{ px: 3, pb: 2 }}>
            No results for “{q}”.
          </Typography>
        )}
        {!engine && q && (
          <Typography color="text.secondary" sx={{ px: 3, pb: 2 }}>
            Building index…
          </Typography>
        )}
      </List>
    </Dialog>
  );
};
