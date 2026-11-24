# CKA Lab

A self-hosted, private learning platform for the **Certified Kubernetes Administrator** exam: a structured course mapped to the official CNCF competencies, hands-on labs for your own cluster, server-graded quizzes, timed mock exams and searchable cheat sheets — deployable to any Kubernetes cluster for you and a few invited people.

> CKA Lab is an independent study tool. Mock-exam scores are simulations based on checks you confirm yourself; they are not CKA certification results.

## What is inside

| | |
|---|---|
| **Course** | 30 modules (27 official competencies, Kubernetes v1.37) + a *Beyond the CKA* track (Helm authoring, Traefik, Argo CD). Every lesson follows the same nine steps: theory → visualization → command line → example → guided exercise → challenge → troubleshooting → solution → knowledge check. |
| **Labs** | Guided, challenge and troubleshooting labs with setup, hints, check commands, hidden solutions, a verify script and reset steps. Run against your own cluster (kind works). |
| **Quizzes** | Single, multiple-answer and scenario questions, graded on the server, with an explanation for every option. |
| **Mock exams** | Timed (server-enforced), per-task checks, partial credit, review with solutions. |
| **Progress** | Dashboard with per-domain progress weighted by exam weights, next lesson, recent activity, weak areas; bookmarks. |
| **Access** | Invitation-only accounts (copyable one-time links), ADMIN/STUDENT roles, HttpOnly cookie sessions, CSRF protection, rate limiting. |

**Content status:** the full outline (87 lessons) is in place; the lessons marked *published* are written in depth and their labs, quiz and mock exam were executed on a kind v1.37 cluster. Planned lessons show as "coming soon". See `npm run content:check` for current numbers.

## Architecture in one picture

```
browser ──HTTPS──► Ingress / Gateway (TLS)          ── docker compose: "edge" nginx
                     ├─ /api/identity/* ─► ms-identity (NestJS) ─┐
                     ├─ /api/learning/* ─► ms-learning (NestJS) ─┼─► PostgreSQL
                     └─ /*              ─► web (React + MUI SPA) │   (identity db, learning db)
                   ms-learning ── JWKS (public key) ──► ms-identity
```

Details and the reasoning behind each choice: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (Docker Compose)

Requirements: Docker with Compose v2, Node.js ≥ 22.12 (only for the setup script).

```bash
npm run setup:env            # writes .env with random DB passwords and a signing key
docker compose up -d --build
docker compose exec ms-identity node apps/ms-identity/dist/cli.js \
  create-admin --email you@example.com --name "Your Name"
```

Open the printed link (it points to `http://localhost:8080`), choose a password, and you are in. Invite others from **Administration → Users**.

## Documentation

| Document | Read it to… |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | understand the services, data, auth flow and design decisions |
| [DEVELOPMENT](docs/DEVELOPMENT.md) | run everything locally with hot reload, test, add features |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | build images, deploy with Helm or plain manifests, HTTPS, backups, upgrades |
| [CONFIGURATION](docs/CONFIGURATION.md) | look up every environment variable and Helm value |
| [SECURITY](docs/SECURITY.md) | see the threat model, what is protected and how |
| [CONTENT_AUTHORING](docs/CONTENT_AUTHORING.md) | write lessons, labs, quizzes, exams and cheat sheets |
| [LAB_ARCHITECTURE](docs/LAB_ARCHITECTURE.md) | understand the lab model today and the design for isolated, automated lab clusters |

## Repository layout

```
apps/
  web/            React 19 + MUI 7 SPA (theme and shell adapted from the boilerplate)
  ms-identity/    NestJS: users, invitations, sessions, token signing (JWKS), admin CLI
  ms-learning/    NestJS: curriculum, progress, labs, quizzes, mock exams, dashboard
packages/
  contracts/      TypeScript types shared by browser and services
  auth-kit/       NestJS module: token verification, roles, CSRF (used by both services)
  service-kit/    HTTP hardening, logging, migrations under a lock, secrets from files
content/          curriculum.yaml, lessons (MDX), labs, quizzes, exams, cheat sheets
deploy/
  compose/        edge proxy config, Postgres init script
  helm/cka-lab/   Helm chart (+ examples: kind, Traefik)
  k8s/            plain manifests rendered from the chart
  argocd/         Argo CD Application example
  kind/           kind configs: the lab cluster and a platform test cluster
docs/
```

## License

Private project. Course content is original; Kubernetes® is a registered trademark of the Linux Foundation. CKA Lab is not affiliated with the CNCF or the Linux Foundation.
