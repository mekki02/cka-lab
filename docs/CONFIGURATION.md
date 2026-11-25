# Configuration reference

Every setting is an environment variable, validated when the process starts. A missing or invalid value stops the service with a message naming the variable — in Kubernetes that shows up as `CrashLoopBackOff` with the reason in `kubectl logs`.

Variables ending in `_FILE` read the value from a file instead, so Kubernetes can mount Secrets as volumes rather than env vars.

## ms-identity

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` enforces a configured signing key |
| `PORT` | `3001` | HTTP port |
| `LOG_LEVEL` | `info` | `fatal` `error` `warn` `info` `debug` `trace` |
| `DATABASE_HOST` / `DATABASE_PORT` | `localhost` / `5432` | PostgreSQL |
| `DATABASE_USER` / `DATABASE_NAME` | `identity` / `identity` | |
| `DATABASE_PASSWORD` or `DATABASE_PASSWORD_FILE` | — (required) | |
| `DATABASE_SSL` | `false` | TLS to PostgreSQL with certificate verification |
| `DATABASE_MIGRATIONS_RUN` | `true` | Run pending migrations at start-up (advisory-locked) |
| `PUBLIC_URL` | `http://localhost:8080` | Browser-facing URL, used in invitation/reset links. No trailing slash |
| `COOKIE_SECURE` | `true` | `Secure` cookie flag. Only `false` for plain-HTTP localhost |
| `TRUST_PROXY_HOPS` | `1` | Number of proxies in front (for the real client IP in rate limiting and logs) |
| `SWAGGER_ENABLED` | `false` | Serve API docs at `/api/identity/docs` |
| `JWT_PRIVATE_KEY` or `JWT_PRIVATE_KEY_FILE` | — (required in production) | Ed25519 PKCS#8 PEM. In development a random key is generated per start |
| `JWT_KEY_ID` | `dev` | `kid` published in the JWKS; change when rotating |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime (60–3600). Also the maximum delay for deactivation/role changes to apply |
| `REFRESH_TOKEN_TTL_DAYS` | `14` | Session lifetime; extended on every refresh (sliding) |
| `INVITE_TTL_HOURS` | `72` | Invitation link validity |
| `RESET_TTL_HOURS` | `2` | Password-reset link validity |
| `AUTH_RATE_LIMIT_PER_MINUTE` | `10` | Per-IP limit on login, invitation, reset and password-change endpoints |

## ms-learning

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV`, `PORT` (`3002`), `LOG_LEVEL` | | as above |
| `DATABASE_*` | `learning` user/db | as above |
| `TRUST_PROXY_HOPS`, `SWAGGER_ENABLED` | | as above |
| `JWKS_URL` | `http://localhost:3001/.well-known/jwks.json` | ms-identity's public keys (cluster-internal URL) |
| `CONTENT_DIR` | `<cwd>/content` (`/app/content` in the image) | Course content directory |

## web (container)

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `CKA Lab` | Product name shown in the UI (written to `/config.js` at start) |
| `LABS_ENABLED` | `false` (`true` in `npm run dev`) | Show browser lab environments (terminal, Playground). Set by Helm from `labs.enabled` |

## ms-labs

Only needed for browser lab environments; see [LAB_ARCHITECTURE](LAB_ARCHITECTURE.md). The Helm chart sets all of these from `labs.*`.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV`, `PORT` (`3003`), `LOG_LEVEL`, `TRUST_PROXY_HOPS`, `SWAGGER_ENABLED` | | as above |
| `JWKS_URL` | `http://localhost:3001/.well-known/jwks.json` | ms-identity's public keys |
| `PUBLIC_URL` | `http://localhost:5173` | Allowed `Origin`(s) of the terminal WebSocket, comma-separated |
| `CONTENT_DIR` | `<cwd>/content` | Lab content (`labs/*.yaml`) |
| `LABS_KUBE_CONTEXT` | empty = in-cluster ServiceAccount | kubeconfig context to use instead (development) |
| `LABS_CONTROLLER_SERVICE_ACCOUNT` | empty | `<namespace>:<name>` of ms-labs; bound in each session namespace. Empty when the kubeconfig user is already admin (development) |
| `LABS_SESSION_CLUSTERROLE` | `cka-labs-session-owner` | ClusterRole bound inside session namespaces |
| `LABS_NAMESPACE_PREFIX` | `lab-` | Must match the admission policy |
| `LABS_TOOLBOX_IMAGE`, `LABS_TOOLBOX_PULL_POLICY` | `cka-lab/toolbox:dev`, `IfNotPresent` | Terminal image |
| `LABS_VCLUSTER_CHART`, `LABS_VCLUSTER_CHART_REPO`, `LABS_VCLUSTER_CHART_VERSION` | `vcluster`, `https://charts.loft.sh`, `0.37.7` | The image ships the chart as a `.tgz` (no download at run time) |
| `LABS_KUBERNETES_VERSION` | `1.36` | Shown to students; must match the chart's Kubernetes |
| `LABS_HELM_BIN` | `helm` | |
| `LABS_MAX_SESSIONS` | `10` | Running sessions, all students |
| `LABS_IDLE_MINUTES`, `LABS_MAX_MINUTES`, `LABS_PROVISION_TIMEOUT_MINUTES` | `60`, `240`, `10` | Expiry |
| `LABS_QUOTA_REQUESTS_CPU`, `_REQUESTS_MEMORY`, `_LIMITS_MEMORY`, `_PODS` | `2`, `3Gi`, `6Gi`, `50` | Per-session ResourceQuota |
| `LABS_NETWORK_POLICIES` | `true` | Per-session isolation policy |
| `LABS_APISERVER_CIDRS` | detected | API server CIDRs sessions may reach (the vcluster syncer needs it) |

## Docker Compose (`.env`)

| Variable | Description |
|---|---|
| `EDGE_PORT` | Host port of the edge proxy (default 8080) |
| `PUBLIC_URL`, `COOKIE_SECURE` | Passed to ms-identity |
| `POSTGRES_PASSWORD` | Superuser password of the bundled Postgres (only used to create the service databases) |
| `IDENTITY_DB_PASSWORD`, `LEARNING_DB_PASSWORD` | Per-service database logins, created on first start of an empty volume |
| `POSTGRES_PORT` | Host port for psql (bound to 127.0.0.1) |
| `JWT_PRIVATE_KEY`, `JWT_KEY_ID` | Signing key (`npm run setup:env` generates one) |
| `LOG_LEVEL`, `APP_NAME` | |
| `IMAGE_PREFIX`, `IMAGE_TAG` | Image names used by `docker compose build/push` |

> Changing a DB password in `.env` after the first start does **not** change it in an existing database volume. Change it in Postgres (`ALTER ROLE identity PASSWORD '…'`) too.

## Helm values

See `deploy/helm/cka-lab/values.yaml` (every value is commented). The most important:

| Value | Default | Description |
|---|---|---|
| `publicUrl` | `https://cka.example.com` | Must match the host people use |
| `appName` | `CKA Lab` | |
| `image.registry`, `image.tag`, `image.pullPolicy` | | Images are `<registry>/{ms-identity,ms-learning,web,ms-labs,toolbox}:<tag>` (tag defaults to appVersion) |
| `imagePullSecrets` | `[]` | For private registries |
| `cookieSecure`, `trustProxyHops`, `logLevel` | `true`, `1`, `info` | |
| `jwt.existingSecret`, `jwt.keyId` | generated, `key-1` | Secret with key `jwt-private-key.pem` |
| `identity` / `learning` / `web` `.replicas`, `.resources`, `.extraEnv` | 2 replicas each | `extraEnv` sets any variable from the tables above |
| `postgresql.enabled` | `true` | Bundled StatefulSet |
| `postgresql.existingSecret` | generated | Keys `postgres-password`, `identity-password`, `learning-password` |
| `postgresql.persistence.size` / `.storageClass` | `5Gi` / default class | |
| `externalDatabase.*` | | Used when `postgresql.enabled=false` (see DEPLOYMENT) |
| `ingress.enabled`, `.className`, `.host`, `.annotations`, `.tls.*` | enabled, TLS on | |
| `gateway.enabled`, `.parentRefs`, `.hostnames` | disabled | HTTPRoute alternative |
| `networkPolicy.enabled`, `.ingressControllerNamespaceSelector` | enabled, ns `traefik` | Must select the namespace your controller runs in |
| `podDisruptionBudget.enabled` | `true` | For components with more than one replica |
| `podSecurityContext`, `nodeSelector`, `tolerations`, `affinity` | hardened defaults | Applied to app Pods |
| `labs.enabled` | `false` | Browser lab environments (needs the `ms-labs` and `toolbox` images) |
| `labs.maxSessions`, `.idleMinutes`, `.maxMinutes` | `10`, `60`, `240` | |
| `labs.quota.*`, `labs.networkPolicies`, `labs.apiServerCidrs` | see `values.yaml` | Per-session limits and isolation |
| `labs.replicas`, `.resources`, `.extraEnv`, `.namespacePrefix` | `1`, …, `lab-` | Keep one replica (see LAB_ARCHITECTURE) |
