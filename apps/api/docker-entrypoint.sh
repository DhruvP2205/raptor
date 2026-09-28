#!/bin/sh
set -e

# Single source of truth for DATABASE_URL in the container: constructed
# here, once, before anything that needs it starts — see the comment in
# src/config/load-secrets.ts for why this isn't duplicated in TS too.
#
# Module 20 (docs/design/20-demo-environment.md Section 4) — DEMO_MODE
# selects WHICH database this points at, never adds rows to the real
# one. `raptor` (real, always-persistent) vs. `raptor_<db>_demo`
# (disposable, only ever written to by seed-demo.ts). Both api and
# worker must agree on this (Section 4.1) — both read the identical
# DEMO_MODE env var, and this same formula runs in both entrypoints.
if [ -z "$DATABASE_URL" ] && [ -f /run/secrets/postgres_password ]; then
  POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password)
  DB_NAME="${POSTGRES_DB:-raptor}"
  if [ "$DEMO_MODE" = "true" ]; then
    DB_NAME="${DB_NAME}_demo"
  fi
  export DATABASE_URL="postgresql://${POSTGRES_USER:-raptor}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}/${DB_NAME}"
fi

# Standard entrypoint idiom: if the container was invoked with an
# explicit command (e.g. `docker compose run --rm api node
# dist/scripts/bootstrap-admin.js`), run that instead of the default —
# it still gets DATABASE_URL from above either way. This is the only
# way scripts/bootstrap-admin.ts is ever meant to run in Docker; there
# is deliberately no automatic/in-app path to create a siteAdmin (see
# docs/stages/02-roles-and-membership.md Section 2.4).
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# Module 20 — `prisma migrate deploy` (below) assumes the target
# database already exists; Postgres doesn't create one on connect. The
# real `raptor` database is created by the postgres image itself
# (POSTGRES_DB) on first boot, but `raptor_demo` isn't — created here,
# once, only when DEMO_MODE is on.
if [ "$DEMO_MODE" = "true" ]; then
  node dist/scripts/ensure-demo-database.js
fi

# Auto-apply pending migrations on every boot. Deliberate for this
# project: "docker compose up" is supposed to produce a fully working
# instance with zero manual steps (see CLAUDE.md's no-hosted-dependency
# principle and the brief's Adoptability scoring) — an organizer running
# this shouldn't need to know `prisma` exists.
./node_modules/.bin/prisma migrate deploy

# Module 16 (Fixtures Import), D171/D169 — seed step, run on every boot
# alongside migration, unconditionally (Section 1 of the demo-env doc:
# the checker needs this regardless of DEMO_MODE). Idempotent
# (FixtureImportRecord); a no-op if apps/api/prisma/fixtures.json isn't
# present. Prints the checker's auth headers/routes to stdout (docker
# compose logs api).
node dist/scripts/seed.js

# Module 20 — the human-facing demo content, only when opted into.
if [ "$DEMO_MODE" = "true" ]; then
  node dist/scripts/seed-demo.js
fi

exec node dist/main.js
