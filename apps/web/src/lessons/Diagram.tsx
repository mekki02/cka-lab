import { Alert, Box, Skeleton, Typography, useTheme } from '@mui/material';
import { useEffect, useId, useState } from 'react';

/**
 * <Diagram chart={`flowchart LR ...`} caption="..." />
 *
 * Mermaid is ~1 MB, so it is imported only when a lesson actually contains a
 * diagram. `securityLevel: 'strict'` makes Mermaid sanitize labels and drop
 * click handlers, so diagram source cannot inject script.
 */
export const Diagram = ({ chart, caption }: { chart: string; caption?: string }) => {
  const dark = useTheme().palette.mode === 'dark';
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: dark ? 'dark' : 'neutral',
          fontFamily: 'Inter, -apple-system, Segoe UI, Roboto, sans-serif',
          flowchart: { curve: 'basis', htmlLabels: false },
        });
        const { svg: out } = await mermaid.render(`${id}-${dark ? 'd' : 'l'}`, chart.trim());
        if (alive) setSvg(out);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chart, dark, id]);

  return (
    <Box component="figure" sx={{ my: 3, mx: 0 }}>
      <Box
        sx={{
          p: 2,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          overflowX: 'auto',
          textAlign: 'center',
          '& svg': { maxWidth: '100%', height: 'auto' },
        }}
      >
        {error ? (
          <Alert severity="warning">Diagram failed to render: {error}</Alert>
        ) : svg ? (
          <Box dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={caption ?? 'Diagram'} />
        ) : (
          <Skeleton variant="rounded" height={220} />
        )}
      </Box>
      {caption && (
        <Typography component="figcaption" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
          {caption}
        </Typography>
      )}
    </Box>
  );
};
