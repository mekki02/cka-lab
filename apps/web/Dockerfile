# syntax=docker/dockerfile:1.7
# Build from the repository root:
#   docker build -f apps/web/Dockerfile -t cka-lab/web:dev .
#
# Same two-stage shape as the boilerplate's image (Node builds, nginx serves,
# config.js written at container start), hardened: unprivileged nginx on 8080,
# works with a read-only root filesystem, strict security headers.

ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/service-kit/package.json packages/service-kit/
COPY packages/auth-kit/package.json packages/auth-kit/
COPY apps/ms-identity/package.json apps/ms-identity/
COPY apps/ms-learning/package.json apps/ms-learning/
COPY apps/ms-labs/package.json apps/ms-labs/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci -w @cka/contracts -w @cka/web --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web
# Lesson bodies are compiled into the bundle.
COPY content/lessons ./content/lessons
RUN npm run build -w @cka/web

FROM ${NGINX_IMAGE} AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 apps/web/docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
# The dev placeholder is replaced at start-up by the script above.
USER root
RUN rm -f /usr/share/nginx/html/config.js
USER 101
EXPOSE 8080
