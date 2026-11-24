import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Link,
  Radio,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import type { QuizAttemptDto, QuizQuestionDto } from '@cka/contracts';
import { useQuizQuery, useSubmitQuizMutation } from '@/api/api';
import { errorMessage } from '@/api/baseQuery';
import { Markdown } from '@/components/Markdown';
import { ErrorState, Loading } from '@/components/states';
import { useCurriculum } from '@/hooks/useCurriculum';

const TYPE_LABEL = { single: 'One answer', multiple: 'Select all that apply', scenario: 'Scenario · one answer' } as const;

const Question = ({
  q,
  n,
  selected,
  onChange,
  result,
}: {
  q: QuizQuestionDto;
  n: number;
  selected: string[];
  onChange: (ids: string[]) => void;
  result?: NonNullable<QuizAttemptDto['results']>[number];
}) => {
  const multi = q.type === 'multiple';
  const locked = !!result;
  return (
    <Card sx={{ mb: 2.5, borderLeft: 4, borderLeftColor: result ? (result.correct ? 'success.main' : 'error.main') : 'divider' }}>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="overline" color="text.secondary">
            Question {n}
          </Typography>
          <Chip size="small" variant="outlined" label={TYPE_LABEL[q.type]} />
          {result && (result.correct ? <Chip size="small" color="success" icon={<CheckCircleIcon />} label="Correct" /> : <Chip size="small" color="error" icon={<CancelIcon />} label="Incorrect" />)}
        </Stack>
        <Markdown>{q.prompt}</Markdown>
        <Stack spacing={1} sx={{ mt: 1 }} role={multi ? 'group' : 'radiogroup'}>
          {q.options.map(o => {
            const checked = selected.includes(o.id);
            const isCorrect = result?.correctOptions.includes(o.id);
            const toggle = () => {
              if (locked) return;
              if (!multi) onChange([o.id]);
              else onChange(checked ? selected.filter(s => s !== o.id) : [...selected, o.id]);
            };
            return (
              <Box
                key={o.id}
                sx={{
                  border: 1,
                  borderRadius: 2,
                  px: 1.5,
                  py: 0.5,
                  borderColor: result ? (isCorrect ? 'success.main' : checked ? 'error.main' : 'divider') : checked ? 'primary.main' : 'divider',
                  bgcolor: result && isCorrect ? 'rgba(22,163,74,0.06)' : undefined,
                }}
              >
                <FormControlLabel
                  sx={{ width: '100%', m: 0, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { pt: 1, flex: 1 } }}
                  control={multi ? <Checkbox checked={checked} onChange={toggle} disabled={locked} /> : <Radio checked={checked} onChange={toggle} disabled={locked} />}
                  label={<Markdown dense>{o.text}</Markdown>}
                />
                {result && (checked || isCorrect) && (
                  <Box sx={{ pl: 5.5, pb: 1, color: 'text.secondary', fontSize: '0.9rem' }}>
                    <Markdown dense>{result.optionExplanations[o.id] ?? ''}</Markdown>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
        {result && (
          <Alert severity="info" variant="outlined" sx={{ mt: 2, '& .MuiAlert-message': { width: '100%' } }}>
            <Markdown dense>{result.explanation}</Markdown>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export const QuizPage = () => {
  const { quizId = '' } = useParams();
  const { data: quiz, error, isLoading, refetch } = useQuizQuery(quizId);
  const [submit, submitState] = useSubmitQuizMutation();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [attempt, setAttempt] = useState<QuizAttemptDto | null>(null);
  const { index } = useCurriculum();

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !quiz) return <Loading />;

  const answered = quiz.questions.filter(q => (answers[q.id] ?? []).length > 0).length;
  const results = new Map((attempt?.results ?? []).map(r => [r.questionId, r]));

  const onSubmit = async () => {
    try {
      setAttempt(await submit({ quizId, answers }).unwrap());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      /* shown below */
    }
  };

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto' }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/quizzes" underline="hover" color="inherit">
          Quizzes
        </Link>
        <Link component={RouterLink} to={`/learn/${quiz.moduleId}`} underline="hover" color="inherit">
          {index?.modules.get(quiz.moduleId)?.title ?? 'Module'}
        </Link>
      </Breadcrumbs>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
        {quiz.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        {quiz.description} Pass mark: {quiz.passPercent}%.
      </Typography>

      {attempt && (
        <Alert severity={attempt.passed ? 'success' : 'warning'} sx={{ mb: 3 }} action={<Button color="inherit" onClick={() => { setAttempt(null); setAnswers({}); }}>Retake</Button>}>
          <strong>
            {attempt.score}/{attempt.maxScore} correct ({attempt.percent}%)
          </strong>{' '}
          — {attempt.passed ? 'passed. Review the explanations anyway: they cover the edge cases.' : 'below the pass mark. Read the explanations, revisit the lessons, then retake.'}
        </Alert>
      )}

      {quiz.questions.map((q, i) => (
        <Question key={q.id} q={q} n={i + 1} selected={answers[q.id] ?? []} onChange={ids => setAnswers(a => ({ ...a, [q.id]: ids }))} result={results.get(q.id)} />
      ))}

      {!attempt && (
        <Card sx={{ position: 'sticky', bottom: 16, p: 2, mb: 4 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Typography color="text.secondary">
              {answered}/{quiz.questions.length} answered
            </Typography>
            <Button variant="contained" size="large" onClick={onSubmit} disabled={answered === 0 || submitState.isLoading}>
              {submitState.isLoading ? 'Grading…' : 'Submit answers'}
            </Button>
          </Stack>
          {submitState.error && <Alert severity="error" sx={{ mt: 1 }}>{errorMessage(submitState.error)}</Alert>}
        </Card>
      )}
    </Box>
  );
};
