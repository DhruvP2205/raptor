#!/bin/sh
set -e

# Single source of truth for DATABASE_URL in the container: constructed
# here, once, before anything that needs it starts — see the comment in
# src/config/load-secrets.ts for why this isn't duplicated in TS too.
if [ -z "$DATABASE_URL" ] && [ -f /run/secrets/postgres_password ]; then
  POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password)
  export DATABASE_URL="postgresql://${POSTGRES_USER:-raptor}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-raptor}"
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

# Auto-apply pending migrations on every boot. Deliberate for this
# project: "docker compose up" is supposed to produce a fully working
# instance with zero manual steps (see CLAUDE.md's no-hosted-dependency
# principle and the brief's Adoptability scoring) — an organizer running
# this shouldn't need to know `prisma` exists.
./node_modules/.bin/prisma migrate deploy

# Module 16 (Fixtures Import), D171/D169 — seed step, run on every boot
# alongside migration. Idempotent (FixtureImportRecord); a no-op if
# apps/api/prisma/fixtures.json isn't present. Prints the checker's
# auth headers/routes to stdout (docker compose logs api).
node dist/scripts/seed.js

exec node dist/main.js
