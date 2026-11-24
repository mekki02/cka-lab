import { Box, Card, CardContent, Chip, InputAdornment, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCheatsheetsQuery } from '@/api/api';
import { CodeBlock } from '@/components/CodeBlock';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/states';

export const CheatSheetsPage = () => {
  const { data, error, isLoading, refetch } = useCheatsheetsQuery();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const sheetId = params.get('sheet') ?? 'all';

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'all') next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (data ?? [])
      .filter(s => sheetId === 'all' || s.id === sheetId)
      .map(s => ({
        ...s,
        sections: s.sections
          .map(sec => ({
            ...sec,
            entries: sec.entries.filter(e => {
              const hay = `${e.title} ${e.description ?? ''} ${e.code} ${e.tags.join(' ')} ${sec.title}`.toLowerCase();
              return terms.every(t => hay.includes(t));
            }),
          }))
          .filter(sec => sec.entries.length > 0),
      }))
      .filter(s => s.sections.length > 0);
  }, [data, q, sheetId]);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <Loading />;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader overline="Reference" title="Cheat sheets" subtitle="The commands, YAML patterns and JSONPath queries you reach for during the exam. Every snippet has a copy button." />
      <TextField
        fullWidth
        placeholder="Filter, e.g. “jsonpath”, “drain”, “netpol egress”"
        value={q}
        onChange={e => set('q', e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        sx={{ mb: 2 }}
      />
      <Tabs value={sheetId} onChange={(_, v) => set('sheet', v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="all" label="All" />
        {data.map(s => (
          <Tab key={s.id} value={s.id} label={s.title} />
        ))}
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState title="Nothing matches">Try fewer or different words.</EmptyState>
      ) : (
        filtered.map(s => (
          <Box key={s.id} component="section" sx={{ mb: 5 }}>
            <Typography variant="h3" component="h2">
              {s.title}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {s.description}
            </Typography>
            {s.sections.map(sec => (
              <Card key={sec.title} sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" component="h3" gutterBottom>
                    {sec.title}
                  </Typography>
                  {sec.entries.map(e => (
                    <Box key={e.title} sx={{ mb: 2.5 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight={600}>{e.title}</Typography>
                        {e.tags.map(t => (
                          <Chip key={t} size="small" variant="outlined" label={t} onClick={() => set('q', t)} />
                        ))}
                      </Stack>
                      {e.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {e.description}
                        </Typography>
                      )}
                      <CodeBlock code={e.code} lang={e.lang} />
                    </Box>
                  ))}
                </CardContent>
              </Card>
            ))}
          </Box>
        ))
      )}
    </Box>
  );
};
