# CKA Lab

A self-hosted, private learning platform for the **Certified Kubernetes Application Developer (CKAD)** and **Certified Kubernetes Administrator (CKA)** exams: structured courses mapped to the official CNCF competencies, hands-on labs and auto-graded exercises with **a private Kubernetes cluster and terminal in the browser** for every student, server-graded quizzes, timed mock exams and searchable cheat sheets — deployable to any Kubernetes cluster for you and a few invited people.

> CKA Lab is an independent study tool. Mock-exam scores are simulations based on checks you confirm yourself; they are not CKAD or CKA certification results.

## What is inside

| | |
|---|---|
| **Courses** | **CKAD** (start here if you are new): 13 modules covering its 24 official competencies. **CKA**: 30 modules (27 official competencies, Kubernetes v1.37) + a *Beyond the CKA* track (Helm authoring, Traefik, Argo CD). Every lesson follows the same nine steps: theory → visualization → command line → example → guided exercise → challenge → troubleshooting → solution → knowledge check. |
| **Labs** | Guided, challenge and troubleshooting labs with setup, hints, checks, hidden solutions, a verify script and reset. **In the browser**: start a lab and get a private virtual cluster (vcluster) with the lab already set up, a terminal beside the instructions, ▶ buttons that paste commands into it, and **Check my work** that verifies tasks on the cluster. Or run them on your own cluster. |
| **Exercises** | A graded practice track: every published lesson has exercises and each module ends with challenges. A CodinGame-style page — statement, terminal, answer fields, test cases, **Validate** — loads the exercise's starting state (broken Services, wrong config, missing objects) into your playground in seconds. Test cases check the cluster, typed answers, files you saved (`~/answers/…`, like the exam), commands you ran and terminal output. |
| **Playground** | An empty cluster of your own, from the sidebar or docked beside any lesson. Idle environments are deleted automatically. |
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
                     ├─ /api/labs/*     ─► ms-labs (NestJS, REST + terminal WebSocket) ─► Kubernetes API
                     │                        └─ per student: namespace + vcluster + toolbox Pod
                     └─ /*              ─► web (React + MUI SPA) │   (identity db, learning db)
                   ms-learning ── JWKS (public key) ──► ms-identity
```

Details and the reasoning behind each choice: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (Docker Compose)

Requirements: Docker with Compose v2, Node.js ≥ 22.15 (only for the setup script).

```bash
npm run setup:env            # writes .env with random DB passwords and a signing key
docker compose up -d --build
docker compose exec ms-identity node apps/ms-identity/dist/cli.js \
  create-admin --email you@example.com --name "Your Name"
```

Open the printed link (it points to `http://localhost:8080`), choose a password, and you are in. Invite others from **Administration → Users**.

> Browser terminals need Kubernetes: they are available in the Helm deployment (`labs.enabled: true`), not in Docker Compose.

## Documentation

| Document | Read it to… |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | understand the services, data, auth flow and design decisions |
| [DEVELOPMENT](docs/DEVELOPMENT.md) | run everything locally with hot reload, test, add features |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | build images, deploy with Helm or plain manifests, HTTPS, backups, upgrades |
| [CONFIGURATION](docs/CONFIGURATION.md) | look up every environment variable and Helm value |
| [SECURITY](docs/SECURITY.md) | see the threat model, what is protected and how |
| [CONTENT_AUTHORING](docs/CONTENT_AUTHORING.md) | write lessons, exercises, labs, quizzes, exams and cheat sheets |
| [LAB_ARCHITECTURE](docs/LAB_ARCHITECTURE.md) | understand the browser lab environments: virtual clusters, terminal, checks, isolation |

## Repository layout

```
apps/
  web/            React 19 + MUI 7 SPA (theme and shell adapted from the boilerplate)
  ms-identity/    NestJS: users, invitations, sessions, token signing (JWKS), admin CLI
  ms-learning/    NestJS: curriculum, progress, labs, quizzes, mock exams, dashboard
  ms-labs/        NestJS: per-student virtual clusters, browser terminal (WebSocket), server-side checks
packages/
  contracts/      TypeScript types shared by browser and services
  auth-kit/       NestJS module: token verification, roles, CSRF (used by both services)
  service-kit/    HTTP hardening, logging, migrations under a lock, secrets from files
images/
  toolbox/        the student workstation behind the terminal (kubectl, helm, vim…)
content/          curriculum.yaml + courses/ (CKAD, CKA), lessons (MDX), exercises, labs, quizzes, exams, cheat sheets
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
