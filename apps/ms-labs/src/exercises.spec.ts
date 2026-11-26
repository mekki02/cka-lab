import { join } from 'node:path';
import {
  compareValue,
  exerciseClusterScript,
  exerciseHomeScript,
  historyMatches,
  stripAnsi,
} from './checks/exercise-grading';
import { loadExercises, type RunnableExercise } from './content/exercises';
import { toolboxPod, type ManifestOptions } from './sessions/manifests';
import { ANN, loadedExercise } from './sessions/model';

describe('compareValue', () => {
  it('exact trims and respects case unless told otherwise', () => {
    expect(compareValue('  10.244.1.7\n', '10.244.1.7', 'exact')).toBe(true);
    expect(compareValue('ReplicaSet', 'replicaset', 'exact')).toBe(false);
    expect(compareValue('ReplicaSet', 'replicaset', 'exact', { caseSensitive: false })).toBe(true);
  });

  it('lines ignores order, blanks and duplicates', () => {
    expect(compareValue('web-b\nweb-a\n\n', 'web-a\nweb-b', 'lines')).toBe(true);
    expect(compareValue('web-a', 'web-a\nweb-b', 'lines')).toBe(false);
  });

  it('number compares numerically and rejects empty input', () => {
    expect(compareValue('3.0', '3', 'number')).toBe(true);
    expect(compareValue('', '0', 'number')).toBe(false);
    expect(compareValue('three', '3', 'number')).toBe(false);
  });

  it('contains never passes on an empty expectation; regex is multiline', () => {
    expect(compareValue('anything', '   ', 'contains')).toBe(false);
    expect(compareValue('a\nport: 80\nb', '^port: 80$', 'regex')).toBe(true);
  });
});

describe('history and terminal text', () => {
  it('matches any command and skips timestamp lines', () => {
    const h = '#1764000000\nk get pods\nkubectl create deploy web --image=nginx --dry-run=client -o yaml\n';
    expect(historyMatches(h, '--dry-run=client|\\$do')).toBe(true);
    expect(historyMatches(h, '^#')).toBe(false);
  });

  it('strips colours and title sequences', () => {
    expect(stripAnsi('\x1b[1;36mstudent@cka\x1b[0m:\x1b]0;title\x07~$ ok')).toBe('student@cka:~$ ok');
  });
});

describe('exercise scripts', () => {
  const ex: RunnableExercise = {
    id: 'svc-x',
    title: 'x',
    namespaces: ['ex-a', 'ex-b'],
    setup: 'kubectl -n ex-a create deploy web --image=nginx',
    cleanup: 'kubectl delete clusterrole ex-reader --ignore-not-found',
    files: [{ path: 'broken.yaml', content: "it's\nfine" }],
    checks: [{ id: 'f', type: 'file', path: 'answers/pods.txt', match: 'lines', expect: 'a' }],
  };

  it('recreates owned namespaces before the setup, and clears other exercises', () => {
    const s = exerciseClusterScript(ex, ['ex-other', 'ex-a']);
    expect(s).toContain(`grep -Fx -e 'ex-other'`); // other exercises: removed without waiting
    expect(s).toMatch(/kubectl delete namespace \$others --ignore-not-found --wait=false/);
    expect(s).toMatch(/kubectl delete namespace \$own --ignore-not-found --wait=true/);
    expect(s.indexOf('kubectl delete namespace')).toBeLessThan(s.indexOf('kubectl create namespace'));
    expect(s.indexOf('kubectl create namespace')).toBeLessThan(s.indexOf('create deploy web'));
    expect(s).toContain('ex-reader');
  });

  it('writes starter files base64-encoded and removes stale answer files', () => {
    const s = exerciseHomeScript(ex);
    expect(s).toContain(`rm -rf '/home/student/svc-x'`);
    expect(s).toContain(`rm -f '/home/student/answers/pods.txt'`);
    expect(s).toContain(Buffer.from("it's\nfine").toString('base64'));
    expect(s).not.toContain("it's");
  });
});

describe('loaded exercise state', () => {
  it('is null without an exercise and goes stale when a load never finished', () => {
    expect(loadedExercise({})).toBeNull();
    const a = { [ANN.exercise]: 'e', [ANN.exerciseState]: 'Loading', [ANN.exerciseLoadedAt]: new Date(0).toISOString() };
    expect(loadedExercise(a, new Date(60_000))?.state).toBe('Loading');
    expect(loadedExercise(a, new Date(10 * 60_000))?.state).toBe('Failed');
  });
});

describe('toolbox mounts for grading', () => {
  const opts = { toolboxImage: 't', toolboxPullPolicy: 'Never', sessionClusterRole: 'r', quota: {}, networkPolicies: false, apiServerCidrs: [] } as unknown as ManifestOptions;
  const pod = toolboxPod({ namespace: 'n', userId: 'u', labId: null, createdAt: new Date(), expiresAt: new Date() }, opts) as unknown as {
    spec: { containers: { name: string; volumeMounts: { name: string; mountPath: string; readOnly?: boolean }[] }[] };
  };
  const mounts = (name: string) => pod.spec.containers.find(c => c.name === name)!.volumeMounts;

  it("lets the checker read the student's home, read-only", () => {
    expect(mounts('checker')).toContainEqual({ name: 'shell-home', mountPath: '/home/student', readOnly: true });
  });

  it('shares nothing writable between the two containers', () => {
    const writable = (name: string) => new Set(mounts(name).filter(m => !m.readOnly).map(m => m.name));
    const shell = writable('shell');
    expect([...writable('checker')].filter(n => shell.has(n))).toEqual([]);
  });
});

describe('content', () => {
  it('loads every course exercise', () => {
    const all = loadExercises(join(__dirname, '../../../content'));
    for (const e of all.values()) expect(e.checks.length).toBeGreaterThan(0);
  });
});
