import { alpha, createTheme, type Theme } from '@mui/material/styles';

/**
 * Adapted from the boilerplate's shared theme-context: same typography scale,
 * shadows and component overrides, new palette (indigo primary, teal
 * secondary), tuned for long-form reading:
 *
 * - a tinted page background so content cards stand out;
 * - no hover "lift" on cards (distracting next to text you are reading);
 * - code font stack and inline-code styling.
 */
const indigo = {
  50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
  500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81',
};
const teal = {
  50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
  500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a',
};
const neutral = {
  50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
  500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a',
};

export const MONO_FONT = '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

export const createAppTheme = (mode: 'light' | 'dark'): Theme => {
  const dark = mode === 'dark';
  const primary = dark ? indigo[400] : indigo[600];

  return createTheme({
    palette: {
      mode,
      primary: { main: primary, light: indigo[300], dark: indigo[800], contrastText: '#ffffff' },
      secondary: { main: dark ? teal[400] : teal[600], light: teal[300], dark: teal[800], contrastText: '#ffffff' },
      success: { main: '#16a34a', light: '#4ade80', dark: '#15803d' },
      warning: { main: '#d97706', light: '#fbbf24', dark: '#b45309' },
      error: { main: '#dc2626', light: '#f87171', dark: '#b91c1c' },
      info: { main: dark ? '#38bdf8' : '#0284c7' },
      grey: neutral,
      background: {
        default: dark ? '#0b1020' : '#f6f7fb',
        paper: dark ? '#111827' : '#ffffff',
      },
      divider: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      text: {
        primary: dark ? '#e5e7eb' : '#0f172a',
        secondary: dark ? '#9ca3af' : '#475569',
      },
      action: {
        hover: alpha(primary, dark ? 0.1 : 0.05),
        selected: alpha(primary, dark ? 0.18 : 0.1),
      },
    },
    typography: {
      fontFamily: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'].join(','),
      h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
      h2: { fontSize: '1.75rem', fontWeight: 650, lineHeight: 1.3, letterSpacing: '-0.01em' },
      h3: { fontSize: '1.375rem', fontWeight: 600, lineHeight: 1.35 },
      h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
      h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
      h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 },
      subtitle1: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5 },
      subtitle2: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5 },
      body1: { fontSize: '1rem', lineHeight: 1.7 },
      body2: { fontSize: '0.875rem', lineHeight: 1.6 },
      button: { fontSize: '0.875rem', fontWeight: 500, textTransform: 'none' },
      overline: { fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em' },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          'code, kbd, pre': { fontFamily: MONO_FONT },
          // Shiki emits both themes as CSS variables; pick one per mode.
          '.shiki, .shiki span': {
            color: dark ? 'var(--shiki-dark)' : 'var(--shiki-light)',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 500 },
          containedPrimary: {
            background: `linear-gradient(135deg, ${indigo[500]} 0%, ${indigo[700]} 100%)`,
            '&:hover': { background: `linear-gradient(135deg, ${indigo[400]} 0%, ${indigo[600]} 100%)` },
          },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiChip: { styleOverrides: { root: { borderRadius: 6, fontWeight: 500 } } },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: dark ? alpha('#0b1020', 0.85) : alpha('#ffffff', 0.85),
            backdropFilter: 'blur(8px)',
            color: dark ? '#e5e7eb' : '#0f172a',
            boxShadow: 'none',
            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { borderRight: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}` },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&.Mui-selected': { color: primary, '& .MuiListItemIcon-root': { color: primary } },
          },
        },
      },
      MuiLinearProgress: { styleOverrides: { root: { borderRadius: 4, height: 6 } } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 600 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  });
};
