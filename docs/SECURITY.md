# Security

CKA Lab is reachable from the internet but meant for a handful of invited people. This document states what we protect, against whom, how, and the limits we accept.

## Threat model

| Asset | Threat | Main controls |
|---|---|---|
| Accounts | Password guessing, credential stuffing | No self-registration; argon2id; per-IP rate limit on auth endpoints; generic error messages; constant-time-ish login |
| Sessions | Theft via XSS, network sniffing, replay | HttpOnly + Secure + SameSite=Lax cookies; short-lived access tokens; rotating refresh tokens with reuse detection; strict CSP |
| State-changing requests | Cross-site request forgery | SameSite=Lax + double-submit CSRF token required on every non-GET request |
| Admin functions | Privilege escalation | Role checked server-side on every request (`@Roles('ADMIN')`); self-demotion and last-admin removal blocked |
| Quiz/exam integrity | Reading answers from the browser | Answer keys and solutions stay on the server until submission |
| User data | Database compromise of one service | Database per service with separate logins; password, refresh and link tokens stored as hashes |
| The cluster | A compromised app container | Non-root, read-only rootfs, no capabilities, seccomp, no ServiceAccount token, NetworkPolicies; the apps never get Kubernetes API access |

Out of scope: a malicious administrator; denial-of-service at scale (put the platform behind a provider with DDoS protection if that matters); compromise of the Kubernetes control plane.

## Authentication

- **Accounts are invitation-only.** An admin (or the `create-admin` CLI) creates an `INVITED` user and receives a single-use link. The invitee chooses their own password; nobody else ever sees it.
- **One-time links** (invitation 72 h, reset 2 h by default) contain 256 random bits. The database stores only their SHA-256. A new link invalidates older unused ones. The token is in the URL **fragment** (`#token=`), which browsers never send to servers, so it does not end up in access logs or `Referer` headers; the page clears it from the address bar after use.
- **Passwords**: 12–128 characters (passphrases encouraged), hashed with **argon2id** (19 MiB, t=2, p=1 — OWASP's recommendation). Hashes are upgraded transparently at login if parameters change. Login for unknown emails still runs a hash verification so timing does not reveal which emails exist.
- **Password reset** is administrator-assisted: an admin issues a reset link (UI or `cli reset-link`) and sends it. Resetting revokes every existing session. There is no email sending, hence no unauthenticated "forgot password" endpoint that could be abused.
- **Rate limiting**: 10 attempts per minute per client IP on login, link and password endpoints (`AUTH_RATE_LIMIT_PER_MINUTE`), 300/min elsewhere. Counters are per Pod, in memory: with N replicas the effective limit is N×. Acceptable for this scale; use a shared store (Redis) if that ever matters. Correct client IPs require `TRUST_PROXY_HOPS` to match your proxy chain.

## Sessions and tokens

| Cookie | Contents | Flags | Path | Lifetime |
|---|---|---|---|---|
| `cka_at` | Access JWT (EdDSA) | HttpOnly, Secure, SameSite=Lax | `/api` | 15 min |
| `cka_rt` | `<session id>.<256-bit secret>` | HttpOnly, Secure, SameSite=Lax | `/api/identity/auth` | 14 days, sliding |
| `cka_csrf` | Random CSRF token | Secure, SameSite=Lax (readable by JS) | `/` | session |

- JavaScript cannot read the access or refresh token, so XSS cannot exfiltrate a session.
- The refresh cookie is only sent to the refresh/logout endpoints.
- **Refresh rotation:** each refresh issues a new secret. The previous one is tolerated for 60 s (parallel tabs). Presenting an older one revokes the session (likely theft).
- **Revocation:** logout, password change (other devices), reset, deactivation and admin "sign out everywhere" revoke sessions immediately. An access token already issued remains valid until it expires (≤ `ACCESS_TOKEN_TTL_SECONDS`), because services verify tokens locally. Lower the TTL if that window matters more than the extra refresh traffic.
- **Signing keys:** Ed25519, held only by ms-identity (Secret mounted as a read-only file). Other services fetch public keys from an endpoint that is **not routed by the Ingress**. Tokens are checked for signature, algorithm, issuer, audience and expiry.

## CSRF

Every state-changing request must carry an `x-csrf-token` header equal to the `cka_csrf` cookie (compared in constant time). A cross-site page can make the browser send cookies but cannot read them, so it cannot set the header. Exempt (explicitly, with `@SkipCsrf()`): login, accept-invite and reset-password, which run before a session exists and are rate limited.

## Authorization

- Global guards (from `packages/auth-kit`) authenticate **every** route unless marked `@Public()`, then enforce `@Roles()`.
- Students can only read and write their own progress — every learning query is scoped by the user id from the verified token, never from the request body or URL.
- Admins cannot change their own role or status, and the last active admin cannot be demoted or disabled.

## Input validation

- DTOs are validated with class-validator using `whitelist` and `forbidNonWhitelisted`: unknown properties are rejected.
- IDs in URLs are validated (UUIDs parsed; content ids checked against the loaded curriculum).
- SQL is parameterised (TypeORM / `$n` placeholders) everywhere.
- Markdown from content is rendered without raw HTML (react-markdown default); MDX lessons are code reviewed with the repository. Mermaid runs with `securityLevel: 'strict'`.

## HTTP hardening

- **web (nginx):** `Content-Security-Policy: default-src 'self'; script-src 'self'; …; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`. `style-src` allows `'unsafe-inline'` because MUI/emotion injects styles at run time — a known, accepted trade-off (no script execution is allowed inline).
- **services:** helmet headers, `x-powered-by` disabled, JSON body only.
- **TLS** is terminated at the Ingress/edge; HTTP should redirect to HTTPS (example config provided for Traefik). Consider enabling HSTS at the controller once the domain is final.

## Secrets

- No secret has a default value in code, images, the chart or the repository. `.env`, `*.pem` and `secrets/` are git-ignored.
- Services accept `*_FILE` variants to read secrets from mounted files.
- The Helm chart generates random secrets once and keeps them (`lookup` + `resource-policy: keep`), or uses Secrets you provide (`existingSecret`).
- The frontend receives no secret: `/config.js` contains only `APP_NAME`.
- Logs redact `cookie`, `authorization`, `x-csrf-token` and `set-cookie` headers; request logs contain method, path and status only.

## Kubernetes

| Control | Setting |
|---|---|
| Pod security | `runAsNonRoot`, explicit UID/GID, `fsGroup`, `seccompProfile: RuntimeDefault` — compatible with the **restricted** Pod Security Standard |
| Containers | `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]` |
| API access | `automountServiceAccountToken: false` — the apps have no Kubernetes credentials at all |
| Network | Ingress allowed only from the controller namespace; Postgres only from the two services; identity's internal port only from the controller and ms-learning |

Recommended: label the namespace `pod-security.kubernetes.io/enforce=restricted` (the bundled PostgreSQL also complies).

## Lab execution

The platform never runs commands against anyone's cluster today; students run them in their own terminal. The future automated lab runner has its own security design (no cluster-admin for the platform, per-session namespaces or disposable clusters, short-lived scoped credentials never sent to browsers) in [LAB_ARCHITECTURE](LAB_ARCHITECTURE.md).

## Reporting

This is a private project; report issues to the administrator of your installation.
