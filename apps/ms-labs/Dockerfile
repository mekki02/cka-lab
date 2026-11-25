# syntax=docker/dockerfile:1.7
# Build from the repository root:
#   docker build -f apps/ms-labs/Dockerfile -t cka-lab/ms-labs:dev .
#
# Contains the lab content (labs/*.yaml: setup, checks, verify scripts), the
# helm binary and the pinned vcluster chart — so starting a session never
# downloads anything but container images.

ARG NODE_IMAGE=node:24-alpine

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
    npm ci -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit -w @cka/ms-labs --include-workspace-root
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/ms-labs ./apps/ms-labs
RUN npm run build -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit \
 && npm run build -w @cka/ms-labs

FROM ${NODE_IMAGE} AS deps
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
    npm ci --omit=dev -w @cka/contracts -w @cka/service-kit -w @cka/auth-kit -w @cka/ms-labs

FROM ${NODE_IMAGE} AS helm
ARG TARGETARCH
ARG HELM_VERSION=v4.3.1
ARG VCLUSTER_CHART_VERSION=0.37.7
RUN apk add --no-cache curl tar \
 && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" | tar -xz -C /tmp \
 && mv "/tmp/linux-${TARGETARCH}/helm" /usr/local/bin/helm \
 && mkdir /charts \
 && HELM_CACHE_HOME=/tmp/h helm pull vcluster --repo https://charts.loft.sh --version "${VCLUSTER_CHART_VERSION}" -d /charts

FROM ${NODE_IMAGE} AS runtime
ARG VCLUSTER_CHART_VERSION=0.37.7
ENV NODE_ENV=production \
    PORT=3003 \
    CONTENT_DIR=/app/content \
    LABS_HELM_BIN=/usr/local/bin/helm \
    LABS_VCLUSTER_CHART=/app/charts/vcluster-${VCLUSTER_CHART_VERSION}.tgz \
    LABS_VCLUSTER_CHART_REPO="" \
    LABS_VCLUSTER_CHART_VERSION=${VCLUSTER_CHART_VERSION}
WORKDIR /app
COPY --from=helm /usr/local/bin/helm /usr/local/bin/helm
COPY --from=helm /charts ./charts
COPY --from=deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/contracts/package.json ./packages/contracts/
COPY --from=build --chown=node:node /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /repo/packages/service-kit/package.json ./packages/service-kit/
COPY --from=build --chown=node:node /repo/packages/service-kit/dist ./packages/service-kit/dist
COPY --from=build --chown=node:node /repo/packages/auth-kit/package.json ./packages/auth-kit/
COPY --from=build --chown=node:node /repo/packages/auth-kit/dist ./packages/auth-kit/dist
COPY --from=build --chown=node:node /repo/apps/ms-labs/package.json ./apps/ms-labs/
COPY --from=build --chown=node:node /repo/apps/ms-labs/dist ./apps/ms-labs/dist
COPY --chown=node:node content/labs ./content/labs
COPY --chown=node:node content/exercises ./content/exercises

USER node
EXPOSE 3003
CMD ["node", "apps/ms-labs/dist/main.js"]
