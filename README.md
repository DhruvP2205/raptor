# Raptor

A self-hostable, open-source hackathon submission & judging platform.

**Status: Module 1 (auth & email) implemented.** Design is locked
module-by-module in `docs/stages/*.md` before any code is written
against it — see `CLAUDE.md` for why. Most of the platform doesn't
exist yet; see `docs/stages/` for what's built vs. planned.

## Running it

```
docker compose up --build
```

brings up a seeded, working instance on `localhost` — no cloud account,
no hosted database, no external service, per the project's
no-hosted-dependency rule (see `CLAUDE.md`). **Unverified as of Module
1** — written to match `docs/ARCHITECTURE.md`, but this repo's own
development has happened without Docker installed; re-check this end to
end once it is.

### Local development (without Docker)

The api needs its own Postgres. Convention: a dedicated local instance
on port 5433 (not 5432, so it won't collide with anything else already
running; not the same instance Docker Compose manages, since that one
has no host-published port at all, by design).

```
createuser -h localhost -p 5433 -U postgres --login --pwprompt raptor
createdb   -h localhost -p 5433 -U postgres --owner=raptor raptor

cp apps/api/.env.example apps/api/.env   # fill in your own password
pnpm --filter @raptor/api exec prisma migrate dev
pnpm --filter @raptor/api dev
```

`apps/web`'s dev server (`pnpm --filter @raptor/web dev`) needs no
database — it talks to the api over HTTP.

## Structure

- `apps/api` — NestJS backend
- `apps/web` — Next.js frontend
- `packages/shared` — types/DTOs shared between api and web
- `docs/` — architecture, data model, decision log, glossary
- `docs/stages/` — one locked spec per module; source of truth for behavior
- `infra/` — seed fixtures and Docker-related config
- `tests/` — acceptance suite (tier-by-tier), once it exists
- `secrets/` — `*.txt.example` templates; real `*.txt` files are
  gitignored and filled in per-deployment

## License

Apache-2.0 — see `LICENSE`.
