# ARCHITECTURE.md

The shape of the system, and why. This is a living document — update it
as new modules are built, not just at the end.

---

## 1. Design philosophy in one paragraph

Every module in this platform touches at least one of: money-adjacent
outcomes (prizes, rankings), personal data (names tied to results), or an
untrusted-actor write surface (public voting, file uploads, organizer
templates). The architecture is built around one repeated pattern —
**enforce trust boundaries at the backend, never the UI; never trust a
client-supplied timestamp, token, or role claim; make destructive actions
explicit and audited** — applied consistently rather than reinvented per
feature. See `CLAUDE.md` for the enforced engineering principles this
implies.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, everywhere | One type system across backend, frontend, and shared code — no boundary where types silently drift between two languages |
| Backend framework | NestJS | Real dependency injection + guards — the actual mechanism backend-enforced role isolation runs on, not just a convenience |
| Frontend framework | Next.js | Same language as backend; good SSR for public/shareable pages (gallery, certificates) |
| Database | PostgreSQL | Strong JSON column support (`payloadJson`, `metadataJson`), array columns (`trackIds`), proper `timestamptz` for the UTC timeline model |
| ORM | Prisma | Typed schema doubles as a machine-checked version of `DATA-MODEL.md`; safe migrations |
| Cache / queues | Redis | Backs rate limiting, CAPTCHA/PoW challenge storage, and any future job queue — one piece of infra, several uses |
| Password hashing | argon2 | Memory-hard, current best-practice default |
| Sessions | Opaque server-side tokens, HttpOnly cookie | Instantly revocable (unlike a JWT), and never exposed to JS — mitigates token theft via XSS |
| API docs | `@nestjs/swagger` | Generates OpenAPI directly from the same decorators used for request validation — one source of truth, feeds the API-First bonus |
| SVG→PDF (certificates) | Pure-JS conversion (e.g. `svg-to-pdfkit`) | No headless-browser dependency — keeps the image light and laptop-friendly |
| CAPTCHA / abuse resistance | Self-built (visible fallback + invisible proof-of-work) | No third-party service call, satisfies the no-hosted-dependency rule |

---

## 3. Monorepo layout

```
dogfood/
├── apps/
│   ├── api/          NestJS backend
│   └── web/           Next.js frontend
├── packages/
│   └── shared/         Types/DTOs shared between api and web
├── infra/              Docker-related config, seed fixtures
├── tests/              Acceptance suite (tier-by-tier, runs against a live instance)
├── docs/
│   ├── ARCHITECTURE.md   (this file)
│   ├── DATA-MODEL.md
│   ├── DECISIONS.md
│   ├── GLOSSARY.md
│   └── stages/          One spec per module, numbered in build order
├── docker-compose.yml
└── CLAUDE.md
```

`packages/shared` exists specifically to prevent the frontend's idea of a
domain object (e.g. `Submission`) from silently drifting from what the
backend actually returns — both sides import the same type.

---

## 4. Service topology & network segmentation

Four containers, on two deliberately separated Docker networks:

```
                 host-published ports
                        │
        ┌───────────────┴───────────────┐
        │                                 │
     web (Next.js)                    api (NestJS)
        │                                 │
        └──────────── app-net ────────────┘
                                           │
                                      data-net
                                           │
                              ┌────────────┴────────────┐
                          postgres                    redis
```

- **`data-net`** — Postgres and Redis only. **No `ports:` mapping to the
  host at all** — neither is reachable from outside the Docker network
  under any circumstance, regardless of host firewall configuration.
- **`app-net`** — `api` and `web`.
- **`api` sits on both networks** (it's the only thing that needs to talk
  to the database directly). **`web` sits only on `app-net`** — it talks
  to `api`, never to Postgres/Redis directly. A compromised frontend
  container has no network path to the database at all.
- This mirrors the same isolation principle applied at the application
  layer (Module 2's guards) — just enforced one layer down, at
  infrastructure.

**No mail-catcher container.** Considered and explicitly rejected (see
`DECISIONS.md`) — SMTP is provider-agnostic and configured via Docker
secrets; there is exactly one mail-sending code path, used identically in
every environment, with `TEST_MODE` (Module 1) as the only environment
-specific branch, and that branch logs rather than requiring a second
piece of infrastructure.

---

## 5. Secrets handling

Sensitive configuration (SMTP credentials, the database password, the
Ed25519 certificate-signing key) is mounted via Docker Compose's
`secrets:` file-mount mechanism, never as plain environment variables in
`docker-compose.yml`:

```yaml
secrets:
  smtp_credentials:
    file: ./secrets/smtp_credentials.txt   # gitignored

services:
  api:
    secrets:
      - smtp_credentials
```

The app reads `/run/secrets/<name>` at startup. This value never appears
in `docker inspect`, shell history, or the compose file itself. A
self-hoster edits one file per secret; no code change required.
`secrets/*.example` files are committed as templates with placeholder
values and inline comments.

---

## 6. Authorization architecture

- Every session resolves to a `User` via an opaque token lookup
  (Module 1).
- Every privileged route declares its requirement declaratively (e.g.
  `@RequireEventRole(EventRole.ORGANIZER)`), and a guard resolves the
  specific `eventId` from the request path and checks the current user's
  `EventMembership` for **that event only** (Module 2) — never a global
  role flag.
- `siteAdmin` bypasses this check, but every bypass writes an
  `AuditLog` entry — the power exists for genuine operational need, but
  it's never invisible.
- This is the **only** authorization path in the system. There is no
  parallel "trust the frontend already checked" shortcut anywhere.

---

## 7. Status vs. Phase pattern (Event, and reused elsewhere)

A recurring pattern introduced in Module 3 and expected to reappear
anywhere a resource has both a deliberate lifecycle decision and a
timeline-driven state:

- **Status** — manual, actor-controlled (`DRAFT → PUBLISHED → ARCHIVED /
  DELETED` for events). A deliberate action, never automatic.
- **Phase** — fully computed from `now()` against stored timestamps, on
  every read, never stored as a column that could drift from reality.

Anything that needs "is this thing currently in state X" should be asked
whether it's actually two separate questions (a decision someone made,
vs. where the clock currently sits) before being modeled as one enum.

---

## 8. Deferred/not-yet-designed subsystems

Documented here so it's clear what's intentionally not architected yet,
rather than accidentally forgotten:

- Judge assignment & scoring (Module 7+)
- Normalization
- Voting (rounds, anti-abuse, shortlist) — heavily discussed in
  conversation, not yet written as a stage doc
- Certificates — heavily discussed, not yet written as a stage doc
- REST API/webhooks, bulk import/export, pairwise judging mode,
  normalization proof, threat model doc, OpenAPI publication

Each will get its own `docs/stages/NN-name.md` following the same format
as Modules 1-5 before any code is written against it.
