# syntax=docker/dockerfile:1
#
# Multi-stage build. Context is the monorepo root (see docker-compose.yml).
#
# NOTE: unverified against a real `docker build` as of this commit — this
# environment doesn't have Docker installed. Re-check once Docker is
# available; Next.js `output: standalone` in a pnpm workspace nests the
# server entrypoint under the app's workspace path, reflected below —
# confirm the exact path once a real build has run.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @raptor/web... --filter @raptor/shared

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @raptor/shared build
RUN pnpm --filter @raptor/web build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
