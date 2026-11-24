# Plain Kubernetes manifests

For clusters where you prefer `kubectl apply` over Helm. `cka-lab.yaml` is **generated** from the Helm chart — the chart is the source of truth.

```bash
kubectl create namespace cka-lab
# 1. Secrets (see secret.example.yaml for the commands)
# 2. Adjust image, host and TLS secret in values-plain.yaml, regenerate:
helm template cka-lab ../helm/cka-lab -n cka-lab -f values-plain.yaml > cka-lab.yaml
# 3. Apply
kubectl -n cka-lab apply -f cka-lab.yaml
```

Contents: ConfigMap (Postgres init), Services, Deployments (web, ms-identity, ms-learning), StatefulSet with a PersistentVolumeClaim template (PostgreSQL), Ingress, NetworkPolicies, PodDisruptionBudgets.
