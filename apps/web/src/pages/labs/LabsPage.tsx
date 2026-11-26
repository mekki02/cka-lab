import { Box, Card, CardActionArea, CardContent, Chip, Grid, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { LabType } from '@cka/contracts';
import { useLabProgressQuery } from '@/api/api';
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/states';
import { useCurriculum } from '@/hooks/useCurriculum';
import { useSelectedCourse } from '@/hooks/useSelectedCourse';
import { CourseSwitcher } from '@/components/CourseSwitcher';

export const LAB_TYPE_LABEL: Record<LabType, string> = {
  guided: 'Guided',
  challenge: 'Challenge',
  troubleshooting: 'Troubleshooting',
};

export const LabsPage = () => {
  const { index, error, isLoading, refetch } = useCurriculum();
  const { data: progress } = useLabProgressQuery();
  const [filter, setFilter] = useState<LabType | 'all'>('all');
  const { course } = useSelectedCourse();

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !index || !course) return <Loading />;

  const status = new Map((progress ?? []).map(p => [p.labId, p]));
  const labs = index.modulesOf(course.id).flatMap(m => m.labs.map(l => ({ ...l, module: m })));
  const shown = labs.filter(l => filter === 'all' || l.type === filter);

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        overline={`${course.code} hands-on labs`}
        title="Labs"
        actions={<CourseSwitcher />}
        subtitle="Practise on your own cluster (kind works for most labs). Guided labs walk you through each step; challenge labs give only the objective; troubleshooting labs start from a broken state."
      />
      <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v) => v && setFilter(v)} sx={{ mb: 3 }}>
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="guided">Guided</ToggleButton>
        <ToggleButton value="challenge">Challenge</ToggleButton>
        <ToggleButton value="troubleshooting">Troubleshooting</ToggleButton>
      </ToggleButtonGroup>
      {shown.length === 0 ? (
        <EmptyState icon={<ScienceOutlinedIcon fontSize="inherit" />} title={`No ${course.code} labs here yet`}>
          Labs are added alongside their modules. Until then, the exercises of each lesson give you hands-on practice.
        </EmptyState>
      ) : (
        <Grid container spacing={2}>
          {shown.map(l => {
            const p = status.get(l.id);
            return (
              <Grid key={l.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardActionArea component={RouterLink} to={`/labs/${l.id}`} sx={{ height: '100%', alignItems: 'stretch' }}>
                    <CardContent>
                      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                        <Chip size="small" color={l.type === 'troubleshooting' ? 'warning' : l.type === 'challenge' ? 'secondary' : 'primary'} label={LAB_TYPE_LABEL[l.type]} />
                        <Chip size="small" variant="outlined" label={l.difficulty} />
                        {p?.status === 'COMPLETED' && <Chip size="small" color="success" label="Done" />}
                        {p?.status === 'IN_PROGRESS' && <Chip size="small" color="info" variant="outlined" label="In progress" />}
                      </Stack>
                      <Typography variant="h6" component="h2">
                        {l.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {l.module.title} · {l.minutes} min
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};
