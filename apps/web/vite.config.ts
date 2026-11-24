import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import rehypeShiki from '@shikijs/rehype';
import path from 'node:path';
import lessonsContent from './vite-plugins/lessons-content';

const CONTENT_DIR = path.resolve(__dirname, '../../content');

/**
 * Lessons are MDX compiled at build time. Syntax highlighting runs here too
 * (Shiki, both themes emitted as CSS variables), so readers download
 * highlighted HTML instead of a highlighter.
 *
 * In development, /api/* is proxied to the services on localhost so the
 * browser sees one origin — the same shape as the Ingress in production,
 * which is what makes the cookies and CSRF work identically in both.
 */
export default defineConfig({
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        remarkPlugins: [remarkFrontmatter, remarkGfm],
        rehypePlugins: [
          [
            rehypeShiki,
            {
              themes: { light: 'github-light', dark: 'github-dark' },
              defaultColor: false,
              langs: ['bash', 'shell', 'yaml', 'json', 'text', 'console', 'ini', 'go', 'python', 'dockerfile'],
              addLanguageClass: true,
              // Keep the fence's meta string (e.g. title="pod.yaml") on <pre>.
              parseMetaString: (meta: string) =>
                Object.fromEntries([...meta.matchAll(/(\w+)="([^"]*)"/g)].map(m => [`data-${m[1]}`, m[2]])),
            },
          ],
        ],
        providerImportSource: undefined,
      }),
    },
    react({ include: /\.(mdx|js|jsx|ts|tsx)$/ }),
    lessonsContent(CONTENT_DIR),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@cka/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(__dirname, '../..')] },
    proxy: {
      '/api/identity': 'http://localhost:3001',
      '/api/learning': 'http://localhost:3002',
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
