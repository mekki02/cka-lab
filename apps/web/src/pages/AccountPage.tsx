import { Alert, Box, Button, Card, CardContent, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PASSWORD_MIN_LENGTH } from '@cka/contracts';
import { useChangePasswordMutation, useMeQuery } from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { PageHeader } from '@/components/states';
import { useThemeMode, type ThemeMode } from '@/theme/ThemeModeProvider';

export const AccountPage = () => {
  const { data: me } = useMeQuery();
  const { mode, setMode } = useThemeMode();
  const [change, state] = useChangePasswordMutation();
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState, reset, watch } = useForm<{ currentPassword: string; newPassword: string; confirm: string }>();

  const onSubmit = handleSubmit(async v => {
    setDone(false);
    try {
      await change({ currentPassword: v.currentPassword, newPassword: v.newPassword }).unwrap();
      setDone(true);
      reset();
    } catch {
      /* shown below */
    }
  });

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <PageHeader overline="Settings" title="Account" />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Profile
          </Typography>
          <Typography>{me?.displayName}</Typography>
          <Typography color="text.secondary">
            {me?.email} · {me?.role === 'ADMIN' ? 'Administrator' : 'Student'}
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Appearance
          </Typography>
          <ToggleButtonGroup exclusive value={mode} onChange={(_, v: ThemeMode | null) => v && setMode(v)} size="small">
            <ToggleButton value="light">Light</ToggleButton>
            <ToggleButton value="dark">Dark</ToggleButton>
            <ToggleButton value="system">Follow system</ToggleButton>
          </ToggleButtonGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Change password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Changing your password signs you out on every other device.
          </Typography>
          <Stack component="form" spacing={2} onSubmit={onSubmit} noValidate>
            {done && <Alert severity="success">Password changed. Other sessions were signed out.</Alert>}
            {state.error && <Alert severity="error">{errorMessage(state.error)}</Alert>}
            <TextField label="Current password" type="password" autoComplete="current-password" {...register('currentPassword', { required: true })} />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              error={!!formState.errors.newPassword}
              helperText={formState.errors.newPassword?.message ?? `At least ${PASSWORD_MIN_LENGTH} characters`}
              {...register('newPassword', { required: true, minLength: { value: PASSWORD_MIN_LENGTH, message: `At least ${PASSWORD_MIN_LENGTH} characters` } })}
            />
            <TextField
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              error={!!formState.errors.confirm}
              helperText={formState.errors.confirm?.message}
              {...register('confirm', { validate: v => v === watch('newPassword') || 'Passwords do not match' })}
            />
            <Button type="submit" variant="contained" disabled={state.isLoading} sx={{ alignSelf: 'flex-start' }}>
              Change password
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};
