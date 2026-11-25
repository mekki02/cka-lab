import { Chip, List, ListItemButton, ListItemIcon, ListItemText, Stack } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { ExerciseKind, ExerciseStatus, ExerciseSummaryDto } from '@cka/contracts';
import { useExerciseProgressQuery } from '@/api/api';

export const EXERCISE_KIND_LABEL: Record<ExerciseKind, string> = { exercise: 'Exercise', challenge: 'Challenge' };

/** exerciseId -> status. */
export const useExerciseStatus = () => {
  const { data } = useExerciseProgressQuery();
  return useMemo(() => new Map((data ?? []).map(p => [p.exerciseId, p.status])), [data]);
};

export const ExerciseStatusIcon = ({ status, kind }: { status?: ExerciseStatus; kind: ExerciseKind }) =>
  status === 'COMPLETED' ? (
    <CheckCircleIcon color="success" />
  ) : status === 'IN_PROGRESS' ? (
    <TimelapseIcon color="warning" />
  ) : kind === 'challenge' ? (
    <EmojiEventsOutlinedIcon color="secondary" />
  ) : (
    <RadioButtonUncheckedIcon color="disabled" />
  );

/** A compact list of exercises with their status, used on lesson, module and index pages. */
export const ExerciseList = ({ exercises, dense }: { exercises: ExerciseSummaryDto[]; dense?: boolean }) => {
  const status = useExerciseStatus();
  return (
    <List disablePadding dense={dense}>
      {exercises.map(e => (
        <ListItemButton key={e.id} component={RouterLink} to={`/exercises/${e.id}`} sx={{ borderRadius: 2, alignItems: 'flex-start' }}>
          <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
            <ExerciseStatusIcon status={status.get(e.id)} kind={e.kind} />
          </ListItemIcon>
          <ListItemText
            primary={e.title}
            secondary={
              <Stack direction="row" spacing={0.5} component="span" sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                <Chip
                  component="span"
                  size="small"
                  color={e.kind === 'challenge' ? 'secondary' : 'default'}
                  variant={e.kind === 'challenge' ? 'filled' : 'outlined'}
                  label={EXERCISE_KIND_LABEL[e.kind]}
                />
                <Chip component="span" size="small" variant="outlined" label={e.difficulty} />
                <Chip component="span" size="small" variant="outlined" label={`${e.minutes} min`} />
                {e.tags.map(t => (
                  <Chip component="span" key={t} size="small" variant="outlined" label={t} sx={{ color: 'text.secondary' }} />
                ))}
              </Stack>
            }
            slotProps={{ primary: { fontWeight: 500 }, secondary: { component: 'span' } }}
          />
        </ListItemButton>
      ))}
    </List>
  );
};
