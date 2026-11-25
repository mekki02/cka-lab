import type { KubernetesObject } from '@kubernetes/client-node';
import {
  ANN,
  CHECKER_CONTAINER,
  LABEL_SESSION,
  LABEL_USER,
  SHELL_CONTAINER,
  TOOLBOX_POD,
  VCLUSTER_KUBECONFIG_SECRET,
  userLabelValue,
} from './model';

/**
 * Everything a session namespace contains besides the virtual cluster, as
 * plain objects (applied with server-side apply). Pure functions: the unit
 * tests pin down the security-relevant parts.
 */

export interface SessionSpec {
  namespace: string;
  userId: string;
  labId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface ManifestOptions {
  toolboxImage: string;
  toolboxPullPolicy: string;
  /** "<namespace>:<name>" of the ms-labs ServiceAccount; empty in development. */
  controllerServiceAccount?: string;
  sessionClusterRole: string;
  quota: { requestsCpu: string; requestsMemory: string; limitsMemory: string; pods: number };
  networkPolicies: boolean;
  apiServerCidrs: string[];
}

const MANAGED_BY = { 'app.kubernetes.io/managed-by': 'cka-lab-ms-labs' };

export const namespaceManifest = (s: SessionSpec): KubernetesObject & { metadata: { name: string } } => ({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: {
    name: s.namespace,
    labels: {
      ...MANAGED_BY,
      [LABEL_SESSION]: 'true',
      [LABEL_USER]: userLabelValue(s.userId),
      // Student workloads run here (synced from the virtual cluster). baseline
      // blocks privileged Pods, hostPath, host namespaces — the ways out of a
      // container onto the node.
      'pod-security.kubernetes.io/enforce': 'baseline',
      'pod-security.kubernetes.io/warn': 'baseline',
    },
    annotations: {
      [ANN.lab]: s.labId ?? '',
      [ANN.phase]: 'Provisioning',
      [ANN.message]: 'Creating your cluster',
      [ANN.createdAt]: s.createdAt.toISOString(),
      [ANN.expiresAt]: s.expiresAt.toISOString(),
      [ANN.activeAt]: s.createdAt.toISOString(),
      [ANN.results]: '{}',
    },
  },
});

export const sessionObjects = (s: SessionSpec, o: ManifestOptions): KubernetesObject[] => {
  const ns = s.namespace;
  const objects: KubernetesObject[] = [];

  if (o.controllerServiceAccount) {
    const [saNamespace, saName] = o.controllerServiceAccount.split(':');
    // ms-labs' rights inside this namespace. It has no such rights in any
    // other namespace: this RoleBinding is how it gets them, one session at a time.
    objects.push({
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: { name: 'cka-labs-controller', namespace: ns, labels: MANAGED_BY },
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: o.sessionClusterRole },
      subjects: [{ kind: 'ServiceAccount', name: saName, namespace: saNamespace }],
    } as KubernetesObject);
  }

  objects.push(
    {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: { name: 'session', namespace: ns, labels: MANAGED_BY },
      spec: {
        hard: {
          'requests.cpu': o.quota.requestsCpu,
          'requests.memory': o.quota.requestsMemory,
          'limits.memory': o.quota.limitsMemory,
          pods: String(o.quota.pods),
          services: '40',
          'services.loadbalancers': '0',
          persistentvolumeclaims: '10',
          'requests.storage': '10Gi',
        },
      },
    } as KubernetesObject,
    {
      apiVersion: 'v1',
      kind: 'LimitRange',
      metadata: { name: 'session-defaults', namespace: ns, labels: MANAGED_BY },
      spec: {
        limits: [
          {
            type: 'Container',
            defaultRequest: { cpu: '20m', memory: '32Mi' },
            // `_default`, not `default`: client-node serializes through its
            // V1LimitRangeItem model, which names this field `_default` and
            // silently drops an unknown `default` key — Kubernetes then
            // falls back to `max` as the default limit.
            _default: { memory: '256Mi' },
            max: { memory: '2Gi' },
          },
        ],
      },
    } as KubernetesObject,
  );

  if (o.networkPolicies) {
    const api = o.apiServerCidrs.map(cidr => ({ ipBlock: { cidr } }));
    objects.push({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: 'session-isolation', namespace: ns, labels: MANAGED_BY },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress'],
        // Only Pods of this session talk to Pods of this session.
        ingress: [{ from: [{ podSelector: {} }] }],
        egress: [
          { to: [{ podSelector: {} }] },
          {
            to: [
              {
                namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } },
                podSelector: { matchLabels: { 'k8s-app': 'kube-dns' } },
              },
            ],
            ports: [
              { protocol: 'UDP', port: 53 },
              { protocol: 'TCP', port: 53 },
            ],
          },
          // The vcluster syncer reconciles with the host API server.
          ...(api.length ? [{ to: api, ports: [{ protocol: 'TCP', port: 443 }, { protocol: 'TCP', port: 6443 }] }] : []),
          // The internet (curl, package mirrors), but nothing private: not
          // other sessions, not the platform, not cloud metadata endpoints.
          {
            to: [
              {
                ipBlock: {
                  cidr: '0.0.0.0/0',
                  except: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '169.254.0.0/16'],
                },
              },
            ],
          },
        ],
      },
    } as KubernetesObject);
  }

  return objects;
};

export const toolboxPod = (s: SessionSpec, o: ManifestOptions): KubernetesObject => {
  const container = (name: string, mem: string) => ({
    name,
    image: o.toolboxImage,
    imagePullPolicy: o.toolboxPullPolicy,
    command: ['sleep', 'infinity'],
    resources: { requests: { cpu: '20m', memory: '48Mi' }, limits: { memory: mem } },
    securityContext: {
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: { drop: ['ALL'] },
    },
    volumeMounts: [
      { name: `${name}-home`, mountPath: '/home/student' },
      { name: 'tmp', mountPath: '/tmp' },
      { name: 'kubeconfig', mountPath: '/etc/cka/kube', readOnly: true },
    ],
  });
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: TOOLBOX_POD, namespace: s.namespace, labels: { ...MANAGED_BY, 'app.kubernetes.io/name': 'toolbox' } },
    spec: {
      automountServiceAccountToken: false, // the host cluster API is not for students
      enableServiceLinks: false,
      terminationGracePeriodSeconds: 1,
      securityContext: {
        runAsNonRoot: true,
        runAsUser: 1000,
        runAsGroup: 1000,
        fsGroup: 1000,
        seccompProfile: { type: 'RuntimeDefault' },
      },
      // Two containers, two filesystems: what the student does in `shell`
      // cannot change the binaries or files `checker` uses to grade them.
      containers: [container(SHELL_CONTAINER, '512Mi'), container(CHECKER_CONTAINER, '256Mi')],
      volumes: [
        { name: `${SHELL_CONTAINER}-home`, emptyDir: { sizeLimit: '512Mi' } },
        { name: `${CHECKER_CONTAINER}-home`, emptyDir: { sizeLimit: '128Mi' } },
        { name: 'tmp', emptyDir: { sizeLimit: '256Mi' } },
        {
          name: 'kubeconfig',
          secret: { secretName: VCLUSTER_KUBECONFIG_SECRET, items: [{ key: 'config', path: 'config' }], defaultMode: 0o440 },
        },
      ],
    },
  } as KubernetesObject;
};

/** Helm values for the session's virtual cluster (loft-sh/vcluster chart). */
export const vclusterValues = (namespace: string): Record<string, unknown> => ({
  controlPlane: {
    distro: { k8s: { enabled: true } },
    statefulSet: {
      // Disposable by design: no PVC (fast start, nothing to clean up).
      persistence: { volumeClaim: { enabled: false } },
      resources: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { memory: '1536Mi' },
      },
    },
    coredns: { enabled: true },
  },
  // Namespace-scoped only: the chart would otherwise create a ClusterRole,
  // and ms-labs is not allowed to create cluster-wide RBAC.
  rbac: { clusterRole: { enabled: false }, enableVolumeSnapshotRules: { enabled: false } },
  exportKubeConfig: {
    // The API server certificate is valid for `vc.<namespace>`, not `.svc`.
    server: `https://vc.${namespace}:443`,
    context: 'cka',
  },
});
