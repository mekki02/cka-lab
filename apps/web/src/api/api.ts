import { createApi } from '@reduxjs/toolkit/query/react';
import type {
  AcceptInviteRequest,
  ChangePasswordRequest,
  CheatsheetDto,
  Curriculum,
  DashboardDto,
  ExamAttemptDto,
  ExamSummaryDto,
  InviteUserRequest,
  LabDto,
  LabProgressDto,
  LoginRequest,
  OneTimeLinkResponse,
  ProgressStatus,
  ProgressSummaryDto,
  QuizAttemptDto,
  QuizDto,
  ResetPasswordRequest,
  TokenInfoResponse,
  UpdateExamTaskRequest,
  UpdateLabProgressRequest,
  UpdateUserRequest,
  UserDto,
} from '@cka/contracts';
import { baseQuery } from './baseQuery';

/**
 * One API slice for both services (the boilerplate's console pattern: one
 * reducer, one middleware). Paths are prefixed by service, which is exactly
 * how the Ingress routes them.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Me', 'Users', 'Progress', 'Dashboard', 'Labs', 'QuizAttempts', 'ExamAttempts'],
  endpoints: b => ({
    // --- identity ---------------------------------------------------------
    me: b.query<UserDto, void>({ query: () => 'identity/auth/me', providesTags: ['Me'] }),
    login: b.mutation<UserDto, LoginRequest>({
      query: body => ({ url: 'identity/auth/login', method: 'POST', body }),
    }),
    logout: b.mutation<void, void>({ query: () => ({ url: 'identity/auth/logout', method: 'POST' }) }),
    tokenInfo: b.query<TokenInfoResponse, string>({
      query: token => ({ url: 'identity/auth/token-info', params: { token } }),
    }),
    acceptInvite: b.mutation<UserDto, AcceptInviteRequest>({
      query: body => ({ url: 'identity/auth/accept-invite', method: 'POST', body }),
    }),
    resetPassword: b.mutation<UserDto, ResetPasswordRequest>({
      query: body => ({ url: 'identity/auth/reset-password', method: 'POST', body }),
    }),
    changePassword: b.mutation<void, ChangePasswordRequest>({
      query: body => ({ url: 'identity/auth/change-password', method: 'POST', body }),
    }),
    users: b.query<UserDto[], void>({ query: () => 'identity/users', providesTags: ['Users'] }),
    inviteUser: b.mutation<OneTimeLinkResponse, InviteUserRequest>({
      query: body => ({ url: 'identity/users', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    updateUser: b.mutation<UserDto, { id: string; patch: UpdateUserRequest }>({
      query: ({ id, patch }) => ({ url: `identity/users/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Users'],
    }),
    inviteLink: b.mutation<OneTimeLinkResponse, string>({
      query: id => ({ url: `identity/users/${id}/invite-link`, method: 'POST' }),
    }),
    resetLink: b.mutation<OneTimeLinkResponse, string>({
      query: id => ({ url: `identity/users/${id}/reset-link`, method: 'POST' }),
    }),
    revokeSessions: b.mutation<{ revoked: number }, string>({
      query: id => ({ url: `identity/users/${id}/revoke-sessions`, method: 'POST' }),
    }),

    // --- learning ---------------------------------------------------------
    curriculum: b.query<Curriculum, void>({ query: () => 'learning/curriculum', keepUnusedDataFor: 3600 }),
    progress: b.query<ProgressSummaryDto, void>({ query: () => 'learning/progress', providesTags: ['Progress'] }),
    dashboard: b.query<DashboardDto, void>({ query: () => 'learning/dashboard', providesTags: ['Dashboard'] }),
    setLessonStatus: b.mutation<void, { lessonId: string; status: ProgressStatus }>({
      query: ({ lessonId, status }) => ({ url: `learning/progress/lessons/${lessonId}`, method: 'PUT', body: { status } }),
      invalidatesTags: ['Progress', 'Dashboard'],
    }),
    visitLesson: b.mutation<void, string>({
      query: lessonId => ({ url: `learning/progress/lessons/${lessonId}/visit`, method: 'POST' }),
      invalidatesTags: ['Progress', 'Dashboard'],
    }),
    setBookmark: b.mutation<void, { lessonId: string; on: boolean }>({
      query: ({ lessonId, on }) => ({ url: `learning/bookmarks/${lessonId}`, method: on ? 'PUT' : 'DELETE' }),
      invalidatesTags: ['Progress'],
    }),

    labProgress: b.query<LabProgressDto[], void>({ query: () => 'learning/labs/progress', providesTags: ['Labs'] }),
    lab: b.query<{ lab: LabDto; progress: LabProgressDto | null }, string>({
      query: id => `learning/labs/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Labs', id }],
    }),
    revealSolution: b.mutation<{ solution: string }, { labId: string; taskId: string }>({
      query: ({ labId, taskId }) => ({ url: `learning/labs/${labId}/tasks/${taskId}/solution`, method: 'POST' }),
      invalidatesTags: (_r, _e, { labId }) => [{ type: 'Labs', id: labId }],
    }),
    updateLabProgress: b.mutation<LabProgressDto, { labId: string; patch: UpdateLabProgressRequest }>({
      query: ({ labId, patch }) => ({ url: `learning/labs/${labId}/progress`, method: 'PUT', body: patch }),
      invalidatesTags: (_r, _e, { labId }) => ['Labs', { type: 'Labs', id: labId }, 'Dashboard'],
    }),

    quiz: b.query<QuizDto, string>({ query: id => `learning/quizzes/${id}` }),
    quizAttempts: b.query<QuizAttemptDto[], void>({ query: () => 'learning/quizzes/attempts', providesTags: ['QuizAttempts'] }),
    submitQuiz: b.mutation<QuizAttemptDto, { quizId: string; answers: Record<string, string[]> }>({
      query: ({ quizId, answers }) => ({ url: `learning/quizzes/${quizId}/attempts`, method: 'POST', body: { answers } }),
      invalidatesTags: ['QuizAttempts', 'Dashboard'],
    }),

    exams: b.query<ExamSummaryDto[], void>({ query: () => 'learning/exams' }),
    examAttempts: b.query<ExamAttemptDto[], void>({ query: () => 'learning/exams/attempts', providesTags: ['ExamAttempts'] }),
    startExam: b.mutation<ExamAttemptDto, string>({
      query: examId => ({ url: `learning/exams/${examId}/attempts`, method: 'POST' }),
      invalidatesTags: ['ExamAttempts'],
    }),
    examAttempt: b.query<ExamAttemptDto, string>({
      query: id => `learning/exams/attempts/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'ExamAttempts', id }],
    }),
    updateExamTask: b.mutation<ExamAttemptDto, { attemptId: string; taskId: string; patch: UpdateExamTaskRequest }>({
      query: ({ attemptId, taskId, patch }) => ({
        url: `learning/exams/attempts/${attemptId}/tasks/${taskId}`,
        method: 'PATCH',
        body: patch,
      }),
      // Write the server's answer straight into the cache: no refetch flicker.
      async onQueryStarted({ attemptId }, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(api.util.upsertQueryData('examAttempt', attemptId, data));
      },
    }),
    submitExam: b.mutation<ExamAttemptDto, string>({
      query: id => ({ url: `learning/exams/attempts/${id}/submit`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => ['ExamAttempts', { type: 'ExamAttempts', id }, 'Dashboard'],
    }),

    cheatsheets: b.query<CheatsheetDto[], void>({ query: () => 'learning/cheatsheets', keepUnusedDataFor: 3600 }),
  }),
});

export const {
  useMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useTokenInfoQuery,
  useAcceptInviteMutation,
  useResetPasswordMutation,
  useChangePasswordMutation,
  useUsersQuery,
  useInviteUserMutation,
  useUpdateUserMutation,
  useInviteLinkMutation,
  useResetLinkMutation,
  useRevokeSessionsMutation,
  useCurriculumQuery,
  useProgressQuery,
  useDashboardQuery,
  useSetLessonStatusMutation,
  useVisitLessonMutation,
  useSetBookmarkMutation,
  useLabProgressQuery,
  useLabQuery,
  useRevealSolutionMutation,
  useUpdateLabProgressMutation,
  useQuizQuery,
  useQuizAttemptsQuery,
  useSubmitQuizMutation,
  useExamsQuery,
  useExamAttemptsQuery,
  useStartExamMutation,
  useExamAttemptQuery,
  useUpdateExamTaskMutation,
  useSubmitExamMutation,
  useCheatsheetsQuery,
} = api;
