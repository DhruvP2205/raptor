# syntax=docker/dockerfile:1
#
# Multi-stage build. Context is the monorepo root (see docker-compose.yml).
#
# Real `docker build` found a real bug this file's earlier "unverified"
# note couldn't catch by inspection alone: this project never created
# apps/web/public/ (nothing needed it locally), so the standard Next.js
# standalone-output COPY below — which assumes every app has one, since
# almost all do — failed with "not found". Fixed by adding the directory
# (apps/web/public/.gitkeep) rather than special-casing its absence here,
# since every real Next app ends up needing one eventually anyway.

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
