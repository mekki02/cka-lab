# Deployment

Three ways to run CKA Lab, from simplest to most production-like. All of them were exercised while building the platform; the Kubernetes procedure below is exactly what was run against a kind v1.37 cluster with Traefik v3.8.

| Option | Use it for |
|---|---|
| Docker Compose | One machine, a few users, or evaluating the platform |
| Helm chart | Any Kubernetes cluster — the recommended path |
| Plain manifests | Clusters where Helm is not wanted (`deploy/k8s`) |
| Argo CD | GitOps on top of the Helm chart (`deploy/argocd`) |

---

## 1. Build and publish images

The images build from the repository root (the services need the shared packages):

```bash
REG=ghcr.io/your-org/cka-lab   # any OCI registry
TAG=0.1.0

docker build -f apps/ms-identity/Dockerfile -t $REG/ms-identity:$TAG .
docker build -f apps/ms-learning/Dockerfile -t $REG/ms-learning:$TAG .
docker build -f apps/web/Dockerfile         -t $REG/web:$TAG .
# Only for browser lab environments (labs.enabled):
docker build -f apps/ms-labs/Dockerfile     -t $REG/ms-labs:$TAG .
docker build -t $REG/toolbox:$TAG images/toolbox

docker push $REG/ms-identity:$TAG && docker push $REG/ms-learning:$TAG && docker push $REG/web:$TAG
docker push $REG/ms-labs:$TAG && docker push $REG/toolbox:$TAG
```

Or with Compose: `IMAGE_PREFIX=$REG IMAGE_TAG=$TAG docker compose build && IMAGE_PREFIX=$REG IMAGE_TAG=$TAG docker compose push ms-identity ms-learning web`.

Notes:

- Builds are **reproducible from the lockfile** (`npm ci`) and pin base images by tag (`node:24-alpine`, `nginxinc/nginx-unprivileged:1.29-alpine`). For strict reproducibility pin them by digest in the `ARG` lines.
- The `ms-learning` build **fails if course content is invalid** — the content check runs inside it.
- For a cluster on another CPU architecture: `docker buildx build --platform linux/amd64,linux/arm64 --push …`.
- Use immutable tags (a version or commit SHA), never `latest`, so a Pod restart cannot change what runs.

---

## 2. Docker Compose

```bash
npm run setup:env                      # .env: random secrets + signing key (or copy .env.example and fill it in)
# edit .env: PUBLIC_URL, EDGE_PORT, COOKIE_SECURE
docker compose up -d --build
docker compose exec ms-identity node apps/ms-identity/dist/cli.js create-admin --email you@example.com --name "You"
```

The `edge` nginx is the single entry point (`EDGE_PORT`, default 8080). Postgres data lives in the named volume `cka-lab_pgdata` and survives `docker compose down` (not `down -v`).

**HTTPS with Compose:** put any TLS-terminating reverse proxy in front of `edge` (Caddy, Traefik, a cloud load balancer), set `PUBLIC_URL=https://…` and `COOKIE_SECURE=true`. Never expose it on plain HTTP beyond localhost: session cookies are `Secure`-only by design.

---

## 3. Kubernetes with Helm

### Prerequisites

- Kubernetes ≥ 1.29 with a default StorageClass (for the bundled PostgreSQL) and a CNI that enforces NetworkPolicy (Calico, Cilium, kindnet ≥ kind 0.24…).
- An Ingress controller **or** a Gateway API implementation. The chart is controller-neutral; it was tested with Traefik. (The community ingress-nginx controller was retired in 2026 — prefer an actively maintained controller.)
- TLS certificates — typically cert-manager.
- The images pushed to a registry the cluster can pull from.

### Install

```bash
# Ingress controller (skip if the cluster has one)
helm repo add traefik https://traefik.github.io/charts
helm install traefik traefik/traefik -n traefik --create-namespace   # LoadBalancer on cloud clusters

# CKA Lab
cat > my-values.yaml <<'EOF'
publicUrl: https://cka.example.com
image:
  registry: ghcr.io/your-org/cka-lab
  tag: "0.1.0"
ingress:
  className: traefik
  host: cka.example.com
  tls:
    secretName: cka-lab-tls          # created by cert-manager or by hand
networkPolicy:
  ingressControllerNamespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: traefik
EOF

helm install cka-lab deploy/helm/cka-lab -n cka-lab --create-namespace -f my-values.yaml
kubectl -n cka-lab rollout status deploy/cka-lab-ms-identity
```

The chart's NOTES print the next step — creating the first administrator:

```bash
kubectl -n cka-lab exec deploy/cka-lab-ms-identity -- \
  node apps/ms-identity/dist/cli.js create-admin --email you@example.com --name "Your Name"
```

### HTTPS with cert-manager

```yaml
# my-values.yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod   # your ClusterIssuer
  tls:
    enabled: true
    secretName: cka-lab-tls                            # cert-manager creates it
```

Redirect plain HTTP to HTTPS at the controller (for Traefik see `deploy/helm/examples/traefik-values.yaml`). TLS terminates at the controller; traffic inside the cluster is plain HTTP between Pods, protected by NetworkPolicies.

### Gateway API instead of Ingress

```yaml
ingress:
  enabled: false
gateway:
  enabled: true
  parentRefs:
    - name: public            # an existing Gateway
      namespace: gateway-system
  hostnames: [cka.example.com]
networkPolicy:
  ingressControllerNamespaceSelector:
    matchLabels: { kubernetes.io/metadata.name: gateway-system }   # where the gateway's data plane runs
```

### Secrets

By default the chart **generates** the database passwords and the token-signing key on first install and keeps them on upgrade (via `lookup`) and on uninstall (`helm.sh/resource-policy: keep`). This was verified by uninstalling and reinstalling a release: the passwords and the database volume were reused.

Provide your own instead (required for Argo CD / `helm template`, recommended for production):

```bash
kubectl -n cka-lab create secret generic cka-lab-postgresql \
  --from-literal=postgres-password="$(openssl rand -base64 32)" \
  --from-literal=identity-password="$(openssl rand -base64 32)" \
  --from-literal=learning-password="$(openssl rand -base64 32)"
node scripts/generate-jwt-keys.mjs > jwt.pem
kubectl -n cka-lab create secret generic cka-lab-jwt --from-file=jwt-private-key.pem=jwt.pem && rm jwt.pem
```

and set `postgresql.existingSecret: cka-lab-postgresql`, `jwt.existingSecret: cka-lab-jwt`.

### External PostgreSQL

Disable the bundled database and point the services at yours (managed service, CloudNativePG…). Create the databases and roles once:

```sql
CREATE ROLE identity LOGIN PASSWORD '…';  CREATE DATABASE identity OWNER identity;
CREATE ROLE learning LOGIN PASSWORD '…';  CREATE DATABASE learning OWNER learning;
```

```yaml
postgresql:
  enabled: false
externalDatabase:
  host: db.internal.example.com
  port: 5432
  ssl: true
  identity: { database: identity, user: identity, existingSecret: cka-identity-db, passwordKey: password }
  learning: { database: learning, user: learning, existingSecret: cka-learning-db, passwordKey: password }
```

Also allow the services' egress to the database if you restrict egress.

### Local test on kind (what was used to validate the chart)

```bash
kind create cluster --name cka-platform --config deploy/kind/platform-cluster.yaml
docker compose build
docker build -f apps/ms-labs/Dockerfile -t cka-lab/ms-labs:dev . && docker build -t cka-lab/toolbox:dev images/toolbox
kind load docker-image cka-lab/ms-identity:dev cka-lab/ms-learning:dev cka-lab/web:dev \
  cka-lab/ms-labs:dev cka-lab/toolbox:dev --name cka-platform
helm install traefik traefik/traefik -n traefik --create-namespace -f deploy/helm/examples/traefik-values.yaml
kubectl create namespace cka-lab
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=cka.localhost" \
  -addext "subjectAltName=DNS:cka.localhost" -keyout tls.key -out tls.crt
kubectl -n cka-lab create secret tls cka-lab-tls --cert=tls.crt --key=tls.key
helm install cka-lab deploy/helm/cka-lab -n cka-lab -f deploy/helm/examples/values-kind.yaml
```

Then open <https://cka.localhost:9443> (accept the self-signed certificate).

Verified on that setup:

- all Pods Ready; TLS through Traefik; HTTP redirected to HTTPS;
- cookies `HttpOnly; Secure; SameSite=Lax` with the expected paths;
- health and JWKS endpoints not reachable through the Ingress;
- progress survives deleting the PostgreSQL Pod;
- NetworkPolicies block a Pod in another namespace from reaching PostgreSQL and the services;
- **0 failed requests out of 2,651** while all three Deployments were restarted (`kubectl rollout restart`).
- lab environments (`labs.enabled: true` in values-kind.yaml): a session is Ready in 26–45 s; both labs solved through the browser terminal with every automatic check and verify script passing; the admission policies refuse every out-of-scope request by ms-labs (see LAB_ARCHITECTURE).

### Lab environments: sizing

Each running session requests about 0.16 CPU and 0.4 GiB (virtual cluster 100m/256Mi, CoreDNS 20m/64Mi, toolbox 40m/96Mi; the virtual cluster may burst to 1.5 GiB), plus what the student runs, capped by `labs.quota`. Set `labs.maxSessions` to what your nodes can hold. Images pulled per node on first use: `ghcr.io/loft-sh/vcluster-pro:0.37.7`, `ghcr.io/loft-sh/kubernetes:v1.36.6`, `coredns/coredns:1.14.2` and the toolbox — pre-pull them for faster first starts.

---

## 4. Plain manifests and Argo CD

- `deploy/k8s/cka-lab.yaml` is rendered from the chart with `deploy/k8s/values-plain.yaml`; create the Secrets from `deploy/k8s/secret.example.yaml`, then `kubectl apply -f`.
- `deploy/argocd/application.yaml` is an Argo CD Application using the chart with existing Secrets.

---

## Operations

### Upgrades

```bash
helm upgrade cka-lab deploy/helm/cka-lab -n cka-lab -f my-values.yaml --set image.tag=0.2.0
```

Database migrations run automatically when the new Pods start, under a Postgres advisory lock (several replicas cannot run them concurrently). Migrations are written to be backwards compatible with the previous release during the rolling update; if a release ever needs a breaking schema change, it will say so in its notes.

To run migrations as a separate, explicit step instead, set `DATABASE_MIGRATIONS_RUN=false` via `identity.extraEnv` / `learning.extraEnv` and run `node apps/ms-*/dist/main.js` once with it set to `true` (e.g. a Job), or use the TypeORM CLI: `npm run migration:run -w @cka/ms-identity`.

### Backup

Everything worth keeping is in PostgreSQL (course content is in the images and in git).

```bash
# Kubernetes, bundled PostgreSQL
kubectl -n cka-lab exec cka-lab-postgresql-0 -- pg_dump -U postgres -Fc identity > identity-$(date +%F).dump
kubectl -n cka-lab exec cka-lab-postgresql-0 -- pg_dump -U postgres -Fc learning > learning-$(date +%F).dump

# Docker Compose
docker compose exec -T postgres pg_dump -U postgres -Fc identity > identity-$(date +%F).dump
docker compose exec -T postgres pg_dump -U postgres -Fc learning > learning-$(date +%F).dump
```

Schedule it (a CronJob writing to object storage, or a host cron job) and **test restores**. Back up the `cka-lab-jwt` Secret too — without it every user is signed out (no data loss, just a re-login).

### Restore

```bash
# stop writers first
kubectl -n cka-lab scale deploy cka-lab-ms-identity cka-lab-ms-learning --replicas=0
kubectl -n cka-lab exec -i cka-lab-postgresql-0 -- pg_restore -U postgres --clean --if-exists -d identity < identity-2026-11-24.dump
kubectl -n cka-lab exec -i cka-lab-postgresql-0 -- pg_restore -U postgres --clean --if-exists -d learning < learning-2026-11-24.dump
kubectl -n cka-lab scale deploy cka-lab-ms-identity cka-lab-ms-learning --replicas=2
```

This exact sequence was tested on the kind deployment: rows deleted after the dump were back after the restore, tables still owned by the service role, and the app served them. `pg_restore --clean` drops and recreates objects; ownership is preserved because the dumps were taken from the same roles. When restoring into a brand-new installation, install the chart first (so roles and databases exist), then restore.

### Rotating the signing key

Create a new key Secret, change `jwt.keyId` (for example `key-2`) and upgrade. Users with an access token signed by the old key get one 401, the app refreshes automatically with their (database-backed) refresh token, and continues — nobody has to log in again.

### Uninstall

```bash
helm uninstall cka-lab -n cka-lab
```

The generated Secrets and the PostgreSQL PersistentVolumeClaim are **kept** on purpose. Delete them explicitly if you really want the data gone: `kubectl -n cka-lab delete pvc,secret -l app.kubernetes.io/instance=cka-lab`, `kubectl delete namespace cka-lab`.
