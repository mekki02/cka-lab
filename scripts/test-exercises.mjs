#!/usr/bin/env node
/**
 * End-to-end test of exercise content on a real deployment with lab
 * environments (labs.enabled). For each exercise:
 *
 *   1. load it into a playground through the ms-labs API, as the browser does;
 *   2. validate with no work done — it must FAIL (an exercise that starts
 *      solved teaches nothing);
 *   3. run its `autotest.solve` in the student's shell container (and add the
 *      commands to the shell history, as typing them would);
 *   4. validate with `autotest.answers` and the solve output as terminal
 *      text — every test case must PASS.
 *
 * Usage:
 *   CKA_URL=https://cka.localhost:9443 CKA_EMAIL=… CKA_PASSWORD=… \
 *   KUBE_CONTEXT=kind-cka-platform node scripts/test-exercises.mjs [exercise-id …]
 *
 * Needs kubectl access to the lab cluster (to exec into the toolbox Pod) —
 * this is an operator tool, not something students can run.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const BASE = (process.env.CKA_URL ?? 'https://cka.localhost:9443').replace(/\/$/, '');
const EMAIL = process.env.CKA_EMAIL;
const PASSWORD = process.env.CKA_PASSWORD;
const CONTEXT = process.env.KUBE_CONTEXT ?? '';
const LABS_PREFIX = process.env.LABS_NAMESPACE_PREFIX ?? 'lab-';
if (!EMAIL || !PASSWORD) {
  console.error('Set CKA_EMAIL and CKA_PASSWORD (a user of the deployment).');
  process.exit(2);
}
// The local kind deployment uses a self-signed certificate.
if (/localhost/.test(BASE)) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const contentDir = join(import.meta.dirname, '..', 'content', 'exercises');
const only = new Set(process.argv.slice(2));
const exercises = readdirSync(contentDir)
  .filter(f => f.endsWith('.yaml'))
  .map(f => parse(readFileSync(join(contentDir, f), 'utf8')))
  .filter(e => only.size === 0 || only.has(e.id));

// --- HTTP with cookies + CSRF -----------------------------------------------
const jar = new Map();
const request = async (method, path, body) => {
  const headers = { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
  if (jar.has('cka_csrf')) headers['x-csrf-token'] = decodeURIComponent(jar.get('cka_csrf'));
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.message ?? text}`);
  return data;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const kubectl = (args, input) =>
  execFileSync('kubectl', [...(CONTEXT ? ['--context', CONTEXT] : []), ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 8 << 20,
  });
const inShell = (ns, script) => {
  try {
    return { ok: true, out: kubectl(['-n', ns, 'exec', '-i', 'toolbox', '-c', 'shell', '--', 'bash', '-s'], script) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};
const shq = s => `'${s.replace(/'/g, `'\\''`)}'`;

const waitFor = async (what, seconds, probe) => {
  const end = Date.now() + seconds * 1000;
  for (;;) {
    const v = await probe();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(2000);
  }
};

// --- Run ----------------------------------------------------------------------
await request('POST', '/identity/auth/login', { email: EMAIL, password: PASSWORD });
let session = (await request('GET', '/labs/session')).session;
if (!session || session.labId !== null || session.phase === 'Failed') {
  if (session) await request('DELETE', '/labs/session');
  session = await request('POST', '/labs/session', {});
}
session = await waitFor('the playground', 300, async () => {
  const s = (await request('GET', '/labs/session')).session;
  if (s?.phase === 'Failed') throw new Error(`playground failed: ${s.message}`);
  return s?.phase === 'Ready' ? s : null;
});
const ns = session.id;
if (!ns.startsWith(LABS_PREFIX)) throw new Error(`unexpected session namespace ${ns}`);
console.log(`Playground ${ns} ready. Testing ${exercises.length} exercise(s).\n`);

const failures = [];
for (const e of exercises) {
  const t0 = Date.now();
  const problems = [];
  try {
    if (!e.autotest) throw new Error('no autotest section');
    await request('POST', '/labs/session/exercise', { exerciseId: e.id });
    await waitFor('the exercise', 300, async () => {
      const s = (await request('GET', '/labs/session')).session;
      if (s?.exercise?.id === e.id && s.exercise.state === 'Failed') throw new Error(`load failed: ${s.exercise.message}`);
      return s?.exercise?.id === e.id && s.exercise.state === 'Ready';
    });
    const loadSec = Math.round((Date.now() - t0) / 1000);

    const before = await request('POST', '/labs/session/exercise/validate', { exerciseId: e.id, answers: {}, terminal: '' });
    if (before.passed) problems.push('passes before any work was done');

    // Type the solution: run it and append it to the history, as an interactive shell would.
    const solve = e.autotest.solve.trim();
    const run = inShell(ns, `cd ~\n${solve}`);
    if (!run.ok) problems.push(`autotest.solve failed:\n${run.out.trim().split('\n').slice(-8).join('\n')}`);
    inShell(ns, `cat >> ~/.bash_history <<'__HISTORY__'\n${solve}\n__HISTORY__`);

    const answers = {};
    for (const [k, v] of Object.entries(e.autotest.answers ?? {})) {
      answers[k] = inShell(ns, `printf %s ${v.includes('$(') ? `"${v.replace(/^"|"$/g, '')}"` : shq(v)}`).out.trim();
    }
    const after = await request('POST', '/labs/session/exercise/validate', { exerciseId: e.id, answers, terminal: run.out });
    for (const r of after.results.filter(r => !r.passed)) problems.push(`check "${r.checkId}" fails after solving: ${r.output}`);
    const secs = Math.round((Date.now() - t0) / 1000);
    console.log(
      `${problems.length ? 'FAIL' : 'PASS'}  ${e.id}  (load ${loadSec}s, total ${secs}s; before: ${before.results.filter(r => r.passed).length}/${before.results.length} passing)`,
    );
  } catch (err) {
    problems.push(err.message);
    console.log(`FAIL  ${e.id}`);
  }
  for (const p of problems) console.log(`      - ${p.replace(/\n/g, '\n        ')}`);
  if (problems.length) failures.push(e.id);
}

console.log(`\n${exercises.length - failures.length}/${exercises.length} exercises pass.`);
process.exit(failures.length ? 1 : 0);
