import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { UserDto } from '@cka/contracts';
import { useLogoutMutation } from '@/api/api';
import { APP_NAME, LABS_ENABLED } from '@/config';
import { TerminalBridgeProvider, TerminalDockPanel, TerminalDockToggle, useTerminalDock } from '@/labs/TerminalDock';
import { useThemeMode } from '@/theme/ThemeModeProvider';
import { NAV_SECTIONS } from './nav';
import { SearchButton } from './SearchDialog';

export const DRAWER_WIDTH = 248;

const Logo = () => (
  <Stack direction="row" spacing={1.25} alignItems="center" component={RouterLink} to="/" sx={{ textDecoration: 'none', color: 'inherit' }}>
    <Box component="img" src="/favicon.svg" alt="" sx={{ width: 30, height: 30 }} />
    <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
      {APP_NAME}
    </Typography>
  </Stack>
);

const SidebarContent = ({ user, onNavigate }: { user: UserDto; onNavigate: () => void }) => {
  const { pathname } = useLocation();
  const isActive = (to: string, prefix?: boolean) => (prefix ? pathname === to || pathname.startsWith(`${to}/`) : pathname === to);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ px: 2.5 }}>
        <Logo />
      </Toolbar>
      <Box component="nav" aria-label="Main" sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
        {NAV_SECTIONS.map((section, i) => {
          const items = section.items.filter(it => !it.roles || it.roles.includes(user.role));
          if (!items.length) return null;
          return (
            <List
              key={i}
              dense
              subheader={
                section.title ? (
                  <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px', mt: 1 }}>
                    {section.title}
                  </ListSubheader>
                ) : undefined
              }
            >
              {items.map(it => (
                <ListItemButton
                  key={it.to}
                  component={RouterLink}
                  to={it.to}
                  selected={isActive(it.to, it.prefix)}
                  onClick={onNavigate}
                  sx={{ mb: 0.25, py: 0.9 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{it.icon}</ListItemIcon>
                  <ListItemText primary={it.label} slotProps={{ primary: { fontWeight: 500, fontSize: '0.9rem' } }} />
                </ListItemButton>
              ))}
            </List>
          );
        })}
      </Box>
      <Divider />
      <Typography variant="caption" color="text.secondary" sx={{ p: 2 }}>
        Practice platform. Simulated scores are not CKA or CKAD certification results.
      </Typography>
    </Box>
  );
};

const ThemeToggle = () => {
  const { mode, setMode } = useThemeMode();
  const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
  const icon = mode === 'light' ? <LightModeOutlinedIcon /> : mode === 'dark' ? <DarkModeOutlinedIcon /> : <SettingsBrightnessOutlinedIcon />;
  return (
    <Tooltip title={`Theme: ${mode} (click for ${next})`}>
      <IconButton onClick={() => setMode(next)} aria-label="Change theme">
        {icon}
      </IconButton>
    </Tooltip>
  );
};

const UserMenu = ({ user }: { user: UserDto }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();
  const initials = user.displayName
    .split(/\s+/)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const signOut = async () => {
    setAnchor(null);
    try {
      await logout().unwrap();
    } finally {
      // Full reload: nothing from this session stays in memory.
      window.location.assign('/login');
    }
  };

  return (
    <>
      <IconButton onClick={e => setAnchor(e.currentTarget)} aria-label="Account menu" sx={{ p: 0.5 }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.85rem' }}>{initials}</Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography fontWeight={600}>{user.displayName}</Typography>
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate('/account');
          }}
        >
          <ListItemIcon>
            <ManageAccountsOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Account
        </MenuItem>
        <MenuItem onClick={signOut}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
};

/**
 * Same responsive approach as the boilerplate's AdminLayout: a permanent
 * drawer on desktop, a temporary overlay on mobile, tracked separately.
 */
export const AppShell = ({ user }: { user: UserDto }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const dock = useTerminalDock();
  // Lab and playground pages embed their own terminal.
  const dockAllowed = LABS_ENABLED && !/^\/(labs\/[^/]+|playground)\/?$/.test(pathname);
  const dockOpen = dockAllowed && dock.open;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ ml: { md: `${DRAWER_WIDTH}px` }, width: { md: `calc(100% - ${DRAWER_WIDTH}px)` } }}>
        <Toolbar sx={{ gap: 1 }}>
          {isMobile && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <MenuIcon />
            </IconButton>
          )}
          {isMobile && <Logo />}
          <Box sx={{ flex: 1 }} />
          <SearchButton />
          {dockAllowed && <TerminalDockToggle open={dock.open} onToggle={() => dock.setOpen(o => !o)} />}
          <ThemeToggle />
          <UserMenu user={user} />
        </Toolbar>
      </AppBar>

      <Box component="aside" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
            <SidebarContent user={user} onNavigate={() => setMobileOpen(false)} />
          </Drawer>
        ) : (
          <Drawer variant="permanent" open sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
            <SidebarContent user={user} onNavigate={() => undefined} />
          </Drawer>
        )}
      </Box>

      <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Toolbar />
        <Box sx={{ flex: 1, px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2, md: 4 }, mr: { md: dockOpen ? `${dock.width}px` : 0 } }}>
          <TerminalBridgeProvider open={dockOpen} bridge={dockOpen ? dock.bridge : null}>
            <Outlet />
          </TerminalBridgeProvider>
        </Box>
        {dockOpen && <TerminalDockPanel onClose={() => dock.setOpen(false)} setPaste={dock.setPaste} width={dock.width} setWidth={dock.setWidth} />}
      </Box>
    </Box>
  );
};
