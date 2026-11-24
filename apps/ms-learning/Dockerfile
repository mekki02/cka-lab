# syntax=docker/dockerfile:1.7
# Build from the repository root:
#   docker build -f apps/ms-learning/Dockerfile -t cka-lab/ms-learning:dev .
#
# The course content (YAML under content/) is baked into the image, so an
# image tag pins an exact version of the course. The build fails if the
# content is invalid — a broken quiz never reaches a cluster.

ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/service-kit/package.json packages/service-kit/
COPY packages/auth-kit/package.json packages/auth-kit/
COPY apps/ms-identity/package.json apps/ms-identity/
COPY apps/ms-learning/package.json apps/ms-learning/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit -w @cka/ms-learning --include-workspace-root

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/ms-learning ./apps/ms-learning
RUN npm run build -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit \
 && npm run build -w @cka/ms-learning

# Validate all content (YAML schemas, cross-references, lesson bodies exist).
COPY content ./content
RUN CONTENT_DIR=/repo/content node apps/ms-learning/dist/content/check.js

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/service-kit/package.json packages/service-kit/
COPY packages/auth-kit/package.json packages/auth-kit/
COPY apps/ms-identity/package.json apps/ms-identity/
COPY apps/ms-learning/package.json apps/ms-learning/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit -w @cka/ms-learning

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3002 \
    CONTENT_DIR=/app/content
WORKDIR /app
COPY --from=deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/contracts/package.json ./packages/contracts/
COPY --from=build --chown=node:node /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /repo/packages/service-kit/package.json ./packages/service-kit/
COPY --from=build --chown=node:node /repo/packages/service-kit/dist ./packages/service-kit/dist
COPY --from=build --chown=node:node /repo/packages/auth-kit/package.json ./packages/auth-kit/
COPY --from=build --chown=node:node /repo/packages/auth-kit/dist ./packages/auth-kit/dist
COPY --from=build --chown=node:node /repo/apps/ms-learning/package.json ./apps/ms-learning/
COPY --from=build --chown=node:node /repo/apps/ms-learning/dist ./apps/ms-learning/dist
# Only what the service serves: lesson bodies (MDX) ship in the web image.
COPY --from=build --chown=node:node /repo/content/curriculum.yaml ./content/
COPY --from=build --chown=node:node /repo/content/labs ./content/labs
COPY --from=build --chown=node:node /repo/content/quizzes ./content/quizzes
COPY --from=build --chown=node:node /repo/content/exams ./content/exams
COPY --from=build --chown=node:node /repo/content/cheatsheets ./content/cheatsheets

USER node
EXPOSE 3002
CMD ["node", "apps/ms-learning/dist/main.js"]
