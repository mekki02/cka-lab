import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { errorMessage } from '@/api/baseQuery';

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ py: 8 }} role="status" aria-live="polite">
    <CircularProgress size={32} />
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
  </Stack>
);

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <Alert
    severity="error"
    sx={{ my: 2 }}
    action={
      onRetry && (
        <Button color="inherit" size="small" onClick={onRetry}>
          Retry
        </Button>
      )
    }
  >
    {errorMessage(error)}
  </Alert>
);

export const EmptyState = ({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) => (
  <Box sx={{ textAlign: 'center', py: 6, px: 2, color: 'text.secondary' }}>
    {icon && <Box sx={{ fontSize: 48, mb: 1, opacity: 0.6 }}>{icon}</Box>}
    <Typography variant="h6" color="text.primary" gutterBottom>
      {title}
    </Typography>
    {children && <Typography variant="body2">{children}</Typography>}
  </Box>
);

/** Page title block used on every screen: consistent spacing and hierarchy. */
export const PageHeader = ({
  title,
  subtitle,
  overline,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  overline?: ReactNode;
  actions?: ReactNode;
}) => (
  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} spacing={2} sx={{ mb: 3 }}>
    <Box>
      {overline && (
        <Typography variant="overline" color="primary" component="div">
          {overline}
        </Typography>
      )}
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.1rem' } }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
    {actions && <Stack direction="row" spacing={1}>{actions}</Stack>}
  </Stack>
);
