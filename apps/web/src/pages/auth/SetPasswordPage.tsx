import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@cka/contracts';
import { api, useAcceptInviteMutation, useResetPasswordMutation, useTokenInfoQuery } from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { Loading } from '@/components/states';
import { useAppDispatch } from '@/hooks/redux';
import { AuthLayout } from './AuthLayout';

interface Values {
  displayName: string;
  password: string;
  confirm: string;
}

/**
 * Handles both one-time links: /accept-invite#token=… and
 * /reset-password#token=…. The token is in the URL fragment so it never
 * reaches a server log; we read it here and send it in the request body.
 */
export const SetPasswordPage = ({ mode }: { mode: 'invite' | 'reset' }) => {
  const token = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '', []);
  const info = useTokenInfoQuery(token, { skip: !token });
  const [accept, acceptState] = useAcceptInviteMutation();
  const [reset, resetState] = useResetPasswordMutation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { register, handleSubmit, formState, watch } = useForm<Values>();
  const submitting = acceptState.isLoading || resetState.isLoading;
  const submitError = acceptState.error ?? resetState.error;

  const title = mode === 'invite' ? 'Welcome aboard' : 'Choose a new password';

  if (!token || info.error) {
    return (
      <AuthLayout title={title}>
        <Alert severity="error">
          {token ? errorMessage(info.error) : 'This link is incomplete. Open the full link you were sent, or ask an administrator for a new one.'}
        </Alert>
      </AuthLayout>
    );
  }
  if (info.isLoading || !info.data) return <Loading />;

  const onSubmit = handleSubmit(async v => {
    try {
      if (mode === 'invite') await accept({ token, password: v.password, displayName: v.displayName }).unwrap();
      else await reset({ token, password: v.password }).unwrap();
      // Drop the token from the address bar and history.
      window.history.replaceState(null, '', window.location.pathname);
      dispatch(api.util.resetApiState());
      navigate('/', { replace: true });
    } catch {
      /* shown below */
    }
  });

  return (
    <AuthLayout
      title={title}
      subtitle={
        mode === 'invite' ? (
          <>
            You were invited as <strong>{info.data.email}</strong>. Choose a password to activate your account.
          </>
        ) : (
          <>
            Resetting the password of <strong>{info.data.email}</strong>. You will be signed out on all other devices.
          </>
        )
      }
    >
      <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
        {submitError && <Alert severity="error">{errorMessage(submitError)}</Alert>}
        {mode === 'invite' && (
          <TextField label="Your name" defaultValue={info.data.displayName} fullWidth {...register('displayName', { maxLength: 100 })} />
        )}
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          fullWidth
          autoFocus
          error={!!formState.errors.password}
          helperText={formState.errors.password?.message ?? `At least ${PASSWORD_MIN_LENGTH} characters. A passphrase works well.`}
          {...register('password', {
            required: 'Choose a password',
            minLength: { value: PASSWORD_MIN_LENGTH, message: `At least ${PASSWORD_MIN_LENGTH} characters` },
            maxLength: { value: PASSWORD_MAX_LENGTH, message: `At most ${PASSWORD_MAX_LENGTH} characters` },
          })}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          fullWidth
          error={!!formState.errors.confirm}
          helperText={formState.errors.confirm?.message}
          {...register('confirm', { validate: v => v === watch('password') || 'Passwords do not match' })}
        />
        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? 'Saving…' : mode === 'invite' ? 'Activate my account' : 'Set password and sign in'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          Link valid until {new Date(info.data.expiresAt).toLocaleString()}.
        </Typography>
      </Stack>
    </AuthLayout>
  );
};
