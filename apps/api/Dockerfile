# syntax=docker/dockerfile:1
#
# Multi-stage build. Context is the monorepo root (see docker-compose.yml)
# so pnpm workspace resolution and packages/shared are available.
#
# NOTE: unverified against a real `docker build` as of this commit — this
# environment doesn't have Docker installed. Re-check once Docker is
# available.

FROM node:22-alpine AS base
# argon2 needs node-gyp build tooling if no prebuilt binary exists for
# this platform/libc combo (musl, in this case); Prisma's query engine
# needs openssl at both build and run time on Alpine. sharp (Module 3,
# image re-encoding) ships a self-contained prebuilt libvips for
# linuxmusl-x64 as of v0.32+ and shouldn't need anything extra here —
# unverified, since this environment has no Docker; if the build stage
# fails to resolve sharp's binary, that's the first thing to check.
RUN apk add --no-cache python3 make g++ openssl
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
RUN pnpm --filter @raptor/api exec prisma generate
RUN pnpm --filter @raptor/api build
RUN pnpm deploy --filter @raptor/api --prod /repo/out/api
# Re-generate explicitly against the deployed copy's schema, rather than
# trusting @prisma/client's own postinstall auto-detection to find it in
# this fresh node_modules — avoids a silent mismatch if that detection
# doesn't see the copied prisma/ folder during pnpm deploy's own install.
RUN cd /repo/out/api && ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/out/api ./
COPY --from=build /repo/apps/api/prisma ./prisma
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
