# syntax=docker/dockerfile:1
#
# Multi-stage build. Context is the monorepo root (see docker-compose.yml)
# so pnpm workspace resolution and packages/shared are available.
#
# NOTE: unverified against a real `docker build` as of this commit — this
# environment doesn't have Docker installed. Re-check once Docker is
# available, and expect adjustments once stage 1 adds native deps
# (e.g. argon2, which needs node-gyp build tooling in the deps stage).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @raptor/api... --filter @raptor/shared

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @raptor/shared build
RUN pnpm --filter @raptor/api build
RUN pnpm deploy --filter @raptor/api --prod /repo/out/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/out/api ./
COPY --from=build /repo/apps/api/prisma ./prisma
EXPOSE 4000
CMD ["node", "dist/main.js"]
