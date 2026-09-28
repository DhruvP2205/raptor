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
| Cache / queues | Redis | Backs rate limiting (live as of Module 3 — upload endpoints, D72), CAPTCHA/PoW challenge storage (live as of Module 11 — voting, `vote-pow:*`/`vote-captcha:*` keys), and any future job queue — one piece of infra, several uses |
| Password hashing | argon2 | Memory-hard, current best-practice default |
| Sessions | Opaque server-side tokens, HttpOnly cookie | Instantly revocable (unlike a JWT), and never exposed to JS — mitigates token theft via XSS |
| Markdown | `markdown-it` + `sanitize-html` | One render function (`MarkdownService`), used identically for preview and production everywhere markdown is stored (Module 3) |
| Image processing | `sharp` + `file-type` | Magic-byte detection, header-only dimension read before full decode, re-encode (strips EXIF/polyglots) — Module 3's upload pipeline |
| API docs | `@nestjs/swagger` | Generates OpenAPI directly from the same decorators used for request validation — one source of truth, feeds the API-First bonus |
| SVG→PDF (certificates) | Pure-JS conversion (e.g. `svg-to-pdfkit`) | No headless-browser dependency — keeps the image light and laptop-friendly |
| CAPTCHA / abuse resistance | Self-built (visible fallback + invisible proof-of-work) | Live as of Module 11 (`PowCaptchaService`) — no third-party service call, satisfies the no-hosted-dependency rule |
| Background jobs | BullMQ on Redis, separate `worker` container | Introduced in Module 6 — GitHub API calls during submission verification cannot run synchronously in the API's request thread without degrading responsiveness for other users. Module 14's global-ranking recompute reuses this same container as a second, independent queue. Certificate rendering (Module 12) does not use this — see §4 |
| Secret storage requiring reversible decryption (GitHub tokens) | AES-256-GCM, key via Docker secrets | The one deliberate exception to the platform's hash-everything pattern — a GitHub PAT must be read back in plaintext to call the API, unlike session/verification/invitation tokens which are compare-only |

---

## 3. Monorepo layout

```
dogfood/
├── apps/
│   ├── api/          NestJS backend
│   ├── web/           Next.js frontend
│   └── worker/         BullMQ background-job container (Module 6)
├── packages/
│   ├── shared/         Types/DTOs shared between api and web
│   └── crypto/         GitHub-token AES-256-GCM helpers, shared between
│                        api and worker only (Module 6) — kept out of
│                        shared/ so that package stays browser-safe
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

Note: `stages/` actually lives at the repo root (`stages/NN-*.md`), not
under `docs/` — this diagram groups it with the other narrative docs for
readability, but see CLAUDE.md's own "Where things are" section for the
authoritative path.

`packages/shared` exists specifically to prevent the frontend's idea of a
domain object (e.g. `Submission`) from silently drifting from what the
backend actually returns — both sides import the same type. `packages/
crypto` exists for the same drift-prevention reason, scoped to just the
one piece of logic `api` and `worker` must compute identically (Section
2's tech-stack table, GitHub token encryption).

---

## 4. Service topology & network segmentation

Five containers, on two deliberately separated Docker networks:

```
                 host-published ports
                        │
        ┌───────────────┴───────────────┐
        │                                 │
     web (Next.js)                    api (NestJS)
        │                                 │
        └──────────── app-net ────────────┤
                                           │
                                      worker (BullMQ) ── shares app-net + data-net
                                           │
                                      data-net
                                           │
                              ┌────────────┴────────────┐
                          postgres                    redis
```

- **`data-net`** — Postgres and Redis only. **No `ports:` mapping to the
  host at all** — neither is reachable from outside the Docker network
  under any circumstance, regardless of host firewall configuration.
- **`app-net`** — `api`, `web`, and `worker`.
- **`api` and `worker` both sit on `data-net` and `app-net`** (both need
  to talk to Postgres/Redis directly). **`web` sits only on `app-net`**
  — it talks to `api`, never to Postgres/Redis directly. A compromised
  frontend container has no network path to the database at all.
- This mirrors the same isolation principle applied at the application
  layer (Module 2's guards) — just enforced one layer down, at
  infrastructure.

**The `worker` container** runs BullMQ against Redis, handling
background jobs that must never run synchronously in the API's request
thread — introduced in Module 6 (Submission Verification) for GitHub
API calls, the one job type in this platform genuinely too slow/
network-dependent to run inline. Module 14 (Global Ranking) added a
second, independent BullMQ queue in this same container — a
cross-event aggregate recompute, triggered whenever a
`PublishedResultVersion`/`VotingResultVersion` goes `LIVE` (or a manual
admin recompute) — genuinely background-appropriate for the same
reason GitHub verification is, just a different kind of slow (scanning
every LIVE result across every event, not a network call). Certificate
rendering (Module 12) does **not** use it: SVG→PDF via pure-JS
`svg-to-pdfkit` is fast enough to run directly in the API's request
thread (the stage doc's own "generated on demand... at request time"
framing, backed by Redis caching), so an earlier assumption that it
would reuse this container was corrected once the module was actually
implemented — see CLAUDE.md on code/doc disagreements.

**No mail-catcher container.** Considered and explicitly rejected (see
`DECISIONS.md`) — SMTP is provider-agnostic and configured via Docker
secrets; there is exactly one mail-sending code path, used identically in
every environment, with `TEST_MODE` (Module 1) as the only environment
-specific branch, and that branch logs rather than requiring a second
piece of infrastructure.

**File uploads (Module 3)** are stored on the `uploads-data` volume
(`/app/uploads` in the `api` container), never on a path Express
statically serves — the only way a stored file is ever reachable is
through the dedicated `GET /uploads/:id` route, which re-sniffs the
Content-Type from the file's actual bytes at serve time rather than
trusting anything recorded at upload time.

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

This value never appears in `docker inspect`, shell history, or the
compose file itself. A self-hoster edits one file per secret; no code
change required. `secrets/*.txt.example` files are committed as
templates with placeholder values and inline comments.

**Who reads `/run/secrets/<name>`, exactly, depends on the secret (D56):**

- **SMTP credentials** are read by the Node app itself, in TypeScript
  (`apps/api/src/config/load-secrets.ts`), since only that one process
  ever needs them.
- **The Postgres password** is read by `apps/api/docker-entrypoint.sh`
  (shell), not TypeScript, and used to construct `DATABASE_URL` before
  *either* of two separate OS processes that need it starts: `prisma
  migrate deploy` (applying pending migrations on every boot, so `docker
  compose up` needs zero manual steps — see D56) and then the Node app
  itself (`exec node dist/main.js`, inheriting the exported env var).
  Constructing the URL in only one place, before both processes start,
  avoids them silently drifting onto different connection strings.
- **`app_secret`** is read by the Node app itself, same as SMTP
  credentials, into `APP_SECRET` — a server-only key for HMAC-hashing
  low-entropy values at rest (currently just `Session.ipHash`; see D58).
  Not required — if absent, the app leaves `ipHash` null rather than
  hash it with no key.
- **The GitHub-token encryption key** (Module 6) is read by *both* `api`
  and `worker` independently, unlike every other secret in this list —
  `api` encrypts a token on admin entry (`POST /admin/github-tokens`),
  `worker` decrypts it right before the one GitHub API call that needs
  the plaintext. Both containers mount the same `github_token_key`
  secret; there is no cross-process handoff of the decrypted value.
- **The certificate-signing key** (Module 12, Ed25519) is read only by
  `api` — certificate rendering happens synchronously in the API's
  request thread, not in `worker`, so there's no second consumer the
  way there is for the GitHub-token key. A plain `openssl rand -hex 32`
  doesn't produce a valid Ed25519 key; `generate-certificate-signing-key.ts`
  exists specifically because this secret can't reuse that one-liner.

---

## 6. Authorization architecture

Three guard layers, all in `apps/api/src/{auth,authz}/guards/`:

1. **`SessionAuthGuard` (global, Module 1).** Resolves every request's
   session cookie to a `User`, attached as `req.user`. Protected by
   default — a route must opt out explicitly with `@Public()` (e.g.
   signup, login, `/health`) rather than every new protected route
   needing someone to remember to add a guard (D60).
2. **`MustResetPasswordGuard` (global, registered after
   `SessionAuthGuard`, Module 2).** An admin-created staff account with
   `mustResetPassword: true` can reach exactly one route
   (`POST /auth/set-password`, marked `@AllowWhileMustResetPassword()`)
   until it changes its password — every other route, with no
   exceptions, returns a specific `MUST_RESET_PASSWORD` error (D61).
3. **`EventRoleGuard` (per-route, via `@UseGuards` + `@RequireEventRole`,
   Module 2).** Resolves `:eventId` from the request path and checks the
   current user's `EventMembership` for **that event only** — never a
   global role flag. Fails loud (`InternalServerErrorException`) if
   applied without the matching decorator, rather than silently passing
   everything through (D62). `siteAdmin` bypasses this check, but every
   bypass writes an `AuditLog` entry (who, route, event, required role)
   — the power exists for genuine operational need, but it's never
   invisible.

This is the **only** authorization path in the system. There is no
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
rather than accidentally forgotten. **All fourteen currently-locked
modules (Auth & Email through Global Ranking) are implemented as of
this update.** Global Ranking introduced no new infrastructure, as
anticipated: its snapshot recompute job runs on the existing `worker`
container (Module 6, a new BullMQ queue alongside Module 6's own
verification queue), and its cache reads reuse the existing Redis
instance — same pattern as CAPTCHA/PoW state. Comments (Module 13)
introduced no new infrastructure either: rate limiting reuses the same
Redis-backed mechanism as voting/uploads. What's actually listed here
still has **no stage doc at all**:

- The shareable, not-yet-bound judge invitation link (Section 3.2 of
  Module 2's stage doc, bullet 2) — direct-add by known email is
  implemented; the generic link variant has no resolved data model yet
  (D64). Revisit before claiming Module 2 fully done.
- Bulk certificate download/export (D40) — deliberately optional/
  dropped scope, not something the locked Module 12 stage doc requires.
- REST API/webhooks, the *general* bulk import/export feature (T4 —
  distinct from Module 16's narrow fixtures.json path, which Global
  Ranking's historical-backfill path now depends on, per D154),
  pairwise judging mode, normalization proof, threat model doc,
  OpenAPI publication
- **A general seed step producing a "rich demo event" for a human
  judge to click around** — assumed already-built by both this doc and
  `docs/design/16-fixtures-import.md` §2, discovered not to exist at
  all when Module 16 was built (D171). What *does* exist now
  (`apps/api/src/scripts/seed.ts`) is the minimal fixture-import path
  only, not this broader demo dataset.

Resolved since the last update to this list — no longer undesigned:
**the `fixtures.json` bulk-importer (D167, Module 16)**, **CSV export
(D168)**, **seed-time auth-header bootstrap (D169)**, and
**`.dogfood.toml` itself (D170)** — see §9 below for where each landed.

Each remaining item will get its own `stages/NN-name.md` following the
same format as every module locked so far before any code is written
against it.

---

## 9. Acceptance checking (`run.py`) integration points

New as of the official spec review (D166–D170) — `dogfoodhack.com/
spec/` defines a narrow, fully mechanical checking layer distinct from
(and much smaller than) the fourteen-plus modules already built. Three
concrete integration points this system needs — all three now built
(Module 16, D171-D173):

1. **Seed-time header printing (D169) — implemented.**
   `apps/api/src/scripts/seed.ts`, invoked directly from
   `docker-entrypoint.sh` right after `prisma migrate deploy` (every
   boot, not a separate manual step). No general seed step existed
   before this module despite this section previously assuming one
   did — see D171. Prints the four `organizer`/`judge_a`/`judge_b`/
   `participant` `Cookie: raptor_session=...` headers to stdout on
   every boot; entirely separate from Module 1's real session system,
   which the checker never calls.
2. **The fixtures import path (D167) — implemented.**
   `apps/api/src/scripts/fixtures-import.ts`, called from `seed.ts`.
   A direct-write loader, not a route real users ever call, that
   takes the organizers' real `fixtures.json` (committed at
   `apps/api/prisma/fixtures.json`, the documented path) and
   materializes `Event`/`Track`/`User`/`EventMembership`/`Team`/
   `TeamMembership`/`Submission`/`SubmissionVerification`/
   `JudgeAssignment`/`Score`/`JudgeReview`/`ScoreRevision` rows
   directly — bypassing Module 6's verification pipeline and Module
   7's assignment gate entirely, since fixture repo URLs are fake and
   the checker runs with no network access. Idempotent across
   restarts via the new `FixtureImportRecord` table (see
   `DATA-MODEL.md` §16). Live-verified against the real file (40
   teams, 3 with duplicate names; 41 projects, 1 team's pair
   collapsing to a single submission per D172/Section 4b).
3. **A `peer_scores`-shaped endpoint — already existed, confirmed.**
   `GET /assignments/:id` (`ScoringController`,
   `apps/api/src/scoring/`) — ownership-checked in
   `getOwnedAssignmentOrThrow` (`assignment.judgeId !== userId` ->
   403 `NOT_ASSIGNMENT_OWNER`), enforced in the backend, not just a
   hidden template. `judge_scores` and `peer_scores` in
   `.dogfood.toml` point at the same URL by design — the check is
   which judge's session is attached, not a different route.

No new infrastructure was needed for any of the three — no new
container, no new secret, no new network boundary. All are
application-level code on top of the architecture already described in
§§2–7. What Module 16's build *did* surface as a real, separate gap:
this section's own seed-step assumption was wrong (D171) — the "rich
demo event for a human judge" this doc and the design doc both refer to
still doesn't exist; only the minimal fixture-import seed path does.

