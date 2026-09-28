#!/bin/sh
set -e

# Single source of truth for DATABASE_URL in the container: constructed
# here, once, before either process that needs it (the migrate step and
# the app itself) starts — see the comment in
# src/config/load-secrets.ts for why this isn't duplicated in TS too.
if [ -z "$DATABASE_URL" ] && [ -f /run/secrets/postgres_password ]; then
  POSTGRES_PASSWORD=$(cat /run/secrets/postgres_password)
  export DATABASE_URL="postgresql://${POSTGRES_USER:-raptor}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-raptor}"
fi

# Auto-apply pending migrations on every boot. Deliberate for this
# project: "docker compose up" is supposed to produce a fully working
# instance with zero manual steps (see CLAUDE.md's no-hosted-dependency
# principle and the brief's Adoptability scoring) — an organizer running
# this shouldn't need to know `prisma` exists.
./node_modules/.bin/prisma migrate deploy

exec node dist/main.js
