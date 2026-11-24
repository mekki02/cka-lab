import { Alert, Button, Stack, TextField } from '@mui/material';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, useLoginMutation } from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { useAppDispatch } from '@/hooks/redux';
import { safeNext } from '@/utils/safeNext';
import { AuthLayout } from './AuthLayout';


export const LoginPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [login, { isLoading, error }] = useLoginMutation();
  const { register, handleSubmit, formState } = useForm<{ email: string; password: string }>();

  const onSubmit = handleSubmit(async values => {
    try {
      await login(values).unwrap();
      dispatch(api.util.resetApiState());
      navigate(safeNext(params.get('next')), { replace: true });
    } catch {
      /* shown below */
    }
  });

  return (
    <AuthLayout title="Sign in" subtitle="Continue your CKA preparation.">
      <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
        {params.has('expired') && !error && <Alert severity="info">Your session has ended. Please sign in again.</Alert>}
        {error && <Alert severity="error">{errorMessage(error)}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          fullWidth
          error={!!formState.errors.email}
          helperText={formState.errors.email?.message}
          {...register('email', { required: 'Enter your email' })}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          fullWidth
          error={!!formState.errors.password}
          helperText={formState.errors.password?.message}
          {...register('password', { required: 'Enter your password' })}
        />
        <Button type="submit" variant="contained" size="large" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
        <Alert severity="info" variant="outlined" icon={false} sx={{ fontSize: '0.85rem' }}>
          Forgot your password? Ask an administrator for a reset link.
        </Alert>
      </Stack>
    </AuthLayout>
  );
};
