import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useMemo, useState, type ReactNode } from 'react';
import { LabEnvironment } from './LabEnvironment';
import { TerminalBridgeContext, TerminalDockOpenContext, type TerminalBridge } from './terminalBridge';

export const DOCK_WIDTH = 'min(720px, 46vw)';

/**
 * The playground cluster docked next to any page (lessons, cheat sheets…),
 * so learners can try every command where they read it. Code blocks on the
 * page get a "paste into terminal" button while the dock is open.
 */
export const useTerminalDock = () => {
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState<((t: string) => void) | null>(null);
  const bridge = useMemo<TerminalBridge | null>(() => (open && paste ? { paste } : null), [open, paste]);
  return { open, setOpen, bridge, setPaste };
};

export const TerminalDockToggle = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <Tooltip title={open ? 'Hide terminal' : 'Open a terminal (playground cluster)'}>
    <IconButton onClick={onToggle} aria-label="Toggle terminal" color={open ? 'secondary' : 'default'}>
      <TerminalIcon />
    </IconButton>
  </Tooltip>
);

export const TerminalDockPanel = ({ onClose, setPaste }: { onClose: () => void; setPaste: (p: ((t: string) => void) | null) => void }) => (
  <Box
    component="aside"
    aria-label="Terminal"
    sx={{
      position: 'fixed',
      top: 64,
      right: 0,
      bottom: 0,
      width: { xs: '100%', md: DOCK_WIDTH },
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
