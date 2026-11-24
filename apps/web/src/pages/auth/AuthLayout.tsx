import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { APP_NAME } from '@/config';

/** Centered card for the signed-out pages. */
export const AuthLayout = ({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      px: 2,
      background: theme =>
        theme.palette.mode === 'dark'
          ? 'radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.25), transparent), radial-gradient(800px 400px at 110% 110%, rgba(45,212,191,0.15), transparent)'
          : 'radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.15), transparent), radial-gradient(800px 400px at 110% 110%, rgba(45,212,191,0.12), transparent)',
    }}
  >
    <Box sx={{ width: '100%', maxWidth: 420 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ mb: 3 }}>
        <Box component="img" src="/favicon.svg" alt="" sx={{ width: 40, height: 40 }} />
        <Typography variant="h5" fontWeight={700}>
          {APP_NAME}
        </Typography>
      </Stack>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h4" component="h1" gutterBottom>
            {title}
          </Typography>
          {subtitle && (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {subtitle}
            </Typography>
          )}
          {children}
        </CardContent>
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
        Private platform — access is by invitation only.
      </Typography>
    </Box>
  </Box>
);
