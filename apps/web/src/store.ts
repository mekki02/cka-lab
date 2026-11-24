import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api/api';
import { setSessionExpiredHandler } from './api/baseQuery';

export const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer },
  middleware: getDefault => getDefault().concat(api.middleware),
});

// Refetch on window focus / reconnect, so progress made in another tab shows up.
setupListeners(store.dispatch);

/** Pages that work without a session; never redirect away from them. */
export const PUBLIC_PATHS = ['/login', '/accept-invite', '/reset-password'];

// When a refresh fails, the session is over. A full navigation (rather than
// clearing the cache in place) guarantees no data from the previous session
// survives in memory and avoids refetch loops in mounted components.
setSessionExpiredHandler(() => {
  const { pathname, search } = window.location;
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return;
  window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}`);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
