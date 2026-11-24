import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ContentError, loadContent } from './loader';

const REPO_CONTENT = resolve(__dirname, '../../../../content');

describe('loadContent (repository content)', () => {
  const bundle = loadContent(REPO_CONTENT);

  it('loads the real course content without errors', () => {
    expect(bundle.curriculum.modules.length).toBeGreaterThan(20);
  });

  it('covers every official competency and weights exam domains to 100%', () => {
    const exam = bundle.curriculum.domains.filter(d => d.weight > 0);
    expect(exam.map(d => d.id).sort()).toEqual(
      ['cluster-architecture', 'services-networking', 'storage', 'troubleshooting', 'workloads-scheduling'].sort(),
    );
    expect(exam.reduce((s, d) => s + d.weight, 0)).toBe(100);
    const covered = new Set(bundle.curriculum.modules.flatMap(m => m.competencies));
    for (const c of exam.flatMap(d => d.competencies)) expect(covered).toContain(c.id);
  });
});

describe('loadContent (invalid content)', () => {
  const write = (dir: string, file: string, body: string) => {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), body);
  };

  it('reports every problem at once, with file and path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-'));
    write(dir, 'curriculum.yaml', 'version: "x"\nkubernetesVersion: "nope"\n');
    write(dir, 'quizzes/bad.yaml', 'id: Bad_Id\n');
    try {
      loadContent(dir);
      expect.unreachable("expected ContentError");
    } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      const problems = (err as ContentError).problems.join('\n');
      expect(problems).toMatch(/curriculum\.yaml: kubernetesVersion/);
      expect(problems).toMatch(/bad\.yaml: id: ids are kebab-case/);
    }
  });
});
