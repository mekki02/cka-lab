/**
 * `npm run content:check` — validates all course content without starting
 * the service. Run it before committing content; CI runs it too.
 *
 * Beyond the YAML schemas (see loader.ts) it checks that every *published*
 * lesson has an MDX body and that no MDX file is orphaned.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ContentError, loadContent } from './loader';

const contentDir = resolve(process.env.CONTENT_DIR ?? join(__dirname, '../../../../content'));

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.mdx') ? [join(dir, e.name)] : [],
      )
    : [];

try {
  const bundle = loadContent(contentDir);
  const problems: string[] = [];
  const lessonsDir = join(contentDir, 'lessons');
  const expected = new Map<string, string>();

  for (const m of bundle.curriculum.modules) {
    for (const l of m.lessons) {
      const file = join(lessonsDir, m.id, `${l.id}.mdx`);
      expected.set(file, l.status);
      if (l.status === 'published' && !existsSync(file)) {
        problems.push(`published lesson "${l.id}" has no body: ${relative(contentDir, file)}`);
      }
      if (existsSync(file)) {
        const head = readFileSync(file, 'utf8').slice(0, 400);
        if (!new RegExp(`^---[\\s\\S]*?\\nid:\\s*${l.id}\\s*\\n`).test(head)) {
          problems.push(`${relative(contentDir, file)}: frontmatter must contain "id: ${l.id}"`);
        }
      }
    }
  }
  for (const file of walk(lessonsDir)) {
    if (!expected.has(file)) problems.push(`orphan lesson file (not in curriculum.yaml): ${relative(contentDir, file)}`);
  }
  if (problems.length) throw new ContentError(problems);

  const lessons = bundle.curriculum.modules.flatMap(m => m.lessons);
  const published = lessons.filter(l => l.status === 'published').length;
  console.log(
    `Content OK: ${bundle.curriculum.modules.length} modules, ${published}/${lessons.length} lessons published, ` +
      `${bundle.labs.size} labs, ${bundle.exercises.size} exercises, ${bundle.quizzes.size} quizzes ` +
      `(${[...bundle.quizzes.values()].reduce((n, q) => n + q.questions.length, 0)} questions), ` +
      `${bundle.exams.size} mock exams, ${bundle.cheatsheets.length} cheat sheets.`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
