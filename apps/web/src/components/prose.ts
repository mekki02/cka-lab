import type { SxProps, Theme } from '@mui/material';

/**
 * Typography for long-form technical text (lessons, lab scenarios). One place
 * so a lesson and a lab read the same.
 */
export const proseSx: SxProps<Theme> = {
  fontSize: '1rem',
  lineHeight: 1.75,
  color: 'text.primary',
  '& p': { my: 1.5 },
  '& ul, & ol': { pl: 3, my: 1.5 },
  '& li': { my: 0.5 },
  '& li > p': { my: 0.5 },
  '& :not(pre) > code': {
    px: 0.6,
    py: 0.2,
    borderRadius: 1,
    fontSize: '0.875em',
    bgcolor: theme => (theme.palette.mode === 'dark' ? 'rgba(148,163,184,0.15)' : 'rgba(79,70,229,0.07)'),
    color: theme => (theme.palette.mode === 'dark' ? '#c7d2fe' : '#3730a3'),
    wordBreak: 'break-word',
  },
  '& table': { width: '100%', borderCollapse: 'collapse', my: 2, fontSize: '0.9rem', display: 'block', overflowX: 'auto' },
  '& th, & td': { border: 1, borderColor: 'divider', px: 1.5, py: 1, textAlign: 'left', verticalAlign: 'top' },
  '& th': { bgcolor: 'action.hover', fontWeight: 600 },
  '& blockquote': { borderLeft: 4, borderColor: 'primary.main', m: 0, my: 2, pl: 2, color: 'text.secondary' },
  '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 4 },
  '& strong': { fontWeight: 650 },
};
