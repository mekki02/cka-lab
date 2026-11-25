import { Box } from '@mui/material';
import { PageHeader } from '@/components/states';
import { LabEnvironment } from '@/labs/LabEnvironment';

/** An empty cluster to experiment in — no tasks, no checks. */
export const PlaygroundPage = () => (
  <Box sx={{ maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
    <PageHeader
      overline="Hands-on"
      title="Playground"
      subtitle="Your own Kubernetes cluster, where you are cluster-admin. Break things, try the commands from the lessons, practise for the exam. It is deleted when you end it or leave it idle."
    />
    <Box sx={{ flex: 1, minHeight: 420 }}>
      <LabEnvironment labId={null} />
    </Box>
  </Box>
);
