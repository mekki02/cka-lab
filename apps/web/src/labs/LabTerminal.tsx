import { Box, Button, Stack, Typography } from '@mui/material';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import { LABS_TERMINAL_PATH, type TerminalClientMessage, type TerminalServerMessage } from '@cka/contracts';
import { api } from '@/api/api';
import { useAppDispatch } from '@/hooks/redux';

type State = { kind: 'connecting' } | { kind: 'open' } | { kind: 'closed'; reason: string };

const THEME = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#2dd4bf',
  selectionBackground: '#264f78',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
};

/**
 * xterm.js wired to ms-labs' WebSocket. The server bridges it to a bash in
 * the student's toolbox Pod; this component only moves bytes and sizes.
 *
 * `onReady` hands the parent a paste function (for "Run in terminal").
 */
export const LabTerminal = ({ sessionId, onReady }: { sessionId: string; onReady?: (paste: ((t: string) => void) | null) => void }) => {
  const host = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const [state, setState] = useState<State>({ kind: 'connecting' });
  const [attempt, setAttempt] = useState(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      scrollback: 5000,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();

    let ws: WebSocket | null = null;
    let disposed = false;
    const send = (m: TerminalClientMessage) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

    const connect = async () => {
      setState({ kind: 'connecting' });
      // Any API call refreshes an expired access token (baseQuery retries on
      // 401), so the WebSocket handshake below carries a valid cookie.
      await dispatch(api.endpoints.labSession.initiate(undefined, { forceRefetch: true, subscribe: false }));
      if (disposed) return;
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${LABS_TERMINAL_PATH}`;
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        setState({ kind: 'open' });
        send({ type: 'resize', cols: term.cols, rows: term.rows });
        term.focus();
      };
      ws.onmessage = e => {
        if (typeof e.data === 'string') {
          const m = JSON.parse(e.data) as TerminalServerMessage;
          if (m.type === 'error') term.writeln(`\r\n\x1b[31m${m.message}\x1b[0m`);
        } else {
          term.write(new Uint8Array(e.data as ArrayBuffer));
        }
      };
      ws.onclose = e => {
        if (disposed) return;
        setState({ kind: 'closed', reason: e.reason && e.reason !== 'closed' ? e.reason : 'Disconnected' });
      };
    };
    void connect();

    const input = term.onData(data => send({ type: 'input', data }));
    const resize = term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* not visible */
      }
    });
    observer.observe(host.current);
    // xterm's paste() wraps text in bracketed-paste markers when the shell
    // asks for them (bash does), so multi-line commands wait for Enter.
    onReadyRef.current?.(text => {
      term.paste(text);
      term.focus();
    });

    return () => {
      disposed = true;
      onReadyRef.current?.(null);
      observer.disconnect();
      input.dispose();
      resize.dispose();
      ws?.close();
      term.dispose();
    };
  }, [sessionId, attempt, dispatch]);

  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, bgcolor: THEME.background, borderRadius: 2, overflow: 'hidden' }}>
      <Box ref={host} sx={{ position: 'absolute', inset: 0, p: 1, '& .xterm': { height: '100%' } }} />
      {state.kind !== 'open' && (
        <Stack
          alignItems="center"
          justifyContent="center"
          spacing={2}
          sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(13,17,23,0.85)', color: '#e6edf3' }}
        >
          <Typography>{state.kind === 'connecting' ? 'Connecting to your cluster…' : state.reason}</Typography>
          {state.kind === 'closed' && (
            <Button variant="contained" onClick={() => setAttempt(a => a + 1)}>
              Reconnect
            </Button>
          )}
        </Stack>
      )}
    </Box>
  );
};
