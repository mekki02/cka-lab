# Development

## Prerequisites

- Node.js ≥ 22.12 (24 LTS recommended; `.nvmrc` says 24) and npm ≥ 10
- Docker with Compose v2 (for PostgreSQL, or the whole stack)
- Optional: `kind`, `kubectl`, `helm` for labs and Kubernetes testing

## First run

```bash
npm install                 # all workspaces
npm run setup:env           # .env with random secrets (used by Compose and the dev scripts below)
npm run db:up               # PostgreSQL only, on localhost:${POSTGRES_PORT:-5433}
```

### Run the services and the web app with hot reload

The services read their configuration from environment variables only (no `.env` loading inside the apps — that is deliberate, it is how containers receive config). A small helper exports the right variables:

```bash
set -a; . ./.env; set +a
export NODE_ENV=development DATABASE_HOST=127.0.0.1 DATABASE_PORT=$POSTGRES_PORT COOKIE_SECURE=false

# terminal 1 — identity on :3001
DATABASE_USER=identity DATABASE_NAME=identity DATABASE_PASSWORD=$IDENTITY_DB_PASSWORD \
PUBLIC_URL=http://localhost:5173 npm run dev:identity

# terminal 2 — learning on :3002
DATABASE_USER=learning DATABASE_NAME=learning DATABASE_PASSWORD=$LEARNING_DB_PASSWORD \
CONTENT_DIR=$PWD/content JWKS_URL=http://localhost:3001/.well-known/jwks.json npm run dev:learning

# terminal 3 — web on :5173 (proxies /api/* to the services)
npm run dev:web
```

Create an admin (from the repo root, with the identity variables exported):

```bash
npm run build -w @cka/ms-identity
DATABASE_USER=identity DATABASE_NAME=identity DATABASE_PASSWORD=$IDENTITY_DB_PASSWORD \
PUBLIC_URL=http://localhost:5173 node apps/ms-identity/dist/cli.js create-admin --email you@example.com --name "You"
```

> The shared packages (`packages/*`) are compiled to `dist/` and consumed by the services through workspace links. After changing one, run `npm run build:packages` (the services' watch mode does not rebuild them). The web app imports `@cka/contracts` from source, so it needs no rebuild.

### Or run the whole stack in containers

```bash
docker compose up -d --build     # http://localhost:8080
docker compose logs -f ms-learning
docker compose down              # keeps data; `down -v` deletes the database volume
```

## Useful commands

| Command | What it does |
|---|---|
| `npm run build` | Build packages, both services and the web app |
| `npm run typecheck` | Type-check every workspace |
| `npm test` | Unit tests (Vitest in every workspace) |
| `npm run content:check` | Validate all course content (also runs in the ms-learning image build) |
| `npm run keys:generate` | Print a new Ed25519 signing key |
| `docker compose build` | Build the three images |

## Swagger / API docs

Set `SWAGGER_ENABLED=true` on a service and open `/api/identity/docs` or `/api/learning/docs`. Disabled by default in production.

## Project conventions

- **TypeScript everywhere**, strict mode. No `any` in new code.
- **Contracts first.** Request/response shapes live in `packages/contracts`; services implement them with class-validator DTOs, the web app consumes them with RTK Query.
- **Every route is authenticated and CSRF-checked by default** (`packages/auth-kit`). Opt out explicitly with `@Public()` / `@SkipCsrf()` and justify it in a comment.
- **Validation:** DTOs use class-validator with `whitelist` + `forbidNonWhitelisted` — unknown fields are rejected, not ignored.
- **Migrations, never `synchronize`.** Add a new file in `src/database/migrations`, register it in `typeorm-options.ts`. Never edit a migration that has run anywhere.
- **Config is environment only**, validated at start-up in `src/config/env.ts`. A new variable needs a default or a clear error, and an entry in [CONFIGURATION](CONFIGURATION.md).
- **Web:** MUI components and the theme in `src/theme`; data access only through `src/api/api.ts`; pages handle loading, error and empty states (`components/states.tsx`).

## Adding a backend feature (example: a "notes" endpoint in ms-learning)

1. Types in `packages/contracts/src/learning.ts` (`NoteDto`, `CreateNoteRequest`); `npm run build -w @cka/contracts`.
2. Migration `apps/ms-learning/src/database/migrations/<timestamp>-Notes.ts` with the `CREATE TABLE`; register it.
3. Entity, service and controller in a new folder; DTO class implementing the contract with class-validator decorators.
4. Endpoint in `apps/web/src/api/api.ts`; page or component using the generated hook.
5. Test: a Vitest spec for pure logic (see `assessments/grading.ts` for the style), then exercise it through the UI.

## Visual checks

The repository has no browser-test suite yet. During development the UI was checked with headless Chrome screenshots (Playwright) against `npm run dev:web` and the Compose stack, in light and dark mode, at desktop width. Adding a Playwright suite (login → lesson → quiz → exam) is the next quality step.
