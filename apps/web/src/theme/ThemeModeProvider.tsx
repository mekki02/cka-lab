import { CssBaseline, ThemeProvider } from '@mui/material';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createAppTheme } from './theme';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'cka-theme-mode';

const ThemeModeContext = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void; resolved: 'light' | 'dark' }>({
  mode: 'system',
  setMode: () => undefined,
  resolved: 'light',
});

const readStored = (): ThemeMode => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Light / dark / follow-the-OS, persisted per browser. Unlike the
 * boilerplate's version, the OS preference is held in state, so switching the
 * OS theme while the app is open actually re-renders.
 */
export const ThemeModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<ThemeMode>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* private mode: preference just isn't remembered */
    }
  };

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  const theme = useMemo(() => createAppTheme(resolved), [resolved]);

  return (
    <ThemeModeContext.Provider value={{ mode, setMode, resolved }}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useThemeMode = () => useContext(ThemeModeContext);
