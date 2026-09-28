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
COPY apps/api/prisma apps/api/prisma
RUN pnpm --filter @raptor/crypto build
RUN pnpm --filter @raptor/worker prisma:generate
RUN pnpm --filter @raptor/worker build
RUN pnpm deploy --filter @raptor/worker --prod /repo/out/worker
# pnpm deploy produces an isolated tree with no ../api sibling, so the
# schema (still only living in apps/api/prisma, the one canonical
# location — see that file's own header comment) has to be copied in
# before this deployed copy can regenerate its own client against it.
RUN cp -r /repo/apps/api/prisma /repo/out/worker/prisma
RUN cd /repo/out/worker && ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/out/worker ./
COPY apps/worker/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
