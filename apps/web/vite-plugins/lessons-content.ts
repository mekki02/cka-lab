import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { parse as parseYaml } from 'yaml';
import { anchorOf } from '../src/lessons/anchor';

/**
 * Serves the lesson bodies (content/lessons/<module>/<lesson>.mdx) as two
 * virtual modules — the same approach as the boilerplate's help center:
 *
 *   virtual:lessons         id -> module, headings, and a lazy import() per
 *                           lesson, so every lesson is its own chunk and the
 *                           first page load ships no lesson text.
 *   virtual:lessons-search  plain text of every lesson, loaded only when the
 *                           user searches.
 *
 * The curriculum (titles, order, status) comes from ms-learning at run time;
 * this index only answers "is there a body for lesson X, and how do I load it".
 */
const INDEX_ID = 'virtual:lessons';
const SEARCH_ID = 'virtual:lessons-search';
const RESOLVED = { [INDEX_ID]: `\0${INDEX_ID}`, [SEARCH_ID]: `\0${SEARCH_ID}` };

export interface LessonHeading {
  depth: 2 | 3;
  text: string;
  anchor: string;
}

interface Entry {
  id: string;
  moduleId: string;
  file: string;
  headings: LessonHeading[];
  text: string;
}


/** Lines outside fenced code blocks, so `## ` inside an example is not a heading. */
const proseLines = (body: string): string[] => {
  let fenced = false;
  return body.split('\n').filter(line => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced;
  });
};

const load = (dir: string): Entry[] => {
  if (!existsSync(dir)) return [];
  const entries: Entry[] = [];
  for (const moduleId of readdirSync(dir).sort()) {
    const moduleDir = path.join(dir, moduleId);
    for (const name of readdirSync(moduleDir).filter(f => f.endsWith('.mdx')).sort()) {
      const file = path.join(moduleDir, name);
      const raw = readFileSync(file, 'utf8');
      const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
      const data = (fm ? parseYaml(fm[1]!) : {}) as { id?: string };
      const id = data.id ?? name.replace(/\.mdx$/, '');
      const body = fm ? raw.slice(fm[0].length) : raw;
      const lines = proseLines(body);
      const headings: LessonHeading[] = lines
        .map(l => l.match(/^(##|###)\s+(.+?)\s*$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map(m => ({ depth: m[1]!.length as 2 | 3, text: m[2]!.replace(/`/g, ''), anchor: anchorOf(m[2]!) }));
      const text = lines
        .filter(l => !/^(import|export)\s/.test(l))
        .join(' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[#*_`>|-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      entries.push({ id, moduleId, file, headings, text });
    }
  }
  return entries;
};

export default function lessonsContent(contentDir: string): Plugin {
  const lessonsDir = path.join(contentDir, 'lessons');
  let root = process.cwd();

  return {
    name: 'cka:lessons-content',
    configResolved(c) {
      root = c.root;
    },
    configureServer(server: ViteDevServer) {
      server.watcher.add(lessonsDir);
      const reload = (file: string) => {
        if (!file.startsWith(lessonsDir)) return;
        for (const id of Object.values(RESOLVED)) {
          const mod = server.moduleGraph.getModuleById(id);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
    },
    resolveId(id) {
      return id === INDEX_ID || id === SEARCH_ID ? RESOLVED[id] : undefined;
    },
    load(id) {
      if (id !== RESOLVED[INDEX_ID] && id !== RESOLVED[SEARCH_ID]) return undefined;
      const entries = load(lessonsDir);
      if (id === RESOLVED[SEARCH_ID]) {
        return `export const documents = ${JSON.stringify(entries.map(e => ({ id: e.id, headings: e.headings.map(h => h.text).join(' '), text: e.text })))};`;
      }
      const meta = Object.fromEntries(entries.map(e => [e.id, { moduleId: e.moduleId, headings: e.headings }]));
      const loaders = entries
        .map(e => `  ${JSON.stringify(e.id)}: () => import(${JSON.stringify('/' + path.relative(root, e.file).split(path.sep).join('/'))}),`)
        .join('\n');
      return `export const lessons = ${JSON.stringify(meta)};\nexport const loaders = {\n${loaders}\n};\n`;
    },
  };
}
