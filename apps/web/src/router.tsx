import { Button } from '@mui/material';
import { createBrowserRouter, Link as RouterLink } from 'react-router-dom';
import { RequireAuth, RequireRole } from '@/auth/guards';
import { EmptyState } from '@/components/states';
import { LABS_ENABLED } from '@/config';
import { AccountPage } from '@/pages/AccountPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SetPasswordPage } from '@/pages/auth/SetPasswordPage';
import { BookmarksPage } from '@/pages/BookmarksPage';
import { CheatSheetsPage } from '@/pages/CheatSheetsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ExamAttemptPage } from '@/pages/exams/ExamAttemptPage';
import { ExamsPage } from '@/pages/exams/ExamsPage';
import { LabPage } from '@/pages/labs/LabPage';
import { LabsPage } from '@/pages/labs/LabsPage';
import { PlaygroundPage } from '@/pages/labs/PlaygroundPage';
import { CoursePage } from '@/pages/learn/CoursePage';
import { LessonPage } from '@/pages/learn/LessonPage';
import { ModulePage } from '@/pages/learn/ModulePage';
import { QuizPage } from '@/pages/quizzes/QuizPage';
import { QuizzesPage } from '@/pages/quizzes/QuizzesPage';

const NotFound = () => (
  <EmptyState title="Page not found">
    <Button component={RouterLink} to="/" sx={{ mt: 2 }}>
      Back to the dashboard
    </Button>
  </EmptyState>
);

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/accept-invite', element: <SetPasswordPage mode="invite" /> },
  { path: '/reset-password', element: <SetPasswordPage mode="reset" /> },
  {
    element: <RequireAuth />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'learn', element: <CoursePage /> },
      { path: 'learn/:moduleId', element: <ModulePage /> },
      { path: 'learn/:moduleId/:lessonId', element: <LessonPage /> },
      { path: 'labs', element: <LabsPage /> },
      { path: 'labs/:labId', element: <LabPage /> },
      ...(LABS_ENABLED ? [{ path: 'playground', element: <PlaygroundPage /> }] : []),
      { path: 'quizzes', element: <QuizzesPage /> },
      { path: 'quizzes/:quizId', element: <QuizPage /> },
      { path: 'exams', element: <ExamsPage /> },
      { path: 'exams/attempts/:attemptId', element: <ExamAttemptPage /> },
      { path: 'cheatsheets', element: <CheatSheetsPage /> },
      { path: 'bookmarks', element: <BookmarksPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'admin/users', element: <RequireRole role="ADMIN"><AdminUsersPage /></RequireRole> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
