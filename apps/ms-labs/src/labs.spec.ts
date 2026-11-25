import type { V1Namespace } from '@kubernetes/client-node';
import { join } from 'node:path';
import { evaluateCheck, parseVerifyOutput } from './checks/evaluate';
import { loadLabs } from './content/labs';
import { namespaceManifest, sessionObjects, toolboxPod, vclusterValues, type ManifestOptions } from './sessions/manifests';
import { ANN, namespaceToSession, sessionNamespaceName, shortMessage, sweepVerdict, userLabelValue } from './sessions/model';
import { originAllowed, parseClientMessage } from './terminal/protocol';

const ok = (stdout: string, exitCode = 0) => ({ stdout, stderr: '', exitCode });

describe('evaluateCheck', () => {
  it('exact compares trimmed output', () => {
    expect(evaluateCheck('exact', '80->8080', ok('80->8080\n'))).toBe(true);
    expect(evaluateCheck('exact', '80->8080', ok('80->80800'))).toBe(false);
  });
  it('contains and regex', () => {
    expect(evaluateCheck('contains', 'Running', ok('pod/x Running'))).toBe(true);
    expect(evaluateCheck('regex', '^Address: 10\\.', ok('Server: x\nAddress: 10.244.1.2'))).toBe(true);
  });
  it('a failing command never passes an output match', () => {
    expect(evaluateCheck('contains', 'NotFound', { stdout: '', stderr: 'NotFound', exitCode: 1 })).toBe(false);
  });
  it('success looks only at the exit code; timeouts fail', () => {
    expect(evaluateCheck('success', 'anything', ok('', 0))).toBe(true);
    expect(evaluateCheck('success', 'anything', { ...ok('', 0), timedOut: true })).toBe(false);
  });
});

describe('parseVerifyOutput', () => {
  it('reads PASS/FAIL lines', () => {
    const r = parseVerifyOutput(ok('PASS  a\nFAIL  b\n----\n1 passed, 1 failed', 1));
    expect(r.passed).toBe(false);
    expect(r.lines).toEqual([
      { passed: true, text: 'a' },
      { passed: false, text: 'b' },
    ]);
  });
  it('passes only when every line passed and the script exited 0', () => {
    expect(parseVerifyOutput(ok('PASS  a\n')).passed).toBe(true);
    expect(parseVerifyOutput(ok('PASS  a\n', 1)).passed).toBe(false);
  });
});

describe('session model', () => {
  it('namespace names are DNS-safe, user-specific and unique', () => {
    const a = sessionNamespaceName('lab-', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'abc123');
    expect(a).toMatch(/^lab-[0-9a-f]{10}-abc123$/);
    expect(a.length).toBeLessThanOrEqual(63);
    expect(sessionNamespaceName('lab-', 'u1')).not.toBe(sessionNamespaceName('lab-', 'u1'));
  });
  it('uuids are valid label values; other ids are hashed', () => {
    expect(userLabelValue('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(userLabelValue('a b')).toMatch(/^[0-9a-f]{63}$/);
  });
  it('maps a namespace to a session', () => {
    const created = new Date('2026-01-01T10:00:00Z');
    const ns: V1Namespace = {
      metadata: {
        name: 'lab-x',
        creationTimestamp: created,
        annotations: { [ANN.lab]: 'services-expose-app', [ANN.phase]: 'Ready', [ANN.activeAt]: '2026-01-01T10:30:00Z', [ANN.results]: 'not json' },
      },
    };
    const s = namespaceToSession(ns, { idleMinutes: 60 }, '1.36');
    expect(s).toMatchObject({ id: 'lab-x', labId: 'services-expose-app', phase: 'Ready', results: {} });
    expect(s.idleExpiresAt).toBe('2026-01-01T11:30:00.000Z');
  });
  it('sweeps expired, idle and stuck sessions only', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const mk = (created: string, a: Record<string, string>): V1Namespace => ({
      metadata: { name: 'n', creationTimestamp: new Date(created), annotations: a },
    });
    const opts = { idleMinutes: 60, provisionTimeoutMinutes: 10 };
    const ready = { [ANN.phase]: 'Ready', [ANN.expiresAt]: '2026-01-01T14:00:00Z' };
    expect(sweepVerdict(mk('2026-01-01T11:50:00Z', { ...ready, [ANN.activeAt]: '2026-01-01T11:55:00Z' }), now, opts)).toBe('keep');
    expect(sweepVerdict(mk('2026-01-01T08:00:00Z', { ...ready, [ANN.expiresAt]: '2026-01-01T11:59:00Z' }), now, opts)).toBe('expired');
    expect(sweepVerdict(mk('2026-01-01T10:00:00Z', { ...ready, [ANN.activeAt]: '2026-01-01T10:30:00Z' }), now, opts)).toBe('idle');
    expect(
      sweepVerdict(mk('2026-01-01T11:40:00Z', { [ANN.phase]: 'Provisioning', [ANN.expiresAt]: '2026-01-01T14:00:00Z', [ANN.activeAt]: '2026-01-01T11:40:00Z' }), now, opts),
    ).toBe('stuck');
  });
  it('shortMessage strips colour codes and keeps the end', () => {
    expect(shortMessage('\x1b[31mError\x1b[0m: boom')).toBe('Error: boom');
    expect(shortMessage('x'.repeat(10) + 'END', 5)).toBe('…xxEND');
  });
});

describe('manifests', () => {
  const spec = { namespace: 'lab-abc-123456', userId: 'u-1', labId: null, createdAt: new Date(0), expiresAt: new Date(1) };
  const opts: ManifestOptions = {
    toolboxImage: 'toolbox:1',
    toolboxPullPolicy: 'IfNotPresent',
    controllerServiceAccount: 'cka-lab:ms-labs',
    sessionClusterRole: 'cka-labs-session-owner',
    quota: { requestsCpu: '2', requestsMemory: '3Gi', limitsMemory: '6Gi', pods: 50 },
    networkPolicies: true,
    apiServerCidrs: ['172.19.0.7/32'],
  };

  it('labels the namespace as a session and enforces Pod Security baseline', () => {
    const labels = namespaceManifest(spec).metadata.labels as Record<string, string>;
    expect(labels['cka-lab/session']).toBe('true');
    expect(labels['pod-security.kubernetes.io/enforce']).toBe('baseline');
  });

  it('binds the controller only inside the session namespace', () => {
    const rb = sessionObjects(spec, opts).find(o => o.kind === 'RoleBinding') as unknown as {
      metadata: { namespace: string };
      roleRef: { kind: string; name: string };
      subjects: { name: string; namespace: string }[];
    };
    expect(rb.metadata.namespace).toBe(spec.namespace);
    expect(rb.roleRef).toMatchObject({ kind: 'ClusterRole', name: 'cka-labs-session-owner' });
    expect(rb.subjects[0]).toMatchObject({ name: 'ms-labs', namespace: 'cka-lab' });
    expect(sessionObjects(spec, { ...opts, controllerServiceAccount: undefined }).some(o => o.kind === 'RoleBinding')).toBe(false);
  });

  it('isolates the network: same-namespace ingress, no private egress except DNS and the API server', () => {
    const np = sessionObjects(spec, opts).find(o => o.kind === 'NetworkPolicy') as unknown as {
      spec: { ingress: unknown[]; egress: { to: { ipBlock?: { cidr: string; except?: string[] } }[] }[] };
    };
    expect(np.spec.ingress).toEqual([{ from: [{ podSelector: {} }] }]);
    const blocks = np.spec.egress.flatMap(e => e.to).flatMap(t => (t.ipBlock ? [t.ipBlock] : []));
    expect(blocks).toContainEqual({ cidr: '172.19.0.7/32' });
    expect(blocks.find(b => b.cidr === '0.0.0.0/0')?.except).toEqual(
      expect.arrayContaining(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16']),
    );
  });

  it('runs the toolbox unprivileged, without host-cluster credentials', () => {
    const pod = toolboxPod(spec, opts) as unknown as {
      spec: {
        automountServiceAccountToken: boolean;
        securityContext: { runAsNonRoot: boolean };
        containers: { name: string; securityContext: { allowPrivilegeEscalation: boolean; readOnlyRootFilesystem: boolean } }[];
      };
    };
    expect(pod.spec.automountServiceAccountToken).toBe(false);
    expect(pod.spec.securityContext.runAsNonRoot).toBe(true);
    expect(pod.spec.containers.map(c => c.name)).toEqual(['shell', 'checker']);
    for (const c of pod.spec.containers) expect(c.securityContext).toMatchObject({ allowPrivilegeEscalation: false, readOnlyRootFilesystem: true });
  });

  it('the virtual cluster creates no cluster-scoped RBAC', () => {
    const v = vclusterValues('lab-x') as { rbac: { clusterRole: { enabled: boolean } }; exportKubeConfig: { server: string } };
    expect(v.rbac.clusterRole.enabled).toBe(false);
    expect(v.exportKubeConfig.server).toBe('https://vc.lab-x:443');
  });
});

describe('terminal protocol', () => {
  it('accepts input and clamps resize', () => {
    expect(parseClientMessage('{"type":"input","data":"ls\\r"}')).toEqual({ type: 'input', data: 'ls\r' });
    expect(parseClientMessage('{"type":"resize","cols":9999,"rows":1}')).toEqual({ type: 'resize', cols: 500, rows: 3 });
  });
  it('drops anything else', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('{"type":"exec","cmd":"rm -rf /"}')).toBeNull();
    expect(parseClientMessage('{"type":"resize","cols":"80","rows":24}')).toBeNull();
  });
  it('checks Origin against the public URL(s)', () => {
    expect(originAllowed('https://cka.example.com', 'https://cka.example.com')).toBe(true);
    expect(originAllowed('https://evil.example', 'https://cka.example.com')).toBe(false);
    expect(originAllowed(undefined, 'https://cka.example.com')).toBe(false);
    expect(originAllowed('http://localhost:5173', 'https://cka.example.com, http://localhost:5173')).toBe(true);
  });
});

describe('content', () => {
  it('loads every course lab', () => {
    const labs = loadLabs(join(__dirname, '../../../content'));
    expect(labs.size).toBeGreaterThan(0);
    for (const lab of labs.values()) expect(lab.tasks.length).toBeGreaterThan(0);
  });
});

describe('client-node model quirks', () => {
  // client-node serializes typed objects through its models, where the
  // LimitRange `default` field is called `_default`; a plain `default` key is
  // silently dropped (found on a live cluster: every Pod got the 2Gi `max`).
  it('the LimitRange default limit uses the model field name', () => {
    const spec = { namespace: 'n', userId: 'u', labId: null, createdAt: new Date(0), expiresAt: new Date(1) };
    const lr = sessionObjects(spec, {
      toolboxImage: 'x', toolboxPullPolicy: 'IfNotPresent', sessionClusterRole: 'r',
      quota: { requestsCpu: '1', requestsMemory: '1Gi', limitsMemory: '1Gi', pods: 1 }, networkPolicies: false, apiServerCidrs: [],
    }).find(o => o.kind === 'LimitRange')!;
    const item = (lr as unknown as { spec: { limits: Record<string, unknown>[] } }).spec.limits[0]!;
    expect(item._default).toEqual({ memory: '256Mi' });
    expect(item.default).toBeUndefined();
  });
});
