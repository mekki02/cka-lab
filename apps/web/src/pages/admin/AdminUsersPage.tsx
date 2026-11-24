import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LinkIcon from '@mui/icons-material/Link';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { OneTimeLinkResponse, Role, UserDto } from '@cka/contracts';
import {
  useInviteLinkMutation,
  useInviteUserMutation,
  useMeQuery,
  useResetLinkMutation,
  useRevokeSessionsMutation,
  useUpdateUserMutation,
  useUsersQuery,
} from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { CopyButton } from '@/components/CodeBlock';
import { ErrorState, Loading, PageHeader } from '@/components/states';
import { timeAgo } from '@/utils/format';

const STATUS_COLOR = { ACTIVE: 'success', INVITED: 'info', DISABLED: 'default' } as const;

/** Shows a one-time link exactly once — the server keeps only its hash. */
const LinkDialog = ({ result, onClose }: { result: OneTimeLinkResponse | null; onClose: () => void }) => (
  <Dialog open={!!result} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>Send this link to {result?.user.displayName}</DialogTitle>
    <DialogContent>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Copy it now and send it through a channel you trust. It works once, until {result && new Date(result.expiresAt).toLocaleString()}, and
        cannot be shown again — issue a new one if it gets lost.
      </Typography>
      <Box sx={{ position: 'relative', p: 2, pr: 7, border: 1, borderColor: 'divider', borderRadius: 2, fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
        {result?.link}
        {result && <CopyButton text={result.link} />}
      </Box>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} variant="contained">
        Done
      </Button>
    </DialogActions>
  </Dialog>
);

const InviteDialog = ({ open, onClose, onLink }: { open: boolean; onClose: () => void; onLink: (r: OneTimeLinkResponse) => void }) => {
  const [invite, state] = useInviteUserMutation();
  const { register, handleSubmit, reset, formState } = useForm<{ email: string; displayName: string; role: Role }>({ defaultValues: { role: 'STUDENT' } });
  const submit = handleSubmit(async v => {
    try {
      const r = await invite(v).unwrap();
      reset();
      onClose();
      onLink(r);
    } catch {
      /* shown below */
    }
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Invite a user</DialogTitle>
      <DialogContent>
        <Stack component="form" id="invite-form" spacing={2} sx={{ mt: 1 }} onSubmit={submit} noValidate>
          {state.error && <Alert severity="error">{errorMessage(state.error)}</Alert>}
          <TextField label="Email" type="email" autoFocus error={!!formState.errors.email} {...register('email', { required: true })} />
          <TextField label="Display name" error={!!formState.errors.displayName} {...register('displayName', { required: true, maxLength: 100 })} />
          <TextField select label="Role" defaultValue="STUDENT" {...register('role')}>
            <MenuItem value="STUDENT">Student</MenuItem>
            <MenuItem value="ADMIN">Administrator</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" form="invite-form" variant="contained" disabled={state.isLoading}>
          Create invitation
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const RowMenu = ({ user, isSelf, onLink, onError }: { user: UserDto; isSelf: boolean; onLink: (r: OneTimeLinkResponse) => void; onError: (e: unknown) => void }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [update] = useUpdateUserMutation();
  const [inviteLink] = useInviteLinkMutation();
  const [resetLink] = useResetLinkMutation();
  const [revoke] = useRevokeSessionsMutation();
  const run = async (fn: () => Promise<unknown>) => {
    setAnchor(null);
    try {
      await fn();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <>
      <IconButton aria-label={`Actions for ${user.email}`} onClick={e => setAnchor(e.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {user.status === 'INVITED' && (
          <MenuItem onClick={() => run(async () => onLink(await inviteLink(user.id).unwrap()))}>
            <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>New invitation link
          </MenuItem>
        )}
        {user.status === 'ACTIVE' && (
          <MenuItem onClick={() => run(async () => onLink(await resetLink(user.id).unwrap()))}>
            <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>Password reset link
          </MenuItem>
        )}
        {!isSelf && user.status !== 'INVITED' && (
          <MenuItem onClick={() => run(() => update({ id: user.id, patch: { role: user.role === 'ADMIN' ? 'STUDENT' : 'ADMIN' } }).unwrap())}>
            <ListItemIcon><AdminPanelSettingsOutlinedIcon fontSize="small" /></ListItemIcon>
            {user.role === 'ADMIN' ? 'Make student' : 'Make administrator'}
          </MenuItem>
        )}
        {!isSelf && user.status === 'ACTIVE' && (
          <MenuItem onClick={() => run(() => revoke(user.id).unwrap())}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>Sign out everywhere
          </MenuItem>
        )}
        {!isSelf && user.status === 'ACTIVE' && (
          <MenuItem onClick={() => run(() => update({ id: user.id, patch: { status: 'DISABLED' } }).unwrap())} sx={{ color: 'error.main' }}>
            <ListItemIcon><BlockIcon fontSize="small" color="error" /></ListItemIcon>Deactivate
          </MenuItem>
        )}
        {!isSelf && user.status === 'DISABLED' && (
          <MenuItem onClick={() => run(() => update({ id: user.id, patch: { status: 'ACTIVE' } }).unwrap())}>
            <ListItemIcon><CheckCircleOutlineIcon fontSize="small" /></ListItemIcon>Reactivate
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export const AdminUsersPage = () => {
  const { data: users, error, isLoading, refetch } = useUsersQuery();
  const { data: me } = useMeQuery();
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<OneTimeLinkResponse | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !users) return <Loading />;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        overline="Administration"
        title="Users"
        subtitle="There is no public sign-up. Invite people here and send them the one-time link yourself."
        actions={
          <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => setInviting(true)}>
            Invite user
          </Button>
        }
      />
      {actionError !== null && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {errorMessage(actionError)}
        </Alert>
      )}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last sign-in</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Typography fontWeight={500}>
                      {u.displayName} {u.id === me?.id && <Chip size="small" label="You" sx={{ ml: 1 }} />}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {u.email}
                    </Typography>
                  </TableCell>
                  <TableCell>{u.role === 'ADMIN' ? 'Administrator' : 'Student'}</TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[u.status]} variant={u.status === 'DISABLED' ? 'outlined' : 'filled'} label={u.status.toLowerCase()} />
                  </TableCell>
                  <TableCell>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : '—'}</TableCell>
                  <TableCell align="right">
                    <RowMenu user={u} isSelf={u.id === me?.id} onLink={setLink} onError={setActionError} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} onLink={setLink} />
      <LinkDialog result={link} onClose={() => setLink(null)} />
    </Box>
  );
};
