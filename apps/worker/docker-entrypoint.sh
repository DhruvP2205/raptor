#!/bin/sh
set -e

# Same DATABASE_URL construction as apps/api/docker-entrypoint.sh — kept
# as its own copy (not shared) since these are two independent
# containers/images. Unlike api's entrypoint, this one never runs
# `prisma migrate deploy` — api is the single migration owner (see its
# entrypoint's comment); this worker only ever reads/writes rows in an
# already-migrated schema.
if [ -z "$DATABASE_URL" ] && [ -f /run/secrets/postgres_password ]; then
  POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password)
  export DATABASE_URL="postgresql://${POSTGRES_USER:-raptor}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-raptor}"
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/main.js
