import type { ReactNode } from 'react';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import TerminalIcon from '@mui/icons-material/Terminal';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import { LABS_ENABLED } from '@/config';
import type { Role } from '@cka/contracts';

/** Navigation as data (the boilerplate console's pattern). */
export interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  /** Match nested routes too (e.g. /learn/...). */
  prefix?: boolean;
  roles?: Role[];
}

export const NAV_SECTIONS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Dashboard', to: '/', icon: <DashboardOutlinedIcon /> },
      { label: 'Course', to: '/learn', icon: <SchoolOutlinedIcon />, prefix: true },
      { label: 'Exercises', to: '/exercises', icon: <FitnessCenterIcon />, prefix: true },
      { label: 'Labs', to: '/labs', icon: <ScienceOutlinedIcon />, prefix: true },
      ...(LABS_ENABLED ? [{ label: 'Playground', to: '/playground', icon: <TerminalIcon /> }] : []),
      { label: 'Quizzes', to: '/quizzes', icon: <QuizOutlinedIcon />, prefix: true },
      { label: 'Mock exams', to: '/exams', icon: <TimerOutlinedIcon />, prefix: true },
    ],
  },
  {
    title: 'Reference',
    items: [
      { label: 'Cheat sheets', to: '/cheatsheets', icon: <DescriptionOutlinedIcon />, prefix: true },
      { label: 'Bookmarks', to: '/bookmarks', icon: <BookmarkBorderIcon /> },
    ],
  },
  {
    title: 'Administration',
    items: [{ label: 'Users', to: '/admin/users', icon: <PeopleOutlineIcon />, roles: ['ADMIN'] }],
  },
];
