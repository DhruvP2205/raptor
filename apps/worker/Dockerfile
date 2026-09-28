# syntax=docker/dockerfile:1
#
# Multi-stage build, mirrors apps/api/Dockerfile's structure (same
# monorepo-root build context, same pnpm --filter/deploy pattern). This
# app has no NestJS/argon2/sharp — just Prisma (needs openssl) + BullMQ.
#
# NOTE: unverified against a real `docker build` as of this commit —
# see apps/api/Dockerfile's identical note.

FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/crypto/package.json packages/crypto/package.json
RUN pnpm install --frozen-lockfile --filter @raptor/worker... --filter @raptor/crypto

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/crypto packages/crypto
COPY apps/worker apps/worker
# Copied into apps/worker's own tree, not left at apps/api/prisma — a
# real `docker build` (this note dated after the first one that ran)
# found that `pnpm --filter @raptor/worker prisma:generate` (which
# shells out to `prisma generate --schema=../api/prisma/schema.prisma`)
# fails in this stage specifically: apps/api has no node_modules
# installed here (only worker's deps were), so Prisma's project-root
# inference walks up from the schema file, finds nothing installable,
# and falls into a doomed auto-install attempt
# (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`). Works fine in local dev (a
# root `pnpm install` gives apps/api real node_modules too) — this is
# Docker-build-specific, so the fix lives here, not in the package.json
# script real local dev still uses correctly.
COPY apps/api/prisma apps/worker/prisma
RUN pnpm --filter @raptor/crypto build
RUN cd apps/worker && ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma
RUN pnpm --filter @raptor/worker build
RUN pnpm deploy --filter @raptor/worker --prod /repo/out/worker
# pnpm deploy produces an isolated tree with no ../api sibling, so the
# schema has to be copied in before this deployed copy can regenerate
# its own client against it.
RUN cp -r /repo/apps/worker/prisma /repo/out/worker/prisma
RUN cd /repo/out/worker && ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/out/worker ./
COPY apps/worker/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
