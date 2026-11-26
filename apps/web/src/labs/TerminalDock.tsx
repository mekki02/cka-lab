import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { LabEnvironment } from './LabEnvironment';
import { TerminalBridgeContext, TerminalDockOpenContext, type TerminalBridge } from './terminalBridge';

const WIDTH_KEY = 'cka.terminalDock.width';
const MIN_WIDTH = 360;
/** Room always left to the page (and the 248px sidebar) next to the dock. */
const MIN_PAGE_WIDTH = 248 + 320;
const defaultWidth = () => Math.min(720, Math.round(window.innerWidth * 0.46));
const clampWidth = (w: number) => Math.round(Math.max(MIN_WIDTH, Math.min(w, window.innerWidth - MIN_PAGE_WIDTH)));

const readWidth = () => {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return clampWidth(saved > 0 ? saved : defaultWidth());
  } catch {
    return clampWidth(defaultWidth());
  }
};

/**
 * The playground cluster docked next to any page (lessons, cheat sheets…),
 * so learners can try every command where they read it. Code blocks on the
 * page get a "paste into terminal" button while the dock is open.
 *
 * The dock is resizable: drag its left edge (or focus the edge and use the
 * arrow keys; double-click resets). The width is remembered per browser.
 */
export const useTerminalDock = () => {
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState<((t: string) => void) | null>(null);
  const [width, setWidthState] = useState(readWidth);
  const bridge = useMemo<TerminalBridge | null>(() => (open && paste ? { paste } : null), [open, paste]);

  const setWidth = useCallback((w: number) => setWidthState(clampWidth(w)), []);
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* storage unavailable: the width just is not remembered */
    }
  }, [width]);
  // Keep the dock inside the window when the window shrinks.
  useEffect(() => {
    const onResize = () => setWidthState(w => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { open, setOpen, bridge, setPaste, width, setWidth };
};

export const TerminalDockToggle = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <Tooltip title={open ? 'Hide terminal' : 'Open a terminal (playground cluster)'}>
    <IconButton onClick={onToggle} aria-label="Toggle terminal" color={open ? 'secondary' : 'default'}>
      <TerminalIcon />
    </IconButton>
  </Tooltip>
);

const ResizeHandle = ({ width, setWidth }: { width: number; setWidth: (w: number) => void }) => {
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) setWidth(window.innerWidth - e.clientX);
  };
  const stop = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === 'ArrowLeft') setWidth(width + step);
    else if (e.key === 'ArrowRight') setWidth(width - step);
    else return;
    e.preventDefault();
  };

  // No text selection and a resize cursor everywhere while dragging.
  useEffect(() => {
    if (!dragging) return;
    const { userSelect, cursor } = document.body.style;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.body.style.userSelect = userSelect;
      document.body.style.cursor = cursor;
    };
  }, [dragging]);

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize terminal"
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => setWidth(defaultWidth())}
      onKeyDown={onKeyDown}
      title="Drag to resize · double-click to reset"
      sx={{
        display: { xs: 'none', md: 'block' },
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: -5,
        width: 10,
        cursor: 'col-resize',
        zIndex: 1,
        touchAction: 'none',
        outline: 'none',
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 4,
          width: 2,
          bgcolor: dragging ? 'secondary.main' : 'transparent',
          transition: 'background-color 120ms',
        },
        '&:hover::after, &:focus-visible::after': { bgcolor: 'secondary.main' },
        // A grip in the middle, so the handle is discoverable.
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '50%',
          left: 2,
          width: 6,
          height: 36,
          mt: '-18px',
          borderRadius: 3,
          bgcolor: 'divider',
        },
      }}
    />
  );
};

export const TerminalDockPanel = ({
  onClose,
  setPaste,
  width,
  setWidth,
}: {
  onClose: () => void;
  setPaste: (p: ((t: string) => void) | null) => void;
  width: number;
  setWidth: (w: number) => void;
}) => (
  <Box
    component="aside"
    aria-label="Terminal"
    sx={{
      position: 'fixed',
      top: 64,
      right: 0,
      bottom: 0,
      width: { xs: '100%', md: `${width}px` },
      zIndex: theme => theme.zIndex.appBar - 1,
      bgcolor: 'background.paper',
      borderLeft: 1,
      borderColor: 'divider',
      display: 'flex',
      flexDirection: 'column',
      p: 1,
      gap: 1,
    }}
  >
    <ResizeHandle width={width} setWidth={setWidth} />
    <Stack direction="row" alignItems="center" sx={{ px: 1 }}>
      <Typography variant="subtitle2" sx={{ flex: 1 }}>
        Playground
      </Typography>
      <IconButton size="small" onClick={onClose} aria-label="Close terminal">
        <CloseIcon fontSize="small" />
      </IconButton>
    </Stack>
    <Box sx={{ flex: 1, minHeight: 0 }}>
      {/* setPaste receives a function: wrap it so React does not call it as an updater. */}
      <LabEnvironment labId={null} onTerminal={p => setPaste(() => p)} />
    </Box>
  </Box>
);

export const TerminalBridgeProvider = ({ open, bridge, children }: { open: boolean; bridge: TerminalBridge | null; children: ReactNode }) => (
  <TerminalDockOpenContext.Provider value={open}>
    <TerminalBridgeContext.Provider value={bridge}>{children}</TerminalBridgeContext.Provider>
  </TerminalDockOpenContext.Provider>
);
