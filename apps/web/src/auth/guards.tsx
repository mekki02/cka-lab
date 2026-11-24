import { Box } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role, UserDto } from '@cka/contracts';
import { useMeQuery } from '@/api/api';
import { ErrorState, Loading } from '@/components/states';
import { AppShell } from '@/layout/AppShell';

/**
 * Gate for every signed-in page. The session cookie is HttpOnly, so the only
 * way to know whether we are signed in is to ask: GET /auth/me. (The base
 * query transparently refreshes an expired access token first.)
 */
export const RequireAuth = () => {
  const { data: user, error, isLoading, refetch } = useMeQuery();
  const location = useLocation();

  if (isLoading) return <Loading label="Checking your session…" />;
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 8, px: 2 }}>
        <ErrorState error={error} onRetry={refetch} />
      </Box>
    );
  }
  return <AppShell user={user as UserDto} />;
};

export const RequireRole = ({ role, children }: { role: Role; children: ReactNode }) => {
  const { data: user } = useMeQuery();
  if (user?.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
};
