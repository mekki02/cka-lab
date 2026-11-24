import { Box, Link, Typography } from '@mui/material';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { proseSx } from './prose';

/**
 * Markdown from API content (labs, quizzes, exams). No raw HTML is allowed
 * (react-markdown's default), so content can never inject markup.
 */
const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className ?? '')?.[1];
    const text = String(children ?? '');
    // Fenced blocks have a language or span lines; everything else is inline.
    if (lang || text.includes('\n')) return <CodeBlock code={text} lang={lang} />;
    return <code>{children}</code>;
  },
  a: ({ href, children }) => (
    <Link href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
      {children}
    </Link>
  ),
  h1: ({ children }) => <Typography variant="h4" component="h3" sx={{ mt: 2, mb: 1 }}>{children}</Typography>,
  h2: ({ children }) => <Typography variant="h5" component="h3" sx={{ mt: 2, mb: 1 }}>{children}</Typography>,
  h3: ({ children }) => <Typography variant="h6" component="h4" sx={{ mt: 2, mb: 1 }}>{children}</Typography>,
};

export const Markdown = ({ children, dense = false }: { children: string; dense?: boolean }) => (
  <Box sx={{ ...proseSx, ...(dense ? { '& > :first-of-type': { mt: 0 }, '& > :last-child': { mb: 0 } } : {}) }}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  </Box>
);
