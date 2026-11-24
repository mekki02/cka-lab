# syntax=docker/dockerfile:1.7
# Build from the repository root:
#   docker build -f apps/ms-identity/Dockerfile -t cka-lab/ms-identity:dev .

ARG NODE_IMAGE=node:24-alpine

# ---- build: install everything, compile shared packages and the service ----
FROM ${NODE_IMAGE} AS build
WORKDIR /repo
# Manifests first, so the dependency layer is cached until a package.json or
# the lockfile changes. All workspace manifests are copied because npm checks
# the lockfile against every workspace it lists.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/service-kit/package.json packages/service-kit/
COPY packages/auth-kit/package.json packages/auth-kit/
COPY apps/ms-identity/package.json apps/ms-identity/
COPY apps/ms-learning/package.json apps/ms-learning/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit -w @cka/ms-identity --include-workspace-root

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/ms-identity ./apps/ms-identity
RUN npm run build -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit \
 && npm run build -w @cka/ms-identity

# ---- deps: production dependencies only ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages/contracts/package.json packages/contracts/
COPY --from=build /repo/packages/service-kit/package.json packages/service-kit/
COPY --from=build /repo/packages/auth-kit/package.json packages/auth-kit/
COPY --from=build /repo/apps/ms-identity/package.json apps/ms-identity/
COPY apps/ms-learning/package.json apps/ms-learning/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit -w @cka/ms-identity

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
# node_modules/@cka/* are symlinks to packages/*, so keep the same layout.
COPY --from=deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/contracts/package.json ./packages/contracts/
COPY --from=build --chown=node:node /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /repo/packages/service-kit/package.json ./packages/service-kit/
COPY --from=build --chown=node:node /repo/packages/service-kit/dist ./packages/service-kit/dist
COPY --from=build --chown=node:node /repo/packages/auth-kit/package.json ./packages/auth-kit/
COPY --from=build --chown=node:node /repo/packages/auth-kit/dist ./packages/auth-kit/dist
COPY --from=build --chown=node:node /repo/apps/ms-identity/package.json ./apps/ms-identity/
COPY --from=build --chown=node:node /repo/apps/ms-identity/dist ./apps/ms-identity/dist

# The official image's unprivileged user (uid 1000). Kubernetes can enforce
# it with runAsNonRoot; the root filesystem can be mounted read-only.
USER node
EXPOSE 3001
# Node is PID 1: it receives SIGTERM directly and Nest's shutdown hooks drain
# in-flight requests before exiting.
CMD ["node", "apps/ms-identity/dist/main.js"]
