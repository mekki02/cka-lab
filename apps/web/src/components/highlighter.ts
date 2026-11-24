import type { HighlighterCore } from 'shiki/core';

/**
 * Runtime syntax highlighting for content that arrives from the API (labs,
 * quizzes, cheat sheets). Lessons are highlighted at build time instead.
 *
 * Uses Shiki's core with the JavaScript regex engine (no WebAssembly) and
 * only the languages we teach with, loaded on first use — a few hundred KB,
 * never on the initial page load.
 */
export const RUNTIME_LANGS = ['bash', 'yaml', 'json'] as const;

let instance: Promise<HighlighterCore> | null = null;

export const getHighlighter = (): Promise<HighlighterCore> => {
  instance ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]);
    return createHighlighterCore({
      themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
      langs: [import('shiki/langs/bash.mjs'), import('shiki/langs/yaml.mjs'), import('shiki/langs/json.mjs')],
      engine: createJavaScriptRegexEngine(),
    });
  })();
  return instance;
};

export const normalizeLang = (lang?: string): string | null => {
  const l = (lang ?? '').toLowerCase();
  if (['bash', 'sh', 'shell', 'console', 'zsh'].includes(l)) return 'bash';
  if (['yaml', 'yml'].includes(l)) return 'yaml';
  if (l === 'json') return 'json';
  return null;
};

/** Returns highlighted HTML (both themes as CSS variables), or null for plain text. */
export const highlight = async (code: string, lang?: string): Promise<string | null> => {
  const l = normalizeLang(lang);
  if (!l) return null;
  const h = await getHighlighter();
  return h.codeToHtml(code, { lang: l, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false });
};
