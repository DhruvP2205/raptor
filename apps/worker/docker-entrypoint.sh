#!/bin/sh
set -e

# Same DATABASE_URL construction as apps/api/docker-entrypoint.sh — kept
# as its own copy (not shared) since these are two independent
# containers/images. Unlike api's entrypoint, this one never runs
# `prisma migrate deploy` — api is the single migration owner (see its
# entrypoint's comment); this worker only ever reads/writes rows in an
# already-migrated schema.
# Module 20 (docs/design/20-demo-environment.md Section 4.1) — must
# construct the identical DATABASE_URL apps/api's entrypoint does,
# including the DEMO_MODE branch, or this container would silently
# recompute against `raptor` while `api` serves pages from
# `raptor_demo` (or vice versa) — two containers disagreeing about
# which database is real.
if [ -z "$DATABASE_URL" ] && [ -f /run/secrets/postgres_password ]; then
  POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password)
  DB_NAME="${POSTGRES_DB:-raptor}"
  if [ "$DEMO_MODE" = "true" ]; then
    DB_NAME="${DB_NAME}_demo"
  fi
  export DATABASE_URL="postgresql://${POSTGRES_USER:-raptor}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}/${DB_NAME}"
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/main.js
