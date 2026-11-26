import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ContentError, loadContent } from './loader';

const REPO_CONTENT = resolve(__dirname, '../../../../content');

describe('loadContent (repository content)', () => {
  const bundle = loadContent(REPO_CONTENT);

  const course = (id: string) => bundle.courses.find(c => c.id === id)!;

  it('loads the real course content without errors', () => {
    expect(bundle.courses.map(c => c.id).sort()).toEqual(['cka', 'ckad']);
    expect(course('cka').modules.length).toBeGreaterThan(20);
    expect(course('ckad').modules.length).toBeGreaterThan(8);
  });

  it.each([
    ['cka', ['cluster-architecture', 'services-networking', 'storage', 'troubleshooting', 'workloads-scheduling']],
    ['ckad', ['ckad-design-build', 'ckad-deployment', 'ckad-observability', 'ckad-env-config-security', 'ckad-services-networking']],
  ])('%s: covers every official competency and weights exam domains to 100%%', (id, domains) => {
    const c = course(id);
    const exam = c.domains.filter(d => d.weight > 0);
    expect(exam.map(d => d.id).sort()).toEqual([...domains].sort());
    expect(exam.reduce((s, d) => s + d.weight, 0)).toBe(100);
    const covered = new Set(c.modules.flatMap(m => m.competencies));
    for (const comp of exam.flatMap(d => d.competencies)) expect(covered).toContain(comp.id);
  });
});

describe('loadContent (invalid content)', () => {
  const write = (dir: string, file: string, body: string) => {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), body);
  };

  it('reports every problem at once, with file and path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-'));
    write(dir, 'curriculum.yaml', 'version: "x"\nkubernetesVersion: "nope"\ncourses: [cka]\n');
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

  it('reports courses listed without a file and course files not listed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-'));
    write(dir, 'curriculum.yaml', 'version: "x"\nkubernetesVersion: "1.37"\ncourses: [missing]\n');
    write(dir, 'courses/stray.yaml', 'id: stray\n');
    try {
      loadContent(dir);
      expect.unreachable('expected ContentError');
    } catch (err) {
      const problems = (err as ContentError).problems.join('\n');
      expect(problems).toMatch(/course "missing" has no file courses\/missing\.yaml/);
      expect(problems).toMatch(/courses\/stray\.yaml is not listed/);
    }
  });
});
