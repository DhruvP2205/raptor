# Raptor

A self-hostable, open-source hackathon submission & judging platform.

**Status: early scaffold.** Design is locked module-by-module in
`docs/stages/*.md` before any code is written against it — see
`CLAUDE.md` for why. Nothing beyond repo/infra scaffolding exists yet;
no feature from any stage is implemented.

## Running it

Not runnable end-to-end yet. Once Module 1 (auth) lands, the intent is:

```
docker compose up --build
```

bringing up a seeded, working instance on `localhost` — no cloud
account, no hosted database, no external service, per the project's
no-hosted-dependency rule (see `CLAUDE.md`).

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
