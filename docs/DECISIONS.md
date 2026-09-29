# DECISIONS.md

A chronological log of every significant decision made during planning,
in the order they were settled. Each entry captures what was decided,
why, and what was considered and rejected — so a rule that looks
arbitrary in isolation can be traced back to its reasoning instead of
being re-litigated or accidentally reversed during implementation.

Format: **Decision** / Context / Alternatives rejected.

---

## Scope & tech stack

**D1 — Full T1→T4 plus all four bonus challenges is the target, built in
verified phases.**
Context: the brief rewards honest, verified tier claims over inflated
ones. Committing to the full ladder up front is fine as an ambition, but
each phase must be actually run and tested before being called done —
overclaiming (paper-only completeness) is explicitly penalized by the
brief's own scoring rubric.
Rejected: attempting to generate the entire platform in one pass. Would
produce exactly the "AI slop" the project is trying to avoid.

**D2 — Stack: TypeScript end-to-end — NestJS (API), Next.js (web),
PostgreSQL + Prisma, Redis, Docker Compose, pnpm monorepo.**
Context: one language across the stack simplifies future AI-integration
work (all major LLM SDKs have first-class TS support) and avoids a
frontend/backend type-drift boundary. NestJS's DI/guard system is the
actual mechanism backend-enforced role isolation runs on — not a
stylistic preference, a structural requirement of the brief (Fig. 02).
Rejected: Python/FastAPI (fine framework, but splits the language from
the frontend); a Next.js-only full-stack app (weaker guard/DI story for
the isolation requirements).

---

## Auth & email (Module 1)

**D3 — Sessions are opaque server-side tokens in HttpOnly cookies, not
JWTs.**
Context: instant revocability is required for logout and future
account-banning to actually take effect immediately. JWTs can't be
un-issued without extra infrastructure.
Rejected: JWT-in-localStorage (also an XSS exposure risk, since JS can
read localStorage but not an HttpOnly cookie).

**D4 — argon2 for password hashing.**
Context: memory-hard, current best-practice default, better GPU-cracking
resistance than bcrypt.

**D5 — SMTP integration is provider-agnostic (plain SMTP credentials via
Docker secrets), never a provider-specific API (no Gmail OAuth Send API,
no SendGrid/Postmark REST API).**
Context: "no third-party hosted service" means no *hardcoded
integration against one vendor's API* — plain SMTP still allows pointing
at literally any provider that speaks SMTP, including Gmail's SMTP relay
if someone wants that. One code path for sending mail, in every
environment.

**D6 — No local mail-catcher container (Maildev/MailHog). Rejected after
being initially proposed.**
Context: a mail-catcher has zero use case in a real deployment — pure
demo scaffolding that becomes dead weight in the actual product.
Rejected in favor of: seed data being pre-verified directly in the
database (no email needed for the demo to look complete), plus
`TEST_MODE` (D7) for the one place the real signup→verify round-trip
needs automated testing.

**D7 — `TEST_MODE` flag, off by default. When true: verification token is
both logged to stdout (for the acceptance suite to read) AND a real email
is still sent through configured SMTP, clearly subject/body-labeled as a
test message.**
Context: went through several iterations —
  1. First proposal: log-only. Rejected — no way to validate the real
     send path.
  2. Second proposal: a dev-only API endpoint exposing the pending token.
     Rejected — one flag is simpler than a flag plus a conditional route.
  3. Third proposal: send-only (real email, no logging), with the
     acceptance suite relying only on pre-verified seed data and skipping
     live-flow testing entirely. Considered, but leaves a real
     coverage gap for T1's "authentication actually works end to end."
  4. Final: log AND send, both gated behind the same single flag —
     covers both needs (automatable + humanly verifiable) through one
     mechanism.
Never enabled by default; loudly documented in `.env.example`.

**D8 — Login is not gated on email verification.** A user can log in
unverified and browse; verification is required only for actions that
need it later (e.g. voting eligibility).

---

## Roles & Membership (Module 2)

**D9 — Two account tracks, decided at creation, permanent: participant
(self-service signup) vs. staff (admin-created only, role = JUDGE or
ORGANIZER, chosen once, never edited afterward).**
Context: user explicitly wanted role confusion eliminated at the
identity level, not just the per-event level. If one person needs both
hats, that's two separate accounts with two separate emails — a
deliberate simplification that removes an entire category of
conflict-of-interest bug.
Rejected: per-event-only role scoping with no account-level exclusivity
(the initially proposed model) — replaced once the user clarified they
wanted platform-wide exclusivity, not just per-event.

**D10 — JUDGE and ORGANIZER are mutually exclusive, permanently, at
account creation. No later edit, even by admin.**
Context: same reasoning as D9. A confirmation step (D11) exists
specifically because this can't be corrected after the fact.

**D11 — Admin must explicitly confirm before a staff account is created,
because the role assignment is irreversible.**
Context: added specifically as the one safety net against a
fat-fingered role selection, given D10 removed any "edit it later"
escape hatch.

**D12 — Organizer event-attachment: direct and immediate, no
accept/decline step.** Judge event-attachment: invitation with
accept/decline/expire, deadline at `eventStartsAt`.
Context: organizer accounts are already fully vetted by admin at
creation (D9-D11); no additional per-event consent step is needed.
Judges are recruited more loosely and may be double-booked or
uninterested in a specific event even though they're a known-good judge
generally — consent per event matters more for that role.

**D13 — Judge invitation deadline is always computed live against
`event.eventStartsAt`, never a frozen snapshot taken at invite time.**
Context: initially modeled as a snapshot (`respondByAt`), then reversed
once Module 3 established that event timestamps can be edited after
publication — a snapshot would silently go stale if `eventStartsAt`
moved. Resolved in Module 3's design, propagated back into Module 2's
doc.

**D14 — `siteAdmin` bypasses per-event authorization checks, but every
bypass writes an `AuditLog` entry.**
Context: the power is operationally necessary (fixing a stuck event,
resolving disputes) but must never be silent.

---

## Event Management (Module 3)

**D15 — Two independent concepts: `EventStatus` (manual: `DRAFT →
PUBLISHED → ARCHIVED/DELETED`) and `EventPhase` (fully computed from
`now()` vs. timeline timestamps, never stored).**
Context: an earlier draft included a manual `ACTIVE` status, which was
dropped as redundant once phase already expressed the same information
via computation. Two axes (a deliberate decision vs. where the clock
currently sits) turned out to be clearer than one conflated enum.

**D16 — Editing is fully open while `DRAFT`; phase-aware once
`PUBLISHED` (future timestamps can be pushed later, never pulled earlier
than what's already been acted on; a timestamp whose phase has already
passed becomes immutable).**
Context: freely editing timestamps after people have made decisions
against them (registered, been invited) is dangerous; fully locking
everything at `PUBLISHED` is too rigid (extending a deadline should
always be safe).

**D17 — Slug is editable only in `DRAFT`; immutable forever once
`PUBLISHED`.**
Context: shared links/bookmarks depend on slug stability once public.

**D18 — Rich text (event/track descriptions) is authored as markdown,
never WYSIWYG-HTML, with a client-side preview and identical
sanitization on both preview and production render.**
Context: storing raw HTML from an editor reopens the same XSS class of
issue the certificate-template sanitization exists to prevent — even
from a "trusted" organizer, since that's still a second party whose
input renders in every visitor's browser. Markdown source is also more
portable for future bulk export.

**D19 — File uploads (poster/thumbnail): local disk only, fixed size and
dimension limits, magic-byte content validation (never extension or
client MIME type), no SVG, mandatory server-side re-encode (strips EXIF,
neutralizes polyglot exploits), UUID filenames, served through a
dedicated route with content-type set from the re-encoded file.**
Context: direct response to "make sure to secure it like file uploading
vulnerability" — each control maps to a specific real attack (extension
spoofing, decompression bombs, EXIF privacy leakage, polyglot files,
path traversal via original filenames).

---

## Team Management (Module 4)

**D20 — Registration and team formation are fully decoupled. Every
registration is solo by default; team creation is a separate, later,
optional action.**

**D21 — Team names are permanently immutable.**
Context: removes the question of whether a join-link's name-derived
prefix needs to update on rename — by making rename impossible, the
question doesn't arise at all.

**D22 — Team admin is a fixed, non-transferable role. The admin can only
leave by first kicking every other member down to zero, then either
regenerating the link (staying solo) or deleting the team outright.**
Context: eliminates ownership-transfer logic and the "orphaned team"
edge case entirely, by construction — a team is never without an admin
at any point in its lifecycle, because the only way the admin's
relationship ends is by destroying the team.
Rejected: auto-transfer to the earliest-joined remaining member (an
earlier proposal, superseded once the user specified the kick-first
model).

**D23 — Join link format: `team-{slugified-name}-{6-digit-random}`.
Regeneration changes only the 6-digit suffix.**
Context: made simple/shareable rather than cryptographically unguessable
— the consequence of a leaked code (an unintended join) is low-severity
and fully recoverable (kick + regenerate), so usability was prioritized
over brute-force resistance (though the join endpoint is still rate
limited).

**D24 — Attempting to join a second team for the same event (or a solo
submission while on a team, or vice versa — extended in Module 5) is a
hard reject with a clear message. Never a silent auto-swap or merge.**
Context: an automatic swap could abandon a team without anyone noticing.

**D25 — No `minTeamSize`. A team can be just its admin, up to
`maxTeamSize`.**

**D26 — Team roster lock is keyed to `Submission.everSubmitted`
(permanent once true), not the live `isDraft` flag.**
Context: initially modeled as "locked once submitted," which left an
open gap once `unsubmit` was introduced (Module 5) — would the roster
reopen if a team unsubmitted to keep editing? Resolved: no. Once a team
has ever finalized a submission, the roster is frozen permanently,
regardless of later unsubmit/resubmit cycles. Team composition at first
submission is the anchor point everything downstream (judging,
certificates) depends on.

---

## Submission Management (Module 5)

**D27 — Field set deliberately minimal for the current stage: title,
markdown description, repo URL, demo video URL, live URL. No thumbnail,
no image gallery, no tech tags.**
Context: explicitly descoped by the user from an earlier, larger draft
that included images and tags — more fields may be added additively in
later modules, but the schema shouldn't carry speculative fields now.

**D28 — Solo and team participation are mutually exclusive per event,
same hard-reject pattern as D24.**

**D29 — Track attachment mode (`NONE | SINGLE | MULTIPLE`) is an
event-level configuration choice, not a fixed platform rule.**

**D30 — Single `Submission` table with an `isDraft` flag, not two
separate draft/final tables.**
Context: considered a two-table split (draft table + promoted final
table) for stronger structural separation, but rejected once it became
clear that unsubmit/resubmit (a required capability) would require a
copy-back-and-delete operation between two tables — a flag flip on one
table achieves the same guarantees more simply.

**D31 — `submittedAt` always reflects the most recent submit action, not
the original first submission.**
Context: initially left open, later reversed from an initial default of
"retain original" once the user specified "most recent" directly.

**D32 — `everSubmitted: Boolean`, separate from `isDraft`, set once and
never reset. Introduced specifically to give Module 4's roster lock
(D26) something permanent to key off, since `isDraft` alone can't
distinguish "never submitted" from "submitted once, currently
unsubmitted."**

**D33 — Draft visibility: organizers see nothing (not even existence);
admin sees a list (existence + ownership) but not content; the
owner/team sees full access to their own.**
Context: a deliberate, non-obvious asymmetry the user specified directly
— organizer visibility is more restricted than admin visibility, not
equal to it.

---

## Certificates (discussed in depth, stage doc not yet written)

**D34 — Certificates are never stored as rendered images. Only
`payloadJson` (the facts) and an Ed25519 `signature` over that payload
are persisted; SVG/PDF are rendered on demand from the record.**
Context: user's explicit instruction. Benefits beyond storage: template
redesigns don't retroactively alter already-issued certificates'
underlying data; verification means recomputing a signature over JSON,
not re-parsing a rendered file.

**D35 — SVG is the canonical template format (not HTML/CSS, not
HTML-in-`<foreignObject>`).**
Context: HTML→SVG conversion without a headless browser isn't reliably
possible, and headless Chromium was rejected as a dependency (violates
laptop-friendly/lightweight goals). `foreignObject` was considered as a
middle ground but rejected — the lightweight SVG→PDF converter path
doesn't reliably render it, which would make the SVG view and PDF
download silently inconsistent.

**D36 — Organizer-uploaded SVG templates are sanitized (strip
`<script>`, `on*` attributes, `foreignObject`, external resource
references) before storage, using a real XML DOM parser for token
substitution — never string/regex replacement.**
Context: SVG can legally contain executable script; an uploaded template
is a real XSS vector, not a hypothetical one, given organizers are a
second party whose input renders in every viewer's browser.

**D37 — Caching: yes, keyed by `(certificateId, templateVersion,
format)`.** Redis-backed, since Redis already exists in the stack for
other reasons.
Context: template edits bump the version, which naturally invalidates
stale cache entries without an explicit invalidation step — old cached
renders simply become orphaned/irrelevant.

**D38 — Certificate ID is a UUID — unguessable and non-sequential by
default, satisfying the "shareable but not enumerable" requirement
without extra design.**

**D39 — Access: public can view (including the recipient's name, no
privacy toggle) and verify; only the certificate's owner or an
organizer/admin scoped to that specific event can download the PDF.**
Context: organizer/admin download access is scoped per-event, same
isolation principle as everything else — an organizer for Event A cannot
download Event B's certificates.

**D40 — Bulk certificate download/export was designed (filters, ZIP
output, async job + separate worker container to avoid CPU contention
with other users) and then explicitly dropped as non-mandatory scope.**
Context: user's call — kept lean, easy to reintroduce later since the
per-certificate render/cache/template pieces don't change at all; bulk
was purely an aggregation layer on top.

---

## Voting (discussed in depth, stage doc not yet written)

**D41 — Quadratic voting does not solve Sybil/multi-account abuse — it
solves a different problem (stopping a few real people from dominating
via concentrated influence). This distinction was surfaced explicitly
because the brief itself conflates the two.**

**D42 — Public voting is single-choice: one user, one pick, per voting
round. Quadratic voting is dropped for public voting as a direct
consequence** (QV requires a voter to be able to spread/weight votes
across multiple options; single-choice makes that moot). Bradley-Terry
pairwise mode remains unaffected — it's a judge-side mechanism, not a
public-voting one.

**D43 — Voting eligibility is an organizer-chosen mode per event:
participants-only, or any verified-platform-wide user.**

**D44 — Account-age gate for voting eligibility: must be registered
before `event.eventStartsAt`.**
Context: several other candidate anchor timestamps were considered
(`registrationOpensAt`, `votingOpensAt`) — `eventStartsAt` was the user's
explicit final choice.

**D45 — CAPTCHA is self-built, never third-party (no Google/hCaptcha) —
required by the platform's own no-hosted-dependency rule, not just
preference. Combination of an invisible proof-of-work challenge on every
vote plus a visible image challenge that only surfaces adaptively when
abuse signals are already elevated.**

**D46 — Vote tallies are hidden from participants/public during voting;
after results are published, the public sees percentage and total count
only — the per-voter breakdown (who voted for whom) is never exposed
publicly at any stage, published or not.**

**D47 — IP-based multi-account detection flags for admin review; it does
not auto-block or auto-ban.** Consistent with the "audit trail over
automation" principle applied everywhere else.

**D48 — Admin bans are by email, which also blocks re-registration with
that email, not just the existing session/account.**

**D49 — Voting supports minor in-place corrections (cosmetic only —
typos, wrong-project swaps) with zero effect on already-cast votes, and
separately supports a full round restart (deactivate current round,
start a fresh one from scratch, no vote carryover, eligibility fully
resets) available only in the window between `resultsAnnounceAt` and
`eventClosedAt`, unlimited in number, fully audited with a mandatory
reason field on every restart.**
Context: iterated through several intermediate models (partial
carryover, pre-populated shortlist on restart, limited restart count)
before settling on the simplest version: cosmetic edits never touch
votes; anything bigger is a full, transparent, zero-carryover restart.

**D50 — Shortlist for public voting is auto-suggested (top N by judge
rank) but freely organizer-adjustable (add/remove any submission), and
becomes locked once published alongside `resultsAnnounceAt`.**

---

## Setup & infrastructure

**D51 — pnpm monorepo, not npm/yarn.** Stricter dependency boundaries
between workspace packages, faster installs.

**D52 — Docker network segmentation: `data-net` (Postgres/Redis, no host
ports published) and `app-net` (api/web).** See `ARCHITECTURE.md` §4.
Context: raised directly by the user as a question ("can we create
separate networks to keep everything separate") — adopted as a real
hardening measure, not just organizational tidiness.

**D53 — A `Makefile`/root npm-scripts wrapper around common commands
(`up`, `seed`, `test`, `acceptance`) — proposed, not yet confirmed by the
user; revisit before scaffolding tooling.**

---

## Auth & Email implementation (Module 1, filled in during build)

**D54 — Email verification token is stored as two nullable columns
directly on `User` (`verificationTokenHash`, `verificationTokenExpiresAt`),
not a separate table.**
Context: Module 1's stage doc says the token must be "stored hashed,
never stored raw" but doesn't specify a table shape, and neither does
`DATA-MODEL.md`. Two existing patterns already exist in this project:
`Session` is a separate table (because a user legitimately has many
concurrent sessions), while judge-invitation tokens live as columns
directly on `EventMembership` (because there's at most one outstanding
invitation per membership at a time). Email verification matches the
second case — a user has at most one outstanding verification token —
so columns-on-`User` was chosen over inventing a new table pattern.
**Not cleared on successful verification.** `emailVerifiedAt` is what
gates single-use/idempotent-replay behavior (Section 3 of the stage
doc: "hitting an already-verified account's link again is idempotent").
Clearing the hash on success would break that — a repeat hit on the
same link would find no matching user at all (hash is null) and return
"invalid token" instead of the required idempotent no-op. Overwritten
(invalidating the previous token) on signup and on every resend, same
invalidate-old-issue-new pattern used everywhere else in this project.

**D55 — `bannedByUserId` (audit: who issued a ban) is deferred from
`User`, even though `DATA-MODEL.md`'s narrative lists it.**
Context: no ban-issuing endpoint exists in any locked stage doc yet
(only Module 1's signup-time rejection check, which only needs
`bannedAt`/`bannedReason`). Adding an audit column with no code path
that ever sets it is speculative; it arrives with whichever future
module actually designs the ban-issuing action (see D47/D48 in the
voting section above, the only place admin bans are discussed so far).

**Open, flagged back rather than decided — whether a banned account can
still log in.** The stage doc only specifies blocking *signup* with a
banned email; it's silent on whether an existing banned account can
still authenticate. Implemented as: login is also blocked for banned
accounts (`ACCOUNT_BANNED`), on the reasoning that allowing full login
while only blocking fresh signups would be an inconsistent half
-enforcement. This is a judgment call, not a confirmed decision — revisit
if the eventual ban-issuing module wants different behavior (e.g. a
distinct "account banned, here's why" page instead of an opaque 403).

**D56 — Pending migrations are applied automatically on every container
boot (`prisma migrate deploy`, run from a shell entrypoint before the
Node process starts), and the Postgres-password secret is read by that
shell entrypoint rather than by the TypeScript app.**
Context: `docker compose up` is required to produce a fully working,
seeded instance with zero manual steps (CLAUDE.md's no-hosted-dependency
principle; the brief's Adoptability scoring). Without auto-migration, a
fresh deployment's tables would simply not exist until someone ran a CLI
command by hand. `prisma migrate deploy` is a separate OS process from
the Node app, so it needs its own `DATABASE_URL` before the app has had
any chance to construct one in TypeScript — a shell entrypoint
(`apps/api/docker-entrypoint.sh`) that builds `DATABASE_URL` once and
exports it before running *both* the migration step and `exec node
dist/main.js` is the only way to guarantee both processes agree on the
same connection string, rather than two copies of the same
URL-construction formula (one in shell, one in TypeScript) silently
drifting apart. `prisma` moved from a devDependency to a runtime
dependency in `apps/api/package.json` as a consequence — the CLI has to
actually be present in the production image to run this.
Rejected: constructing `DATABASE_URL` in TypeScript only (as originally
written into `ARCHITECTURE.md` §5 before this module's implementation) —
works fine for the app process itself, but leaves the separate `prisma
migrate deploy` step with no connection string of its own.

**D57 — Non-Docker local dev uses a dedicated Postgres installed
directly on the host, on port 5433, loaded via `apps/api/.env`
(`dotenv`), not the Docker-managed instance.**
Context: user's explicit direction — use a real local Postgres for
day-to-day development, keep the Docker-managed one for the "real"
`docker compose up` path, and make sure the split is actually wired into
env config rather than left implicit. Port 5433 (not 5432) was chosen
deliberately so it can't collide with any other Postgres already
running on the host — this machine happened to have an unrelated one
already listening on 5432. `dotenv` added as a dependency, loaded as the
first statement in `main.ts`; its default "never override an
already-set variable" behavior is exactly what's needed so Docker's own
`environment:` blocks always win inside a container, where no `.env`
file exists at all (gitignored, and excluded in `.dockerignore`).
Verified end-to-end against this real instance during Module 1's
build: ran the actual `prisma migrate dev` (not just `validate`
/`generate` against a placeholder URL), and a real
signup → verify → re-verify (idempotent replay) → login →
`/auth/me` round trip, including confirming in the database directly
that `verificationTokenHash` is genuinely not cleared on success (D54).

**D58 — Two fixes applied after a post-implementation rules check on
Module 1, both found by re-reading the committed code, not by the stage
doc:**

1. **Signup's existence check and insert were two separate round
   trips with no transaction** — a classic check-then-act race. Two
   concurrent signups for the same email could both pass the
   "does this exist" `findUnique` before either `create()` landed; the
   loser's `create()` then threw an unhandled Prisma `P2002`
   (unique-constraint violation), surfacing as a raw 500 instead of the
   intended `409 EMAIL_ALREADY_REGISTERED`. Fixed by catching `P2002` on
   the `create()` and re-querying to produce the same accurate
   banned-vs-already-registered error the up-front check gives,
   extracted into a shared `rejectExistingEmail()` helper so the two
   call sites can't drift. A transaction wouldn't have helped here
   (Postgres's unique index still enforces atomicity at the `create()`
   regardless); the fix is in handling the expected failure mode, not
   preventing it.
2. **`Session.ipHash` was `sha256Hex(ip)` — an unkeyed hash of a
   low-entropy value.** IPv4 address space is only ~4 billion values;
   anyone can precompute every possible hash in seconds and fully
   reverse it. This isn't what "hashed" is supposed to buy here (compare
   session/verification tokens, which are 256-bit random and genuinely
   one-way under a plain hash). Fixed with a new `APP_SECRET`
   (HMAC key, same Docker-secrets pattern as SMTP credentials — see
   `secrets/app_secret.txt.example`), used via a new `hmacSha256Hex()`
   in `crypto.util.ts`. If `APP_SECRET` isn't configured, `ipHash` is
   left `null` rather than falling back to an unkeyed hash that would
   only look safe — `ipHash` is already nullable and non-critical
   (stored for a future "active sessions" view, not read by any
   security decision yet), so "no value" is strictly better than "a
   value that doesn't do what its name implies."

---

## Roles & Membership implementation (Module 2, filled in during build)

**D59 — A deliberately minimal `Event` table (just `id`, `name`,
`eventStartsAt`) is introduced now, inside Module 2, even though Event
Management is Module 3.**
Context: Module 2's own stage doc assumes `Event` already exists —
"the user who creates an event (`POST /events`) automatically becomes
that event's first organizer," and the judge-invitation deadline is
`event.eventStartsAt` — but `Event` is explicitly Module 3's scope, and
the numbered build order puts Module 3 after Module 2. Flagged back to
the user rather than decided silently; three options were offered
(minimal anchor now / build Module 3 first / ship Module 2 partially
and come back). **User chose the minimal anchor.** Module 3 extends this
same table additively — slug, description, status/phase, the full
timeline, tracks, prizes, file uploads — exactly the same
build-additively pattern already used for `Submission`'s deliberately
minimal field set (D27). The minimal `POST /events` built here is a
throwaway stub Module 3 will replace wholesale, not a preview of that
module's design.

**D60 — `SessionAuthGuard` became a global guard with a `@Public()`
opt-out, instead of staying a per-route `@UseGuards(SessionAuthGuard)`
the way Module 1 left it.**
Context: Module 2's stage doc frames the guard architecture ("every
privileged route... never a global role flag") as the pattern every
module after this one builds on. Manually remembering to add a guard to
every new protected route, across ten more modules, is exactly the kind
of thing that eventually gets forgotten once — a global guard makes
"protected" the default and "public" the explicit, reviewable
exception. Caught live during verification: `/health` broke (401) the
moment this shipped, because it had no `@Public()` — fixed immediately,
but it's a real example of the failure mode this pattern is meant to
prevent for every *other* route going forward (the cost of forgetting
shifts from "silently unprotected" to "loudly broken and caught
immediately").
Rejected: leaving `SessionAuthGuard` opt-in per route — matches what
Module 1 shipped, but doesn't scale to "every module after this one."

**D61 — `MustResetPasswordGuard` is also global (registered after
`SessionAuthGuard`), with a matching `@AllowWhileMustResetPassword()`
opt-in applied to exactly one route.**
Context: Section 2.3 step 5 says a locked account can reach
`POST /auth/set-password` and "no other route" — taken literally,
including `/auth/logout` and `/auth/me`. The login/signup response
itself now includes `mustResetPassword` (see `toPublicUser()` in
`auth.service.ts`) specifically so a frontend can route straight to the
set-password screen without ever needing to call `/auth/me` while
locked — resolving what otherwise looks like a UX dead end without
carving out an undocumented exception in the guard.

**D62 — `EventRoleGuard` throws a loud `InternalServerErrorException` if
applied to a route with no `@RequireEventRole` metadata, rather than
silently allowing the request through.**
Context: not written anywhere in the stage doc, but consistent with
this project's repeated stance that authorization code must fail
closed. A guard class applied without its matching decorator is a
programming mistake, not a real authorization state — failing loud
during development is far cheaper than silently open access in
production.

**D63 — Admin confirmation for staff-account creation uses the stage
doc's own "simpler alternative": `confirm: true` on the *same* request,
not a second `/admin/staff-accounts/confirm` call.**
Context: Section 2.3 step 2 explicitly offers both as acceptable
("e.g. a second... call, or a confirmation flag on the same request
after a review screen"). The second-call version would need a stateful,
short-lived confirmation token with its own expiry and storage — real
complexity for a rarely-used admin action, when the doc already blesses
a simpler shape. `@Equals(true)` on the DTO means confirm missing or
false is rejected before the controller method runs at all; verified
live against the real DB that omitting it creates nothing.

**D64 — The shareable, not-yet-bound judge invitation link (Section
3.2, bullet 2) is not implemented — direct-add (by known email) is
fully implemented; the link variant is flagged as deferred, not
decided.**
Context: the doc says both "produce the same underlying record," but a
link isn't addressed to a specific user at creation time — there's no
`userId` to put on an `EventMembership` row until someone claims it,
and the doc shows no "unclaimed invitation" shape anywhere. This is a
genuine data-model gap, not an implementation detail, and didn't seem
worth inventing under time pressure given how large the rest of this
module already was. Revisit explicitly before claiming this part of
Section 3.2 done.

**D65 — Judge-invitation emails are not routed through `TEST_MODE`.**
Context: Module 1's stage doc scopes `TEST_MODE` to exactly one call
site (verification-email dispatch) and explicitly calls a second call
site "scope creep... flag it and reverse." Judge invitations instead
just log the link at `WARN` when SMTP isn't configured — enough for
local/dev visibility without touching the flag Module 1 deliberately
kept narrow. The acceptance suite, if it needs to test accept/decline
without real inbox access, has the same options this project's own
verification did: read the link from logs, or drive it at the service
layer directly.

**D66 — `prisma` stayed a dependency (not dev-only, per D56) and the
Docker entrypoint now supports `exec "$@"` when the container is invoked
with an explicit command** (`docker compose run --rm api node
dist/scripts/bootstrap-admin.js`), **falling through to the default
migrate-then-serve behavior otherwise.**
Context: Section 2.4 requires `siteAdmin` provisioning to happen
"outside normal app flow entirely" — no in-app button, ever. That still
requires *some* runnable path in production, and it needs the same
`DATABASE_URL` the entrypoint already constructs once (D56) — without
this, the only way to reuse that construction would be a third copy of
the same formula. Standard Docker entrypoint idiom; this is the only
sanctioned way `scripts/bootstrap-admin.ts` is ever meant to run in a
real deployment.

**D67 — Two vulnerabilities found during a full security review of
Modules 1–2, both confirmed by live measurement (not just read from the
code) and fixed immediately:**

1. **Login had a ~25x timing side-channel that leaked which emails are
   registered.** `login()` returned on "no such user" *before* ever
   calling `argon2.verify()` — measured live: ~72ms for a real email
   (wrong password) vs. ~2.8ms for a nonexistent one, trivially
   distinguishable over a real network, and the identical error message
   did nothing to stop it. Fixed by always calling `argon2.verify()`
   first — against the real `passwordHash` if the user exists, or a
   fixed, precomputed `DUMMY_PASSWORD_HASH` (no corresponding real
   password) if not — and only branching on "user exists / password
   valid / banned" *after* that call resolves. The banned-account check
   moved to *after* the password verify for the same reason (telling an
   attacker "this account exists and is banned" before checking their
   password was the same class of leak, just smaller). Re-measured live
   after the fix: ~68ms vs. ~58ms — the 25x gap collapsed to ~1.15x,
   consistent with ordinary system noise rather than a reliable signal.
2. **`EventMembership` API responses leaked `invitationTokenHash`.**
   Every method in `MembershipService` returned the raw Prisma row,
   unlike `AuthService`'s `toPublicUser()`. Confirmed live: the
   organizer dashboard and every invite/resend/accept response included
   the hash. Not a direct account-takeover vector (it's a one-way
   hash), but pure unnecessary exposure of internal security material.
   Fixed with a `toPublicMembership()` mapper (same data-minimization
   principle as `toPublicUser()`), applied at every method that returns
   a membership to a controller — confirmed live that the field is gone
   from every response and the accept/invite/resend flows still work
   end to end.

Both have regression tests. The timing fix's test asserts wall-clock
duration (`argon2.verify`'s native export isn't spy-able — attempting
`jest.spyOn` on it throws `Cannot redefine property`) rather than call
count; the token-hash fix has a dedicated "never returned to a caller"
test suite covering every public method.

---

## Event Management implementation (Module 3, filled in during build)

**D68 — `Event.slug` is auto-generated from `name` (slugified) if not
explicitly provided, and is otherwise a normal organizer-editable field
while the event is still DRAFT.**
Context: the stage doc says slug is "editable only while `status =
DRAFT`" — implying it's a real, edited field, not purely derived and
frozen forever like `Team.name` (D21) — but never says how it's
produced initially. Auto-generating from `name` (with a numeric suffix
on collision — `resolveUniqueSlug()`) matches the common pattern for
this kind of URL slug and means an organizer who doesn't care can
ignore the field entirely at creation time.

**D69 — A `NOT_STARTED` phase value fills the gap between a PUBLISHED
event and `registrationOpensAt`, which the stage doc's phase list
doesn't name.**
Context: the doc explicitly supports "an organizer wanting an upcoming
event visible for early hype, before registration even opens" (Section
8), but its phase enum starts at `REGISTRATION_OPEN` — there's no named
phase for a PUBLISHED event sitting before that boundary. Reused
`NOT_STARTED` rather than inventing new vocabulary, since the doc
already uses that exact term for a DRAFT event's phase ("NOT_STARTED /
null") — `computeEventPhase()` still returns `null` for DRAFT
specifically, so the two states remain distinguishable (a frontend can
tell "not published at all" apart from "published, just hasn't started
yet").

**D70 — An event can be soft-deleted directly from DRAFT, not only from
PUBLISHED.**
Context: the status diagram (`DRAFT → PUBLISHED → ARCHIVED ↘ DELETED`)
visually branches DELETED off PUBLISHED only. Blocking a DRAFT event —
one nobody has registered, submitted, or been invited against — from
ever being abandoned seemed like an unintended gap in the diagram
rather than a deliberate restriction, especially given CLAUDE.md's
general "nothing gets silently destroyed, but abandoning unstarted work
should be easy" spirit elsewhere (e.g. Team deletion, Module 4). Not
allowed from ARCHIVED, which is treated as a settled terminal state.

**D71 — Uploaded posters/thumbnails are always re-encoded to JPEG,
regardless of whether the input was JPEG, PNG, or WebP.**
Context: Section 7.2 says files are "re-encoded fresh to a clean
JPEG/PNG/WebP" — one of the three, not necessarily the original. Always
producing JPEG keeps the serving route's behavior simple and
predictable rather than needing to track and reproduce the original
format per stored file. Trade-off: a PNG uploaded for its transparency
loses that (flattened during re-encode) — acceptable for event
posters/thumbnails, which are photos in practice, not graphics relying
on an alpha channel.

**D72 — Upload rate limiting (Redis-backed) fails OPEN, not closed, if
Redis is unreachable.**
Context: this is anti-abuse, not authorization — CLAUDE.md's
fail-closed stance is specifically about authorization checks (a role
guard failing open would be a real vulnerability). Losing the rate
-limit guard temporarily during a Redis outage is an acceptable
degradation; silently blocking every upload because an unrelated piece
of infra is down is not. 20 uploads/hour/user is an arbitrary but
reasonable default — the stage doc requires *that* uploads are rate
limited, not a specific number.

**D73 — `sanitize-html` is pinned to an exact version (`2.13.1`, not
`^2.13.1`) instead of a caret range.**
Context: toolchain compatibility, not a design decision, but worth
recording so a future `pnpm update` doesn't silently reintroduce the
problem. `sanitize-html@2.17+` depends on `htmlparser2@12`, which
switched to ESM-only exports with no CommonJS entry point — this
project's apps/api is CommonJs throughout (see D2), and Jest's default
transform pipeline can't load that package, breaking every test that
imports `MarkdownService` transitively. `2.13.1` depends on
`htmlparser2@^8`, the last version with a working CJS `main` export.

**D74 — Tracks and Prizes have no DELETE endpoint.**
Context: the stage doc explicitly flags track removal as unresolved
("not resolved in this stage; flag if it comes up during Module 5") —
prizes can reference a track, so the same caution extends to them.
Building delete now would mean inventing the answer to a question the
doc deliberately left open. Create and update (PATCH) are fully
implemented for both.

**Infrastructure note, not a design decision:** attempted to install
Memurai (a Redis-compatible server for Windows) locally, the same way
PostgreSQL was installed for Module 1 (D57). Its MSI installer failed
with `SFXCA: Failed to create temp directory. Error code 5` inside a
sandboxed custom action — an environment-specific obstacle, not
something fixable from install flags. Redis-dependent code
(`RateLimitService`, rate-limited upload endpoints) is implemented
against a real `ioredis` client and unit-tested with a mocked one; live
verification against a real Redis is deferred until Docker is
available, same posture already recorded for Docker itself.

## Team Management implementation (Module 4, filled in during build)

**D75 — Three minimal anchors built ahead of their owning module, same
pattern as D59: a participant event-registration endpoint, `Event.
maxTeamSize`, and a minimal `Submission` table (`id`, `teamId`,
`everSubmitted`, `createdAt` only).**
Context: Module 4 structurally depends on all three existing, but none
is named in Module 2 or Module 3's own stage doc — `POST
/events/:eventId/register` (self-service, any `PARTICIPANT`-track
account, immediately `ACCEPTED`, D20) isn't claimed by either prior
module; `maxTeamSize` was already self-flagged as "Module 4's field" in
DATA-MODEL.md's own Module 3 annotations; `Submission.everSubmitted` is
needed now because the roster lock (D26) reads it. Each anchor is built
to the smallest shape that satisfies what Module 4 actually reads —
Module 5 is expected to extend `Submission` additively with its full
field set (D27-D32), not redefine it.

**D76 — The join-link prefix is `slugify(team name)` alone — no
separate literal `"team-"` constant prepended on top.**
Context: both the stage doc's format line and D23's planning-time
wording read as `"team-" + {slugified-team-name} + "-" + {6-digit}`,
which looks like a literal `"team-"` constant followed by the slug. But
the stage doc's own worked example (name `Team Xmass` -> `team-xmass
-482913`) only resolves under a different reading: slugifying the full
name `"Team Xmass"` already produces `"team-xmass"` on its own (the
word "Team" is part of the *name*, not a separate template piece) — so
a literal `"team-"` prepended on top would double it to
`"team-team-xmass"`, which the example doesn't show. Implemented as
`joinLinkPrefix = slugify(name)`, with no added constant. Caught by a
unit test (`createTeam` test asserting the derived prefix) failing
against the first, literal-prefix implementation.

**D77 — No generic "leave team" action exists for a non-admin member.**
Context: Section 6/8 of the stage doc enumerate membership-management
actions exhaustively — join (via link), kick, regenerate link, delete —
and every one of them is admin-exclusive. A member who wants off a team
has to ask the admin to kick them; there's no self-service exit. Read as
deliberate (keeps team composition always admin-controlled under D22),
not an oversight, but flagged in a code comment in `teams.service.ts`
in case that reading is wrong.

**D78 — Team-management routes are not event-scoped in the URL, except
`POST /events/:eventId/teams` (creation, where the event context is
required input).** `POST /teams/join`, `POST /teams/:id/regenerate-link`,
`DELETE /teams/:id/members/:userId`, and `DELETE /teams/:id` all take
just the team id (or, for join, the globally-unique join code) — no
`eventId` in the path.
Context: the stage doc's own literal endpoint shapes use exactly these
non-nested paths. A team id (like an invitation-response token, D13's
sibling pattern) is already globally unique, so there's no ambiguity an
`eventId` prefix would resolve — it would be redundant routing, not
added safety, since every handler still loads the team row and checks
admin/membership against it directly.

**D79 — `registerForEvent`'s returned `EventMembership` is passed
through `toPublicMembership()` (stripping `invitationTokenHash`) even
though the field is always `null` on a self-service registration row.**
Context: the value itself isn't sensitive here (no token is ever issued
for this path), but every other method in `MembershipService` that
returns a membership to a controller goes through this same strip —
leaving one path inconsistent would be a silent exception to a
data-minimization rule with no corresponding benefit, and would get
worse if this endpoint's behavior ever changed to conditionally set the
field.

## Submission Management implementation (Module 5, filled in during build)

**D80 — Invented `POST /events/:eventId/submissions`, since the stage
doc names no creation endpoint at all (Section 5 starts from "PATCH
/submissions/:id" as if the row already exists).**
Context: something has to create the first row. Rather than a
client-supplied choice of SOLO vs. TEAM, the endpoint auto-detects from
the caller's current team membership for that event — Section 3 already
treats solo-vs-team as a platform-enforced fact, not something a client
picks independently of it, so asking the client to also declare it would
just be a second place that fact could drift from reality. One submission
per team (DB-unique on `teamId`, same pattern as `Team`'s
`joinLinkPrefix`+`joinLinkSuffix` collision handling in Module 4) or per
solo participant (DB-unique on `[eventId, soloUserId]`) — a second
attempt maps a Prisma P2002 to a 409, never a 500. A parallel `GET
/events/:eventId/submissions/mine` fetches the caller's own row (any
state) without the side effect a lazily-creating GET would have.

**D81 — A draft is invisible to organizer *and* admin via direct fetch
(`GET /submissions/:id`) — both get the same 404, not a 403 that would
at least confirm a draft exists.**
Context: Section 6's table draws a real distinction between organizer
("no access at all") and admin ("list only — ownership, not content"),
but that distinction lives in which *list* endpoint each can reach
(there is none for organizers; admin has
`GET /events/:eventId/submissions/drafts`, returning id/type/owner/
timestamps via an explicit Prisma `select` that never touches
title/description/links). For the single-item detail route, Section 8's
own test bullet ("a direct attempt to fetch a draft's content via any
admin-facing route is rejected") settles it: admin's detail access is
exactly as absent as organizer's, so both collapse to the same 404.

**D82 — `trackAttachmentMode: NONE` rejects any submitted track data
outright, rather than silently dropping it.**
Context: Section 8 says NONE "ignores/rejects" track data, leaving the
choice open. Silently ignoring a caller-supplied `trackIds` would mean
the client's save "succeeds" while quietly doing something other than
what was asked — the same reasoning this project applies everywhere else
against silent partial failures. Rejecting with a clear `TRACKS_NOT_ALLOWED`
error instead surfaces the mismatch (organizer hasn't configured tracks;
client's form is stale) rather than hiding it.

**D83 — The submission deadline (`now() <= event.submissionsCloseAt`) is
also checked on `startSubmission` (creation), even though Section 5.4
only lists `PATCH`/`submit`/`unsubmit` by name.**
Context: creation isn't literally "a write to a submission" since the
row doesn't exist yet, so the doc's list doesn't strictly cover it. But
letting a brand-new, permanently-unsubmittable draft be created after
the deadline would be a pointless loophole with no legitimate use —
extended the same server-time-only deadline check to creation for
consistency with every other write path.

## Frontend (apps/web) implementation — cross-cutting, filled in during build

**D84 — No new backend endpoint added for listing an event's Tracks/
Prizes. The frontend reads them from `GET /events/:slug`'s existing
`tracks`/`prizes` inline relations instead, and re-fetches that route
after any track/prize mutation.**
Context: discovered while building the event detail and submission-form
UI that neither `TracksController` nor `PrizesController` has ever had a
`GET` (Module 3's stage doc never names one). Closer inspection found
`EventsService.getEventBySlug` already does
`include: { tracks: true, prizes: true }` and spreads the result through
`toPublicEvent` — so the data is already there on that one route, just
undocumented and not surfaced anywhere before now. Every *other*
Event-returning endpoint (list, create, update, publish, archive) omits
this `include` and so won't have `tracks`/`prizes` on its response —
callers needing current track/prize data must hit `GET /events/:slug`,
not rely on a mutation's own response. Adding a dedicated list endpoint
was the alternative; not done, since the data was already reachable
without touching the backend at all, and a real list endpoint is easy to
add later if a consumer other than this frontend ever needs one without
paying for the whole event payload.

**D85 — Added `GET /events/:eventId/teams/mine`, not named in
`stages/04-team-management.md`.**
Context: unlike tracks/prizes (D84), there was genuinely no way to
recover this data from an existing response — `POST .../teams` (create)
returns only the `Team` row with no roster, and `POST /teams/join`
returns only the caller's own `TeamMembership` row, not the team or its
other members. A participant navigating straight to their team page on
a fresh page load (the normal case, not just right after creating/
joining) had no endpoint to ask "what team am I on, and who else is on
it." `TeamsService.getMyTeam` finds the caller's `TeamMembership` for
the event, then returns the team with `members` flattened to
`{ userId, displayName, joinedAt }` (never the raw `User` row) — mirrors
the `/mine` convenience shape Module 5 already established for
submissions (D80), applied to Module 4's actual gap.

**D86 — `AuthProvider` tracks `mustResetPassword` as a state distinct
from `user`, rather than treating any failed `GET /auth/me` as "logged
out."**
Context: found during the end-to-end UI review pass — logging in as a
freshly-created staff account correctly redirected to `/set-password`
(the login response itself carries `mustResetPassword`), but the page
never rendered. `AuthProvider`'s initial `refresh()` call hits
`GET /auth/me` to establish session state, and `MustResetPasswordGuard`
correctly rejects that route too (Module 2's own design: "can reach
`POST /auth/set-password` and nothing else") — but the frontend's
`catch` block collapsed every failure to `user: null`, which
`useRequireAuth` reads as "not logged in" and redirects to `/login`,
right back out of the one page this state is supposed to reach. Fixed
by having `refresh()` recognize the `MUST_RESET_PASSWORD` error code
specifically and set a separate `mustResetPassword` flag without
nulling `user`; `useRequireAuth` now redirects to `/set-password`
instead of `/login` when that flag is set, and the set-password page
itself treats `mustResetPassword` (not just `user`) as "ready to
render" so it doesn't redirect to itself. A backend-correctness
question turned into a frontend state-modeling bug, not a guard change.

**D87 — Scrapped the first frontend design pass (warm cream/amber
palette, serif+sans font pairing, eyebrow-badge hero, symmetric 3-card
"why choose us" grid) for a monochrome, single-typeface system modeled
directly on Vercel/Geist's actual visual language.**
Context: user feedback, verbatim: the first pass "looks AI generated"
and had "too many AI slop" tells despite an explicit instruction to
avoid exactly that. In hindsight, the specific patterns that read as
generated-template rather than a genuine product: an eyebrow pill badge
above the hero headline, a perfectly symmetric three-identical-card
feature grid, and a serif-for-headings/sans-for-body pairing chosen
*because* it looked "distinctive" — all recognizable defaults from
AI website builders and Framer templates, not signs of a considered
design. Replaced with: black/white/gray palette plus one blue accent
used only for links and focus rings (never a colored primary button —
primary buttons are solid black, matching Vercel's own convention);
a single sans typeface for both headings and body (tight negative
letter-spacing on headings substitutes for a second typeface); status
badges as a small dot + label instead of an uppercase pastel pill; the
landing page's feature section rebuilt as a plain definition list
instead of three cards; a terminal-style panel (`docker compose up`
mock output) replacing the hero's eyebrow badge, both because it's a
more genuine self-hosted-tool signal and because it structurally can't
read as a generic SaaS template. Component/token *names* were kept
unchanged (`ink`, `paper`, `accent`, etc.) — only their values and a
few components' internal markup changed — specifically so this was a
values-and-markup revision, not a rename sweep across every page.

**D88 — The homepage now shows real, live event data (posters, phase
-grouped sections, defined prizes) instead of generic marketing copy;
`listPublicEvents` extended to `include: { tracks, prizes }` to match
`getEventBySlug`, and poster-upload UI was added (deferred as an
explicit scope cut when the frontend was first built).**
Context: user feedback — the homepage should look like an actual
hackathon platform (posters, new/upcoming hackathons, results, prizes),
not a generic SaaS landing page. Three sections, grouped by a new
`eventStage()` helper (`lib/format.ts`) over the existing computed
`EventPhase`: "Happening now" (registration/submissions/judging/voting
all in progress), "Coming soon" (`NOT_STARTED`), "Results & prizes"
(`RESULTS_ANNOUNCED`/`VOTING_CLOSED`/`VOTING_WINNER_ANNOUNCED`). The
results section is deliberately labeled and built around **prizes**
(each event's defined `Prize` rows — name, rank, judged-vs-public-vote),
**not winners** — there is no judging/voting data model or stage doc
yet (T2), so no "who won" fact exists anywhere in the schema to
display. Showing a fabricated winner name would be worse than showing
nothing; the section copy says exactly this ("not a judged winner —
judging isn't built yet") rather than silently omitting the section or
implying data that doesn't exist.
`listPublicEvents` previously omitted `tracks`/`prizes` (D84 noted only
`getEventBySlug` included them) — extending it the same way avoids an
N+1 fetch-per-card on a homepage that lists many events, and closes the
inconsistency D84 flagged rather than working around it a second time.

**D89 — Reintroduced a wider color palette (violet/teal/rose alongside
the existing blue/success/warning/danger) after the pure-monochrome
pass (D87) read as flat rather than "genuine."**
Context: user feedback after D87 — the site looked "boring and simple
black and white." The lesson isn't that D87 was wrong to remove the
warm-cream/serif/badge-pill pattern (that was a real fix); it's that
monochrome and "not templated" aren't the same thing — a real product
can use color deliberately without it reading as generated. Applied
color in three targeted places, still never as UI chrome (buttons stay
solid black, borders stay gray): (1) each `EventPhase` now maps to a
genuinely distinct hue in `PhaseBadge` instead of mostly gray/blue, so
a grid of event cards reads as different states at a glance; (2) the
homepage hero has a soft blurred-gradient-blob background (violet/blue
/teal, low opacity, pure CSS) behind the same monochrome content; (3)
the feature section and no-poster placeholder cards use color
purposefully (icon-tinted squares; a deterministic per-event-name hue
instead of every placeholder being identical flat black). Also added a
real-data stats strip to the hero (event/live/upcoming counts from the
same `listEvents()` call already being made) — a SaaS platform's
homepage reads as confident partly because it's showing real numbers,
which a generic template never has.

**D90 — The homepage (`/`) is now the actual event discovery tool —
search, phase tabs, a dense real-event grid — with the hero pitch,
gradient background, and feature-marketing section removed entirely.
The separate `/events` browse page was deleted; `/` now does its job.**
Context: user feedback — didn't want "a product marketing page," wanted
"a genuine home page that serves a purpose," and pointed at Unstop by
name (also independently named in this project's own original brief,
grouped with Devpost/Devfolio/TAIKAI/DoraHacks/HackerEarth as
incumbents that "all ship the same nine things"). None of those
platforms' homepages pitch the software to the people using it — the
homepage *is* the listing: search, filter by status, a grid of real
events. Rebuilt `/` around exactly that: a phase-tab filter bar (All/
Live now/Upcoming/Results, each with a real count) plus a client-side
text search over the already-fetched event list (no backend change —
`GET /events` only supports `?phase=`, so search filters what's already
loaded rather than pretending to hit a search endpoint that doesn't
exist). `EventCard`'s footer date line was also made phase-aware
(registration-closes / submissions-close / results-date, whichever is
the actually relevant deadline for that event's current phase, not
always "starts on") — matching how Devpost-style listings surface a
deadline on every card. Every prior round's color/typography decisions
(D87, D89) are unchanged; this is a content-and-structure change, not
another visual pass. `/events` had no purpose distinct from `/` once
this was done, so it was deleted rather than kept as a redundant route
— the three places that used to link/redirect to it (nav, post-login,
post-password-reset, post-event-delete) now point at `/` directly.

---

## Submission Verification (Module 6)

**D91 — A manual, organizer/admin-triggered commit-history verification
pipeline gates entry to judging. Never runs automatically at any
timeline event.**
Context: user wanted certainty over convenience — an automatic trigger
at `eventEndsAt` could run before an organizer is ready to handle the
review queue it produces.

**D92 — Verification window is `eventStartsAt` → `submissionsCloseAt`,
not `eventEndsAt`.**
Context: resolves the open question from the original Module 7
discussion — user gave a direct, explicit answer rather than defaulting
to the two timestamps' usual (but not guaranteed) equality.

**D93 — Classification is three-way (all-in-window → auto `VERIFIED`;
mixed → `SUSPICIOUS`; all-out-of-window → `REJECTED`), but `REJECTED` is
explicitly NOT auto-`DISQUALIFIED` — it still requires human review
before a team is actually excluded from judging.**
Context: GitHub commit timestamps are suggestive, not conclusive
evidence (squashed merges, imported history, timezone artifacts can all
produce a false "all outside" read) — the platform's "no status a human
can't see and reverse" principle extends to even the strongest automatic
signal here.

**D94 — Private repos and non-GitHub URLs are never auto-rejected —
both route straight to manual review (`PRIVATE`, `NON_GITHUB`
respectively), with disqualification only ever a human decision made
with mandatory remarks.**
Context: repo accessibility or platform choice isn't evidence of
cheating — conflating "couldn't check" with "found guilty" would be a
real correctness bug, not just an unfriendly default.

**D95 — Public/private repo status is checked only during verification,
never at submission time. The submission form instead carries an
advisory notice about the public-repo expectation.**
Context: explicit user instruction — avoids reopening Module 5's
submission-time validation surface for a check that belongs later in the
pipeline.

**D96 — GitHub tokens are the one deliberate exception to the
platform's hash-everything-sensitive rule: stored with reversible
AES-256-GCM encryption (key via Docker secrets), because the app must
read the plaintext back to call the GitHub API.**
Context: every other token in the system (sessions, verification,
invitations) is compare-only and therefore safely one-way-hashed; a
GitHub PAT's use case is fundamentally different and needed a distinct,
explicitly documented pattern rather than a forced fit into the existing
one.

**D97 — Multi-token rotation, rate-limit-aware, with invalid tokens
surfaced as an immediate admin-dashboard alert, not a silent failure.**

**D98 — Introduced a shared async worker container (BullMQ + Redis),
used by both submission verification and (later) certificate rendering,
as two independent queues in one container.**
Context: this reverses the earlier "no async worker needed, bulk
certificates dropped" position from the certificates discussion — that
conclusion held only because bulk certificate export was optional
scope-creep; verification's external GitHub API calls are a genuine,
non-optional requirement for exactly the same isolation reasoning (CPU/
latency contention with other users' requests) that motivated rejecting
in-process execution before.

**D99 — Rejection/disqualification requires a mandatory written reason,
consistent with every other consequential organizer action in this
platform (bans, voting-round restarts).**

**D100 — Rejected/suspicious entries remain fully visible and filterable
in the organizer's list — never hidden.**

**D101 — Re-verification supports three scopes: full re-run, filtered
re-run (by current status), and targeted re-run (specific submissions),
mirroring the same three-scope pattern used for the initial trigger.**

---

## Judge Assignment (Module 7)

**D102 — Two assignment modes, coexisting: manual (organizer assigns
judges to projects one at a time, respecting a per-judge project limit)
and algorithmic (checkbox-driven: by track, or random as fallback/
explicit choice).**

**D103 — Both assignment modes are hard-gated on
`finalDecision: APPROVED` (Module 6) — a submission still under review
or disqualified is structurally excluded from the assignable pool, not
just deprioritized or hidden in the UI.**
Context: extends the same "backend-enforced, not UI-hidden" principle
used for role isolation everywhere else to the assignment pool itself.

**D104 — No self-service judge conflict-of-interest declaration
mechanism. Conflict avoidance is organizer-managed only, via the same
manual-transfer mechanism used for no-shows, used proactively.**
Context: this was the one open item carried over from the initial
Judge Assignment discussion (before verification was introduced); the
user's answer to the no-show/reliability-note question implicitly
confirmed this simpler model rather than asking for a self-service
declaration system.

**D105 — A judge who never completes an assigned review can have that
assignment manually transferred to another judge. A written remark is
then attached to the judge's `User` profile — platform-wide, visible to
any organizer/admin, never visible to the judge or to any participant.**
Context: user was explicit that this needed to inform *future* event
invite decisions, not just log a local incident — placing it on `User`
rather than on the event-scoped `EventMembership` was a deliberate
structural choice, not a default.

**D106 — Once a judge actually submits a score for an assignment, that
assignment is permanently locked to them — no transfer possible after
completion, by anyone, ever.**
Context: consistent with the platform-wide rule that a completed, real
record (a submitted score, a finalized team roster, an issued
certificate) is never silently altered after the fact.

**D107 — Participants never learn which judge(s) reviewed their project,
at any stage, in any export or view.**
Context: explicitly scoped as solving *one* problem (protecting judges
from being lobbied/identified by participants) and explicitly **not**
claimed to solve a different one (a judge recognizing a project's
content despite not knowing whose it officially is) — that residual risk
is handled, if at all, by organizer awareness via D104, not by any
technical anonymity guarantee.

---

## Rubric & Scoring (Module 8)

**D108 — A new explicit timeline field, `Event.judgingClosesAt`, replaces
what Module 3 originally modeled as an implicit, boundary-less gap
between `eventEndsAt` and `resultsAnnounceAt`.**
Context: the user wanted a concrete, organizer-set deadline for judges to
finish scoring — not just "whenever the organizer decides to announce
results." This required amending Module 3's validation chain and
`EventPhase` sequence (new `JUDGING_CLOSED` phase) after the fact —
propagated back into `03-event-management.md` directly, same pattern as
D13's earlier cross-module fix.

**D109 — [SUPERSEDED by D118] Scoring scale was initially fixed at 1–5,
platform-wide, not configurable per criterion.** Kept here for history;
see D118 for the final design.

**D110 — A judge's own submitted scores remain editable, unlimited times,
by that same judge, until `judgingClosesAt`.**
Context: this is a direct reversal of the "instantly final" option that
had been proposed as the safer default — the user chose flexibility
anchored to a hard deadline instead. Critically, this does **not**
conflict with Module 7's D106 (no transfer to a different judge after
completion) — the two are independent axes: assignment ownership is
permanently locked on first submit; the content of that judge's own
scores stays mutable until the deadline.

**D111 — Every resubmit (not every draft save) writes an immutable,
append-only `ScoreRevision` snapshot — full criteria values plus
feedback text, timestamped, never edited or deleted afterward.**
Context: direct response to "log store all the changes judges made
during the resubmit the score" — read as applying to completed
resubmissions specifically, not every incremental autosave, to avoid
flooding the history with noise.

**D112 — A required overall-feedback text field per judge per project,
separate from any per-criterion notes, enforced as mandatory before
`submit-review` succeeds.**
Context: read from "so they can add their words and justify their given
score" as an intentional requirement, not merely an optional nice-to-have
— flagged as an assumption in the stage doc's open questions in case the
user meant it as optional instead.

**D113 — Organizer-defined bonus tracks, separate from the weighted
scoring rubric: flat point value (e.g. +5, +10), optional per event,
fully independent of the scoring criteria's weighting.**
Context: user wanted the platform itself to support the same kind of
"base score plus optional bonus" structure the Dogfood brief uses for
its own hackathon scoring — this is a genuine platform feature request,
not a meta-comment about our own submission's bonus challenges (which
was clarified and ruled out as the intended meaning first).

**D114 — Scoring criteria weights (`weightPercent`) must sum to exactly
100 across an event's `SCORING` criteria; bonus tracks use flat,
unconstrained point values with no sum requirement.**
Context: resolves the earlier open fork (free-form weights vs.
sum-to-100) directly by the user's explicit instruction — organizers now
author weights as percentages with validated totals, while bonus points
remain intentionally separate, flat numbers.

**D115 — [SUPERSEDED by D119] An earlier final-score formula rescaled the
combined general+bonus raw total against a combined maximum
(`5 + Σbonus.maxPoints`).** This was later proven to have a real flaw
(rewards bonus at the expense of a project's genuine general-score
excellence whenever bonus isn't maxed) and was replaced — see D119.

**D116 — A submission's overall score is the average of `finalScore`
across only judges with `JudgeAssignment.status: COMPLETED` — a
non-responding judge is excluded entirely from both the sum and the
divisor, never counted as a zero.**
Context: explicit user instruction, given directly as an example (3
assigned, 2 respond → average of exactly those 2). Still holds
unchanged under the finalized D119 formula — the exclusion happens at the
raw-total-averaging stage, before the single final scale conversion.

**D117 — Bonus tracks are scored on a scale (0 to the track's
`maxPoints`), not as a binary toggle. Decided directly rather than
asked back to the user, given it's an implementation detail with a
clearly better default (consistency with `SCORING` criteria's
guidance-text pattern, one shared code path instead of two).**

**D118 — Judge input scale changed from fixed 1–5 (D109) to raw 0–100 per
`SCORING` criterion. The organizer-configured winning/display scale
(`Event.finalScoreDisplayScale`, default 5) remains entirely separate
and unaffected — the two numbers must never be conflated.**
Context: the user's own worked examples used 0–100 judge inputs (e.g.
"judges give 80 for T1"), and confirmed this was intentional, not
illustrative shorthand for a 1–5 rating. This also directly serves the
earlier, unresolved decimal-precision/tie-breaking goal from much
earlier in the scoring discussion — a 0–100 input gives roughly 20×
finer resolution than 1–5 before any cross-judge averaging even helps.

**D119 — Finalized final-score formula, after two rejected intermediate
attempts:**
```
generalRaw (per judge) = Σ(criterionValue × weightPercent) / 100   [0,100]
bonusRaw (per judge)    = Σ(awarded bonus points)
rawTotal (per judge)    = generalRaw + bonusRaw
averageRawTotal         = average of rawTotal across
                          JudgeAssignment.status = COMPLETED judges only
finalScore              = (averageRawTotal / 100) × finalScoreDisplayScale
```
Context — the full derivation history, because two earlier variants
were built, tested with numbers, and rejected in this same design
session:
1. **Combined-denominator variant (D115):** divided the combined
   general+bonus raw total by a combined maximum
   (`5 + Σbonus.maxPoints`). Rejected: any project that didn't max out
   bonus was penalized in the denominator regardless of general-score
   excellence — a perfect general score with zero bonus scored barely
   above 1 out of 5 in testing.
2. **Pre-divided-then-add variant:** computed `generalScore` as an
   already-averaged 1–5 (or similar small-scale) value first, *then*
   added raw bonus points on top before a final rescale. Rejected: this
   let a low-quality project with full bonus decisively outscore a
   high-quality project with none, because bonus (raw, e.g. up to 8)
   became disproportionately large next to an already-shrunk general
   score (e.g. 1.5). Proven with numbers: a `generalScore=1.5` project
   with full bonus reached a higher final score than a `generalScore=5`
   (perfect) project with no bonus.
3. **Final, accepted variant (D119 itself):** general and bonus are
   combined while `generalRaw` is still in its full 0–100 range (never
   pre-divided), and every judge's `rawTotal` is averaged across
   `COMPLETED` judges *before* the single final scale conversion at the
   very end. This is self-regulating: bonus's maximum possible influence
   scales naturally with how large the organizer sets bonus point values
   relative to 100 — small bonus values (e.g. +5/+3) can only ever
   affect genuinely close calls; they cannot overturn a real quality
   gap. Verified against multiple worked scenarios (low/medium/high/
   near-perfect/perfect projects, with and without full bonus, with one
   non-responding judge, and with intentionally oversized bonus tracks
   to find the breaking point).

**D120 — Overflow (`averageRawTotal > 100`, i.e. `finalScore` exceeds
`finalScoreDisplayScale`) is expected and displayed honestly, not
clamped or treated as an error — shown as the raw computed number plus a
fixed "Overachiever" label in the public gallery. Never shown on
certificates, consistent with certificates carrying no score at all
(D34). The overflow check is evaluated at the averaged submission level,
not per individual judge — confirmed via worked example (one judge at
108, one at 105.75, averaging to 106.875, which crosses the threshold;
a single judge crossing it alone would not, if the average didn't).**
Context: user explicitly wanted the uncapped approach ("everyone get
their honest point no matter what... if someone cross the scale then
that project genuinely deserve that"), rejecting an earlier
capped-at-the-ceiling alternative that had been shown, with worked
numbers, to collapse differentiation among top performers into
artificial ties — directly undermining the original tie-breaking
motivation for finer score precision.

**D121 — Bonus guardrail: if an event's total `BONUS.maxPoints` exceeds
a threshold (default 20), the organizer sees a warning before
publishing and may proceed only with explicit acknowledgment, logged to
`AuditLog`. Soft warning, not a hard block — decided directly by Claude
as an implementation detail, not asked back to the user, since it fits
the same pattern already used for every other powerful-but-risky
organizer action in this platform (warn/log, don't silently prevent).
Reversible to a hard block with a one-line change if preferred.**

---

## Normalization (Module 9)

**D122 — Judge calibration (mean, stddev, sample count) is a global,
platform-wide profile on `User`, not scoped per event, and updates
live after every `submit-review`.**
Context: reflects the real operating model (Hackathon Raptors runs the
same judge pool across dozens of events) — a judge's harshness/leniency
is a stable personal trait worth learning across contexts, not
something that should reset every event.

**D123 — Minimum-N threshold for normalization eligibility: 3, counted
platform-wide across a judge's entire history, not per-event.**

**D124 — A judge below the minimum-N threshold is normalized against
that specific event's own aggregate mean/stddev (computed across every
judge's `rawTotal` in that event), rather than their own statistically
unreliable personal figures.**
Context: this solves a real blending problem that surfaced during
design — averaging a real personal z-score with an unconverted raw
number for a different judge on the same submission is not
mathematically valid. Decided directly by Claude, not asked back, as
the standard defensible handling of a mixed-reliability judge
population; the alternative (mixing raw and normalized numbers
directly) would have been a genuine correctness bug, not a style
choice.

**D125 — A judge with zero variance (`judgeCalibrationStdDev = 0`,
i.e. they score every project identically) gets `z = 0` for every
submission — neutral, not excluded — and this is explicitly flagged
("uniform scoring detected") for admin/organizer visibility.**
Context: consistent with the platform-wide rule that no status is ever
invisible to a human who might need to act on it (same principle behind
the verification pipeline's manual-review queue and the voting
abuse-flagging system).

**D126 — Normalization is triggered manually, can be re-run any number
of times, but only within the window `judgingClosesAt <= now() <
resultsAnnounceAt`. Once `resultsAnnounceAt` passes, it is permanently
locked for that event — no exceptions, no admin override.**
Context: explicit user instruction ("once the event end or winner
announced then no one can run the normalization"). This is the same
class of protection already applied to cast votes, issued certificates,
and finalized team rosters — nothing that's already real and
public/announced can be silently recomputed.

**D127 — Every normalization run snapshots each judge's mean/stddev/
sample-count *at that exact moment* into a permanent, per-run record
(`NormalizedJudgeScore`), rather than storing a live reference back to
the judge's ever-evolving global profile.**
Context: explicit user instruction ("we attach the judge mean and
stddev score with review he did"). This prevents a past, already-locked
event's normalization from silently appearing different later, purely
because the judge's global profile moved on from reviewing *other*,
later events — the same "no after-the-fact mutation of a real record"
principle applied consistently elsewhere.

**D128 — Judge calibration data (live profile and per-run snapshots) is
visible to admin and organizer, platform-wide — not scoped only to the
organizer of the event currently being normalized. Never visible to the
judge themselves or to any participant.**
Context: user specified admin/organizer visibility; the platform-wide
scope (rather than event-scoped) was decided directly by Claude for
consistency with Module 7's `JudgeReliabilityNote` visibility pattern,
flagged as an assumption in the stage doc rather than asked back.

---

## Results & Rankings (Module 10)

**D129 — Retroactive fix to Module 8: added a third `RubricCriterion`
kind, `SPECIAL_AWARD`, for organizer-defined special categories (Best
Code, Most Unique Feature, etc.) that the original rubric design had no
mechanism to actually judge.**
Context: the user caught a genuine gap — special categories were
mentioned in the brief and referenced loosely in early results
discussion, but nothing in Module 8 ever specified how judges would
actually produce a winner for them. Resolved by folding a nomination
flag (`Score.value = 0 or 1`) directly into the existing per-submission
review flow — a judge nominates a submission they're already reviewing
for zero or more special-award categories, no separate cross-submission
comparison step required. Nominations are tallied entirely outside the
`generalRaw`/`bonusRaw`/`rawTotal` formula — they never affect a
submission's rank-based score.

**D130 — Special-award winner = highest nomination count, tallied only
from `COMPLETED` judge assignments.** Honest limitation documented
directly in the doc: a judge can only nominate from submissions they
personally reviewed, not the full event-wide pool — this is a
coverage-dependent signal, not a full head-to-head comparison.

**D131 — The organizer/admin explicitly selects which `NormalizationRun`
is official for building results (default: most recent, but changeable,
with full run history and a ranking preview visible before committing).**

**D132 — Rank-based tie-break cascade: `finalScore` → pre-normalization
`averageRawTotal` → `bonusRaw` → share the position and prize together.
No manual-review escalation for rank ties — resolution is fully
automatic, ending in genuine sharing.**
Context: direct user instruction, given as a worked example (4
projects, 2 tied for 2nd share that position and its prize). This is a
deliberately different philosophy from voting's tie handling elsewhere
in this platform, where automation stops short of a final call —
rank ties are resolved completely automatically here.

**D133 — Dense ranking, not skip-ranking: after a tied position, the
next distinct score takes the next sequential rank number, not a
skipped one.** For A > B=C > D: ranks are 1, 2, 2, 3 — never 1, 2, 2, 4.
Context: read directly from the user's own worked example ("3rd project
share the 3rd position"), which only makes sense under dense ranking;
standard Olympic-style skip-ranking was explicitly ruled out by that
example.

**D134 — [SUPERSEDED by D140] Special-award ties were initially proposed
to reuse the rank cascade (nomination count → finalScore → share) as a
default, decided directly by Claude without separate user confirmation.**

**D135 — Draft → publish workflow: a `ResultsDraft` is built privately
against a selected normalization run and reviewed by the organizer
before anything goes public, with an explicit `draftStatus:
IN_PROGRESS | READY` flag and an organizer-chosen `publishMode: AUTO |
MANUAL`.**
Context: direct user instruction — organizers wanted a review step to
catch errors before announcement, not just a single irreversible
publish action.

**D136 — `AUTO` publish mode only fires at `resultsAnnounceAt` if the
draft is `READY` at that exact moment; an `IN_PROGRESS` draft falls
back to requiring manual publish. Decided directly by Claude as the
safer default — silently auto-publishing an unfinished draft is a worse
failure mode than one extra manual click.**

**D137 — Unpublishing a live result requires a mandatory reason and is
logged, but never deletes the version record — only marks it
`UNPUBLISHED`.**

**D138 — Visibility of results to participants is gated entirely by
the existence of a `PublishedResultVersion` at `status: LIVE`,
completely independent of `EventPhase` reaching `RESULTS_ANNOUNCED`.**
Context: `EventPhase` is purely timestamp-computed (Module 3) and
advances whether or not an organizer has actually published anything —
conflating the two would leak partial/draft information the moment a
timestamp passed, regardless of organizer readiness.

**D139 — Post-publish correction (disqualify, reorder rank, override a
displayed score) is explicitly authorized by the user, resolving the
earlier design tension flagged against D126. This does not reopen or
re-run normalization itself — `NormalizationRun` remains permanently
locked after `resultsAnnounceAt` exactly as D126 specifies. Corrections
are a separate, new-version-per-correction layer sitting on top of an
already-computed, frozen result, always with a mandatory reason, always
visibly marked as a correction (never presented as an original,
unmodified result), and always fully audit-logged.**
Context: this was flagged as a genuine open policy question before the
user answered directly — confirming corrections should exist, but as a
versioned override layer rather than a reopening of the underlying
computation. The distinction matters: D126's guarantee (nobody can
silently recompute an announced result via normalization) stays fully
intact; what's new is a visible, audited, deliberate override
mechanism for the rare case something genuinely needs fixing after the
fact.

**D140 — Corrected special-award tie-break cascade, per explicit user
clarification: nomination count → `bonusRaw` → `NormalizedScore.finalScore`
→ share. Supersedes D134's default.**
Context: the user's original tie-break instruction ("consider bonus
score... even if bonus tie, consider final score... share") was first
applied to the main rank-prize cascade, then clarified to actually be
about special-award categories specifically. The resulting order
deliberately differs from the rank-prize cascade (Section 3/D132, which
checks pre-normalization raw total before bonus) — bonus is checked
*before* the general final score for special awards, since a bonus
track (e.g. "Innovation") often correlates more directly with what a
special category is rewarding than the overall weighted rubric does.

---

## Voting (Module 11)

**D141 — Shortlist reveal is tied to Module 10's actual publish
mechanism (`PublishedResultVersion.status: LIVE`), not a raw
`resultsAnnounceAt` timestamp check.**
Context: original design said the shortlist is "announced at the same
time" as judge winners — that phrasing predates Module 10's formal
draft/publish workflow, where publish is an explicit action that can
lag the timestamp under `MANUAL` mode. Resolved directly by Claude as
the more precise reading now that the real mechanism exists, rather
than re-asked as a separate question.

**D142 — Tied vote counts for the audience-choice winner share the
win, with no arbitrary fourth-level tiebreaker.**
Context: vote-count ties were never addressed during the original
voting design discussion (which predates Module 10's tie-share
philosophy). Decided directly by Claude for consistency with the
established pattern from D132/D140 (share rather than invent an
arbitrary tiebreaker like submission ID or timestamp) rather than
treated as a new, separate policy question.

---

## Certificates (Module 12)

**D143 — Certificate issuance is anchored on a real vulnerability found
in a competing platform (zerodepshack.com): a public flow letting
anyone search for any project/team and type an arbitrary free-text name
to generate a signed-looking certificate, with zero identity binding.
This platform structurally forbids that pattern — there is no
certificate flow anywhere that accepts a typed name; the recipient is
always resolved from the authenticated caller's own participation
record, and `displayName` comes directly from their account.**
Context: user shared a real certificate image from that platform,
showing "Fake Name" successfully issued for a real team's project.
This is treated as a concrete, named threat-model entry, not a
hypothetical — see `12-certificates.md` Section 2.

**D144 — Certificate issuance for an entire event is controlled by a
single, unified switch (`Event.certificatesEnabled`), which can only be
enabled once judge results are already published live
(`PublishedResultVersion: status: LIVE`, Module 10) — covering both
participants and judges under the same trigger.**
Context: explicit user instruction ("certificate only enable after
winner announcement happen"). The unified-trigger-for-judges-too
choice (rather than gating judges earlier, at `judgingClosesAt`) was
decided directly by Claude for simplicity.

**D145 — Disqualified submissions' participants are excluded from
automatic certificate issuance by default; organizer/admin can
manually override and issue one per case.**
Context: decided directly by Claude, not asked back — consistent with
disqualified submissions already being excluded from judge results
(Module 6/10) entirely; extending that exclusion to certificates was
the more consistent default than treating certificate eligibility as
independent of disqualification status.

**D146 — Certificate content carries no per-team-member role
distinction — a team admin and a regular member receive identically
formatted certificates.**
Context: explicit user instruction. A person can hold multiple
separate certificate rows for the same event (e.g. `PARTICIPANT` and
`WINNER`) rather than one row whose content varies — kept the
`Certificate.role` field simple and fixed per row.

**D147 — Every user profile has a public certificate gallery
(`GET /users/:id/certificates`), visible with no authentication
required, listing certificates across every event.**
Context: explicit user instruction. Restated plainly in the stage doc
as a deliberate tradeoff, not an oversight — a user's full hackathon
participation history becomes discoverable via their profile URL. No
per-certificate hide/opt-out was requested or built.

---

## Comments (Module 13)

**D148 — Comments are a small, mostly-Claude-decided module: eligible
to any user with `emailVerifiedAt` set (not participation-gated, unlike
voting), flat with no threading, editable anytime with a visible
`(edited)` indicator, soft-delete-only, and rate-limited via the same
Redis mechanism already built for voting/CAPTCHA.**
Context: the brief only specifies "comments on gallery projects" with
no further detail — every sub-decision here was made directly by
Claude, drawing on consistent low-risk defaults already established
elsewhere in this platform (soft-delete, mandatory reasons for
moderation actions, reusing existing rate-limiting infrastructure)
rather than treated as genuine policy forks requiring user input.

**D149 — A comment remains visible even if its submission later
reverts to draft status (e.g. via Module 5's unsubmit) — only new
comment *creation* is gated by current gallery visibility, not the
continued display of comments already posted.**
Context: decided directly by Claude as the more consistent behavior
(an existing public statement shouldn't retroactively disappear just
because the underlying submission's draft flag toggled), flagged as an
explicit test case precisely because it's an easy inconsistency to
introduce by accident during implementation.

---

## Global Ranking (Module 14)

**D150 — Global Ranking is a new module inspired by a real reference
implementation (Hackathon Raptors' own `rank.raptors.dev`), whose live
JSON feed was fetched and inspected directly during design rather than
designed from the page description alone.**
Context: the actual JSON schema revealed the reference site does heavy
cross-event identity reconciliation (`discord_handle`, `github_owner`,
`name_variants`, a `person_source` provenance field per award) because
it aggregates results scraped across many independent, disconnected
past events with no shared account system. This platform doesn't have
that problem — every award is already tied to a real `User.id` — so
most of that reconciliation machinery was deliberately *not*
replicated; only email matching (Section 5 of the stage doc) was
needed, and only for backfilled historical data via the separate
Import/Export module.

**D151 — Points sources for v1: podium placement (Module 10), special
award (`SpecialAwardResultEntry`, D129/D130), and audience-choice
voting win (Module 11, explicitly added at the user's request, worth
the same 2 points as a special award).**
Context: "side quest"/write-up placements and honourable mentions —
both present in the reference implementation's points table — are
deliberately deferred, tied to a shelved Write-up module. Confirmed
directly against the original Dogfood brief that neither concept is
required there at all.

**D152 — Points table is admin-configurable, platform-wide (one table,
not per-event), rather than a hardcoded constant.**
Context: explicit user instruction, matching how the reference
implementation's table is presented (as a fixed published rule) but
made editable here since this is a live, operable platform rather than
a static published report.

**D153 — Global tie-break cascade adopted directly from the reference
implementation: points → firsts → seconds → thirds → events entered →
earliest first-event date → shared position.**
Context: this is a genuinely different cascade from any single event's
own tie-break rules (D132, D140) — it operates across a person's entire
history on the platform, not within one event's results. The final
fallback (a true, complete tie shares the position) reuses the same
"share rather than invent an arbitrary tiebreaker" philosophy as D132/
D133/D140, applied at the cross-event level.

**D154 — Historical/pre-platform event backfill is explicitly out of
scope for this module — it belongs to the separate Import/Export
module. Global Ranking only needs to display whatever that module
produces, once linked to a real `User` account.**
Context: user's explicit instruction ("for historical data fillup we
have import export module").

**D155 — Email-based identity linking is fully automatic, with zero
review step, since it carries no self-assertion risk — a verified
account's own email matching a historical record is not a typed claim
of someone else's identity.**

**D156 — [SUPERSEDED by D158] Discord-handle identity linking was
initially designed to require organizer/admin approval before it took
effect — a request staying pending and linking nothing until reviewed.**
Context: decided directly by Claude, explicitly modeled on the same
structural fix already applied for certificate issuance (D143) — an
unverified, self-typed identity claim must never take effect on its
own. The user correctly pushed back that admin review doesn't actually
verify anything either (an admin has no more ability to confirm a
typed handle belongs to the claimant than the system does) and
proposed real Discord OAuth instead, which cryptographically proves
account ownership rather than asking a human to eyeball a claim. This
intermediate design was superseded before implementation — see D158.

**D157 — [SUPERSEDED by D158] A follow-up design explored real Discord
OAuth for a "Connect Discord" action, plus a two-tier fallback for
historical records where a person's Discord username had changed since
the recorded event (exact-username auto-match, then a corroborated
self-service claim screen for the rest).**
Context: this was a real improvement in *correctness* over D156 (OAuth
actually proves identity; admin review didn't), but running it to its
conclusion made a different problem visible — Discord matching still
only reliably works when the username never changed between events,
which even the reference implementation's own `name_variants` field
tacitly admits it can't solve automatically. The user then asked
directly whether Discord linking was worth its cost at all, given
email matching already exists — see D158.

**D158 — Final decision: drop Discord linking entirely, in any form.
Identity linking for this module is automatic email matching only
(D155); any historical record that doesn't match returns a static
"contact an admin to have it linked" note on the profile, with no
claim flow, no corroboration logic, and no admin-side tooling built
yet.**
Context: user asked directly whether Discord linking was worth
building at all, given email matching already exists. Reasoning that
led to dropping it: the only case Discord would rescue — someone
changed their email but kept the same Discord handle — is a narrow
slice, and even a correctly-built OAuth version doesn't fully solve
identity reconciliation on its own (a changed handle defeats it too,
same as a changed email defeats email matching). Since a general
"claim an unlinked historical record" fallback would be needed
regardless of whether Discord linking existed, and that fallback
covers the same ground Discord would have covered plus more, building
Discord OAuth for this narrow slice wasn't worth its cost (a new
external dependency, a new secret to configure, real implementation
work) when the simpler fallback already subsumes it. The fallback
itself is also not built yet in this version — deliberately left as
a plain informational note rather than a real feature, to be designed
properly once there's a demonstrated need rather than speculatively.

**D159 — The leaderboard is snapshot-based: a background job (reusing
the existing `worker` container, introduced in Module 6) recomputes a
`GlobalRankingSnapshot` whenever relevant results publish
(`PublishedResultVersion`/`VotingResultVersion` going `LIVE`, per D138/
D141), or on manual admin trigger; every read serves a cached,
paginated snapshot, never a live cross-event aggregate computed
per-request.**
Context: explicit user instruction ("pagination, record per page, and
caching so it will not load whole thing at once") — reuses Redis
infrastructure already established for certificates and CAPTCHA/PoW
(Module 11), no new piece of infra introduced. Certificate rendering
itself does *not* use the `worker` container (see `ARCHITECTURE.md`
§4) — this module's snapshot recompute is a different, genuinely
background-appropriate job, closer in shape to Module 6's verification
jobs than to certificate rendering.

**D160 — The Write-up module itself remains shelved. Confirmed
directly against the original Dogfood brief text that it is not
mentioned anywhere in the brief — this is purely a feature from the
reference implementation's own historical event catalog, not a
platform requirement.**

---

## Voting — frontend visibility clarification (post-Module 14)

**D161 — Confirmed: the voting shortlist is publicly viewable (no
authentication required), while casting a vote remains gated by the
two existing rules — organizer-chosen eligibility mode (D43) and the
account-age cutoff (D44). Viewing and acting are independent; only the
latter is restricted.**
Context: this was an open question the frontend design pass surfaced —
the original Module 11 backend design never explicitly stated whether
an anonymous or ineligible visitor could *see* the shortlist, only that
voting itself required eligibility. A frontend design doc initially
resolved this unilaterally (reasoning it should follow the same
public-view/gated-action pattern already used for results,
`PublishedResultVersion`/D141), then that resolution was surfaced back
explicitly and confirmed directly by the user rather than left as an
assumption. Practical effect on the API: the shortlist read endpoint
carries no auth requirement; the vote-casting endpoint's existing
D43/D44 checks are unchanged and are the only enforcement point —
this decision doesn't add a new backend rule, it closes a gap in what
was previously unstated about the read side.

---

## Design-review-audit findings 5 and 6, ratified

**D162 — Confirmed: certificate download stays "disabled, not hidden"
for viewers who can't download it, as the one deliberate exception to
this design system's otherwise-absolute hide-don't-disable rule.**
Context: `design-review-audit.md` Finding 5 flagged this as a rule
break worth a deliberate yes/no rather than standing by default. The
behavior was already built and tested this way in Module 12 (a disabled
Download button with an inline explanation, confirmed live for both an
anonymous visitor and the certificate owner). Reasoning ratified: seeing
a disabled download confirms the certificate is real and exists, which
is meaningfully different information than "an action exists" — worth
keeping as the platform's one named exception rather than changing code
to match a rule that doesn't serve this specific case well.

**D163 — Deferred: Open Graph title/description tags for the event
detail page, not built for now.** Context: `design-review-audit.md`
Finding 6 flagged this as scope added to `03-event-management.md`
without being asked for, and asked for an explicit yes/no. On closer
look, building it for real requires this app's first server-side
metadata fetch (`generateMetadata`) — the event detail page is fully
client-rendered today (a deliberate scope cut from the original
frontend build), so this isn't the "small, low-cost" addition the doc
originally framed it as. Deferred as its own small task if wanted
later, rather than either building it now at higher cost than scoped or
silently dropping the doc's mention of it.

---

## Module 15 (organizer shell) sidebar reconciliation

**D164 — Settings (the event edit form: name/description/timeline/
poster/publish/archive/delete) gets its own sidebar item in the
organizer shell, placed near the top alongside Tracks & prizes, rather
than being folded into the new Overview dashboard.**
Context: `15-organizer-shell.md`'s original sidebar list (10 items)
never accounted for Settings at all, even though the new Overview
dashboard displaces it from the `/manage` landing route it currently
occupies — a real gap caught before implementation rather than
guessed through. Confirmed: Settings and Tracks & prizes (also
previously missing from the list) both get real sidebar slots,
bringing the shell to 13 items total. Settings gets no Overview status
card (see `15-organizer-shell.md` Section 3) since it isn't a pipeline
stage with a summarizable status.

**D165 — Submissions (Module 5's finalized-list page) and Verification
(Module 6's review queue) stay as two separate sidebar items in the
organizer shell, not merged into one.**
Context: the shell doc's original "Submissions" Overview card
described verification-queue data (approved/pending review/
disqualified counts) while a plain `Submissions` sidebar label would
suggest Module 5's simpler finalized-list page — the two are genuinely
different existing tools with different data, and the doc's flat list
only allocated one slot for what should have been two. Confirmed:
keep both as distinct items, matching the interim `ManageNav`
component (already listing both separately) that this shell replaces.

---

## Dogfood spec discovery — the real mechanical-checking mechanism

**D166 — The official spec at `dogfoodhack.com/spec/` was reviewed in
full. It defines a narrow, fully mechanical checking system layered on
top of the original brief's tier ladder — it does not shrink or
redefine project scope, which remains the full platform (T1 core
through T4 stretch, exactly as already built across Modules 1–15). Two
files come from the organizers (`fixtures.json`, `run.py`); two come
from us (`.dogfood.toml`, `acceptance-report.txt`). `run.py` makes
exactly seven HTTP requests against our own portal and prints a
pass/fail report we commit as-is.**
Context: this is a genuinely new source of truth for how the
automated portion of judging works, distinct from (and narrower than)
everything the fourteen-plus module docs already cover. The seven
checks sample a small, specific slice of T1/T2 — they do not touch
voting, certificates, normalization's statistical defensibility, or
the organizer shell at all. Passing all seven is necessary to not fail
the mechanical portion outright; it is not sufficient proof of
everything else, which still depends on a human judge reading the
docs, the code, and the demo video.

**D167 — A `fixtures.json` bulk-importer is now a confirmed, high-
priority requirement, previously not designed at all. The organizers'
fixture shape (`event` / `tracks` / `judges` / `teams` / `projects` /
`scores`) is flatter than our schema and is explicitly described as
input, not a data model to adopt — "load it, transform it, put it in
whatever schema you can defend" is the organizers' own framing. The
importer must materialize `Submission`/`Score`/`JudgeAssignment` rows
directly from the fixture, bypassing Module 6's GitHub-verification
pipeline and Module 7's assignment gate entirely for this specific
import path.**
Context: this bypass is not optional — the fixture's `repo_url`
values are placeholder/fake, and the checker is explicitly stated to
run with the network off, so any attempt to run real GitHub
verification against fixture data would fail or hang. The normal
user-driven pipeline (register → submit → verify → assign → score)
stays completely unchanged for real usage; this importer is a
separate, direct-write path that exists solely to satisfy the
checker's need for pre-existing judge/project/score data at boot.

**D168 — CSV export (Module 8's progress-adjacent tooling, previously
the single most-flagged undesigned backend gap) is confirmed as one
of exactly seven mechanically-checked behaviors, at T2 — an organizer
calling the configured `csv_export` route must receive HTTP 200 with
a real CSV body. This elevates it from "should design soon" to
"blocks the acceptance checker from passing T2 at all if missing."**

**D169 — A seed-time static auth-header bootstrap is required and
previously undesigned. The checker never logs in — it expects our own
seed script to print one working, attachable header per role
(`organizer`, `judge_a`, `judge_b`, `participant`) when the portal
boots, which `.dogfood.toml` then records verbatim. This is
deliberately decoupled from Module 1's real session/login system —
the checker's headers are a fixed, boot-time convenience for exactly
four fixture identities, not a parallel authentication mechanism real
users ever touch.**

**D170 — `.dogfood.toml` is a new required root file, not previously
tracked as a deliverable alongside `README.md`/`ARCHITECTURE.md`/
`DATA-MODEL.md`/`JUDGING.md`/`LICENSE`. It holds: `base_url`, claimed
tiers plus a one-sentence pitch (checked against what the acceptance
report actually verifies — overclaiming a tier is explicitly called
out as the one thing that costs real points), the four seed-printed
auth headers (D169), and five route paths on our own API: `gallery`,
`submit`, `judge_scores`, `peer_scores`, `csv_export`.**
Context: `peer_scores` specifically is the URL that would return
judge A's scores — the checker requests it as judge B and expects a
401/403, which is the single check explicitly called out as costing
the most points if it fails, and explicitly must be enforced in the
backend, not hidden only in a template. This is architecturally
already correct in our design (`EventRoleGuard` +
`JudgeAssignment`-scoped checks, D62) — the remaining work is
confirming our real route surface has a clean single-judge-scores
endpoint shape this can point at directly.

---

## Module 16 (Fixtures Import) — built against docs/design/16-fixtures-import.md

**D171 — No general seed step (`prisma db seed` or equivalent) existed
anywhere in this codebase before this module, even though the design
doc's own Section 2 assumes one already runs "on every `docker compose
up` per Module 1's boot sequence."** Built here as the minimum real
infrastructure the doc's assumption requires: `apps/api/src/scripts/
seed.ts`, invoked directly from `docker-entrypoint.sh` right after
`prisma migrate deploy` (not through Prisma's own `db seed` CLI
wrapper — that would need ts-node/tsx as a new dependency for one
script; calling the compiled `dist/scripts/seed.js` matches this
project's existing script-execution convention instead, see
`bootstrap-admin.ts`). **What this does NOT do: build the "rich demo
event... showing off every module for a human judge clicking around"**
the doc describes as already existing seed content. That remains a
real, separate, not-yet-designed gap — flagged rather than quietly
built as a large add-on nobody asked for in this pass. One consequence
flows from this: the doc's Section 3 "grant our own existing seeded
demo-organizer account" also didn't have an account to grant — `seed.ts`
creates one minimal, fixed-identity organizer (`demo.organizer@raptor.local`)
solely so `.dogfood.toml`'s organizer header has a real account, not the
broader demo-organizer persona a rich seed would eventually own.

**D172 — Corrected docs/design/16-fixtures-import.md Section 4a's factual
claim that team-name uniqueness "has to live at the application layer...
not a database constraint."** It already is a database constraint
(`Team` model, `@@unique([eventId, name])`, present since Module 4) —
verified directly against `schema.prisma`, not assumed. The doc's
conclusion (duplicate fixture team names are a genuine case the importer
must handle) was still correct; only its reasoning about *why* was wrong.
Resolved without loosening Module 4's already-shipped, already-tested
uniqueness guarantee for real user-created teams: the importer
disambiguates a colliding fixture team name with a `" (2)"`/`" (3)"`
suffix before writing the `Team` row (`disambiguateTeamName`,
`fixtures-import.ts`), tracked back to the fixture's own team id via
`FixtureImportRecord` regardless of what display name was actually
persisted. Confirmed against the real file: `StillTrail` (×3),
`AmberSwitch` (×2), `OpenSignal` (×2) all import as distinct teams with
no constraint violation.

**D173 — Fixture judges' own `tracks` field (per-judge track list in
the real file) is not mapped to `EventMembership.trackIds` (Module 2's
judge track-scoping).** Flagged as an inference, not a literal
instruction — the design doc's Section 3 field-mapping table doesn't
mention this field at all, and none of the seven mechanically-checked
behaviors exercise track-scoped assignment visibility (Section 5's own
"what this explicitly does not do"). Smallest reasonable interpretation:
leave every fixture-imported judge unscoped (sees every track), rather
than guess at a mapping the doc never specified.

**Live-verified end-to-end against the real, official `fixtures.json`**
(8 tracks, 30 judges, 40 teams — 3 with duplicate names, 41 projects —
one team with two collapsing to one submission, 126 scores across 3
criteria) on a real local Postgres: exactly 40 teams/submissions
created (no constraint errors), the `tm_07` collapse kept the later
project's content with all 6 real judges' scores correctly
deduped/preserved per Section 4b's rule, rubric criteria split
33/33/34, running the seed step twice produced identical row counts
(idempotent, zero duplication), and all seven of `run.py`'s mechanical
checks (gallery load + contents, late-submission rejection,
judge-own-scores, peer-scores-refused, participant-refused-judge-scores,
organizer CSV export) passed against a live-booted API using the
seed-printed session cookies.

**D174 — Post-commit reconciliation pass against a hand-edited revision
of `docs/design/16-fixtures-import.md`.** The user independently
corrected Section 4a (arriving at the same conclusion as D172, in their
own words) and added a Section 5 correction stating no rich demo-event
seed exists — but three other spots in the doc still disagreed with
that Section 5 correction and with the already-shipped code:
- **Section 2** still claimed the seed step and a "rich demo event...
  for a human judge" both already existed per Module 1's boot sequence.
  Neither did before this module (D171) — fixed to say so plainly
  instead of contradicting Section 5 two sections later.
- **Section 3's organizer row** still said "our own existing seeded
  demo-organizer account," when Module 16 creates one minimal,
  fixed-identity account itself (`demo.organizer@raptor.local`) — fixed.
- **Section 3's `projects` row** named `demoVideoUrl`/`liveUrl` as
  examples of fields that get a synthesized placeholder. Checked
  against Module 5's actual `submit()` validation
  (`submissions.service.ts`): neither is required, so both stay
  genuinely `null` when absent (which the fixture always is) — the
  placeholder only ever applies to `description`/`repoUrl`. Fixed the
  example to match what the code (correctly) does.
- **Section 6** still asserted the disproven "uniqueness lives at the
  application layer, not a database constraint" reasoning for why
  duplicate team names import successfully, plus a dangling
  copy-pasted sentence fragment left over from an earlier edit — both
  fixed.

**Real test gap this pass surfaced:** Section 6 requires testing "a
fixture project missing an optional field... produces a valid
`Submission` row with the synthesized-placeholder value" — never
actually exercised, because none of the real file's 41 projects omit
`summary`/`repo_url`. Extracted the field-resolution logic into its own
pure function (`resolveSubmissionFields`, `fixtures-import.ts`) and
added direct unit tests for the omitted-field case (4 new tests, 432
total in `apps/api`). Re-ran the seed script against the real fixture a
third time after this refactor — identical event/submission/assignment
IDs, confirming the extraction changed nothing behaviorally.

---

## Module 17 (Seed-Time Auth-Header Bootstrap) — built against docs/design/17-auth-header-bootstrap.md

**D175 — Implemented the role-keyed idempotent session reuse Section 4
requires, which Module 16's original `seed.ts` didn't have** (it issued
a brand-new `Session` for all four roles on every single boot). Since
`Session` only ever stores a token's hash, never the raw value, the raw
token can't be recovered from the database on a later run — the doc's
own Section 3 file requirement (`apps/api/.fixture-auth-headers.txt`,
gitignored) turns out to be load-bearing for this, not just a
convenience: it's the only place a previously-issued raw token survives
between runs. Implementation (`apps/api/src/scripts/
auth-header-bootstrap.ts`): a `FixtureImportRecord` row per role
(`fixtureType: "auth-session"`, `fixtureId` = role name) records which
`Session` id was issued for it; a re-run checks that session is still
present and unexpired, and if so, reads the matching line back out of
the file and reprints the identical value instead of issuing a new one.

**Live-verified, not just unit-tested:** ran the seed script twice in a
row — first run issued four fresh sessions (`[freshly issued]`), second
run reprinted byte-identical header values for all four roles
(`[reused from prior run]`), confirmed zero session-row growth for the
reused run. Re-booted the API and re-ran all six of the T1/T2 checks
(gallery, late-submission rejection, judge-own-scores, peer-scores
-refused, participant-refused-judge-scores, CSV export) against the
*reused* tokens specifically — not just the fresh ones from the last
verification pass — confirming a reused credential is a fully working
one, not a stale echo. 8 new unit tests (440 total in `apps/api`)
cover the header-line format (Section 2's "complete line, not a bare
token" requirement, confirmed against the real `run.py` source) and the
raw-`#`-character guard (Section 6) — confirmed directly rather than
assumed, since `generateRawToken()`'s hex alphabet can't produce one.

---

## Module 18 (CSV Export) — built against docs/design/18-csv-export.md

**D176 — Replaced the original single-export CSV module (D170) with
the full two-tier design: 8 organizer-tier exports
(`apps/api/src/export/export.{service,controller}.ts`) and 4
admin-tier exports (`admin-export.{service,controller}.ts`,
`siteAdmin`-only via the existing `SiteAdminGuard`, every call
audited).** Added `csv-stringify` as a real dependency — the doc
explicitly calls out "never hand-rolled string joining," which is
exactly what the original `csvEscape()` was; replaced with RFC
4180-compliant encoding streamed to the response rather than built as
one buffered string first.

**Two factual corrections made to the doc during implementation, both
checked directly against `schema.prisma`/`audit.service.ts` rather than
assumed (same discipline D172 established for Module 16):**
- **Section 4's "Admin Name/Email" column** named a nonexistent
  `TeamMembership.isAdmin` field. The real source is `Team.adminUserId`
  (already Module 4's fixed, non-transferable team-admin pointer).
- **Section 13's Target/Reason columns** implied `AuditLog` has
  structured columns for them. It doesn't — only `actorUserId`/
  `action`/`metadataJson` exist (`audit.service.ts`), and
  `metadataJson`'s shape varies per action across roughly 30 call
  sites. Implemented as a best-effort extraction over a fixed set of
  common id-like keys and reason-like keys, flagged in both the doc and
  code as an inference, not a guaranteed-accurate structured read.

**Real Module 16 gap this build surfaced, fixed additively (same
"export work surfaces backend gaps" pattern already established for
the frontend build):** the Registrations export came back empty
against the real fixture-imported event, despite 91 real participants
existing. Root cause — `teams.service.ts`'s `assertRegisteredParticipant`
requires an `EventMembership(role: PARTICIPANT, invitationStatus:
ACCEPTED)` row to exist before a user can join or create a team, in the
real user-driven pipeline. Module 16's fixture importer created
`User`/`TeamMembership` rows for team members directly but never this
one — a state the real pipeline could never produce, since it's
enforced as a precondition, not a side effect, of team membership.
Fixed by upserting the missing `EventMembership` row for every fixture
team member; restructured so this runs on every seed execution (not
gated behind the team's own one-time creation check), since existing
already-imported fixture data needed the same backfill a fresh import
would now get automatically. Re-ran the seed step against the real
40-team fixture after the fix — Registrations export went from 0 rows
to 91, one per real team member, with correct team-name resolution.

**Live-verified against the real fixture-imported event and a real
`siteAdmin` account:** all 8 organizer-tier exports return 200 with
real CSV bodies; a judge and a participant are both refused (403) on
an organizer-tier export; an event's own organizer is refused (403) on
an admin-tier export; all 4 admin-tier exports return 200 for a real
`siteAdmin`, including cross-event data (the "All events" export
correctly showed multiple unrelated events from earlier sessions'
leftover test data, each with its own independently-computed
`EventPhase`). 17 new unit tests (457 total in `apps/api`) cover Rank
gating (blank pre-publish, populated once `LIVE`), per-run dense
ranking in the Normalization Comparison export, the Voting Results
export's per-round latest-version selection and `Won` mapping
(confirmed `VotingResultEntry.isSharedWin` is already true for a lone
clear winner, not only a tie — `VotingService.computeTally`'s own
`maxCount > 0 && voteCount === maxCount`), and the `AuditLog`
Target/Reason heuristic.

---

## Post-build reconciliation — Modules 16 and 18, hand-edited doc revisions

**D177 — `docs/design/16-fixtures-import.md` Section 5a: a real,
previously-unflagged dependency confirmed against the actual `run.py`
source.** The checker's "gallery shows a fixture project" check scans
only page-one of the gallery's raw response for the first three
fixture projects' titles (`prj_01`-`prj_03`, file order), not the whole
gallery. Checked directly rather than assumed: `SubmissionsService`'s
gallery query (`submissions.service.ts`) has no `take`/`skip` and the
controller adds none either — every submission is always returned in
one unpaginated response, so nothing can ever push these three titles
off "page one." Confirmed live against the real fixture: the gallery
response for the 40-team seeded event contains all three real titles
("Glass Signal", "Small Meadow", "Deep Compass"). No code change
needed — this was a real risk worth checking, not a real bug.

**D178 — `docs/design/18-csv-export.md` Section 13, corrected a second
time: empty Target/Reason cells must show a literal `"(unavailable)"`,
not a blank string.** A blank cell is indistinguishable from "nothing
happened here"; `metadataJson`'s shape isn't guaranteed to carry either
concept for every action type, so the absence needs to be visible, not
silent. Fixed in `describeAuditTarget`/`describeAuditReason`
(`admin-export.service.ts`) and their unit tests. Live-verified against
the real audit log: entries with no recognizable metadata key (e.g.
`STAFF_ACCOUNT_CREATED`, `GITHUB_TOKEN_ADDED`) now show
`(unavailable)` in both columns; entries with a resolvable target
(e.g. `SUBMISSION_SUBMITTED`) still resolve correctly.

---

## Module 19 (`.dogfood.toml` Assembly & `peer_scores` Route) — built against docs/design/19-dogfood-toml.md

**D179 — Built the dedicated `GET /submissions/:submissionId/judges/
:judgeId/scores` route** (`apps/api/src/scoring/
audit-scoring.controller.ts`, `ScoringService.getForAudit`) —
parameterized by which judge, not the caller, so an organizer can
audit one specific judge's review of one specific submission (a real
capability the old `/assignments/:id` route never had, since its
ownership check only ever allowed the exact assigned judge). Guard:
`caller.id === judgeId`, OR `ORGANIZER`/`ACCEPTED` membership on the
submission's event, OR `siteAdmin` (audited, same `SITE_ADMIN_BYPASS`
convention as `EventRoleGuard`). `.dogfood.toml`'s `judge_scores`/
`peer_scores` moved onto this route, still the same URL for both
(D170's established convention unchanged).

**Three factual corrections to this doc's own Section 3 example,
checked directly rather than assumed:** no route in this codebase is
`/api/`-prefixed (`main.ts` has no `setGlobalPrefix`); `submit` was
pointed at the submission *create* route, not Module 5's real
`POST /submissions/:id/submit`; and `judge_scores`/`peer_scores` were
shown as two different paths, contradicting the already-shipped,
already-verified D170 design (same URL, different header). Corrected
in the doc rather than built as written.

**Live-verified against the real fixture-seeded event:** judge A's own
header — 200; judge B's header on the identical URL — 403
`NOT_ASSIGNMENT_OWNER` (the actual `peer_scores` proof); the seeded
organizer's header — 200 (the new audit capability); the seeded
participant's header — 403; no session at all — 401. 7 new unit tests
(465 total in `apps/api`) cover all three guard branches (self,
organizer, refused) plus the `siteAdmin` audit-bypass.

---

## Module 20 (Demo Environment) — built against docs/design/20-demo-environment.md

**D180 — Implemented `DEMO_MODE` end-to-end**: both `docker-entrypoint.sh`
scripts (api and worker) select `${POSTGRES_DB}_demo` instead of
`${POSTGRES_DB}` when `DEMO_MODE=true`, resolving to exactly
`raptor_demo` under this repo's actual (non-overridden)
`docker-compose.yml` config. `apps/api/src/scripts/
ensure-demo-database.ts` creates that database if it doesn't exist yet
(Postgres has no `CREATE DATABASE IF NOT EXISTS`; `prisma migrate
deploy` assumes its target already exists) — treats the duplicate
-database error as success, not failure, since it's meant to be re-run
on every boot. `GET /config/public` (`AppController`, no `/api` prefix
— same correction as D179) backs the frontend's `DemoBanner` component.

**Real bug found and fixed during the build, not a design gap:** the
Running event's original timeline had `registrationClosesAt` landing
*after* `eventStartsAt` — `computeEventPhase` (`event-phase.ts`) walks
its boundary list in fixed order and stops at the first one still in
the future, so this inverted ordering made the event compute as
`REGISTRATION_OPEN` instead of the intended `SUBMISSIONS_OPEN`.
Confirmed live (curled the public events list, saw the wrong phase)
before fixing, not caught by inspection alone. Fixed by moving
`registrationClosesAt` to before `eventStartsAt` — the doc's narrative
("registration still open for others") describes the seeded *data*
(some registered participants haven't joined a team yet), not a
distinct `EventPhase` value; the phase model has no combined state for
that, by design.

**`seed-demo.ts` reuses this project's own tested pure formula modules
rather than reimplementing the math**: `computeRankResults`/
`computeSpecialAwardWinners` (results-formula.ts) for the Archived
event's published ranking — including a genuine tied rank 1, produced
by deliberately giving two teams identical per-judge scores, not a
hand-set rank number; `computeJudgeZScore`/`rescaleToZeroHundred`
(normalization-formula.ts) for its one real `NormalizationRun`;
`computeJudgeRawTotal`/`computeFinalScore` (score-formula.ts)
throughout. Certificates are signed for real via
`CertificateSigningService` (instantiated directly — a plain class,
no DI needed), not hand-faked signatures, so they verify correctly
through the same code path a real certificate would.

**Live-verified end-to-end against a real scratch `raptor_demo`
database:** all four events created with correct team/submission
counts (Draft 0, Running 6 [4 submitted + 2 not], Voting 5, Archived
6); the Archived event's tie confirmed at rank 1 (2 entries); 12
certificates issued (9 participant + 3 winner, matching the tied
teams' combined member count); the Voting event's round is `ACTIVE`
with votes cast but zero published `VotingResultVersion` rows (tallies
correctly withheld while open, Module 11's own rule); re-ran the seed
script twice — event count stayed at 4, no content duplication, only
timeline fields refreshed. Booted the real API against this database
and confirmed live: `/config/public` reports `demoMode: true`, the
public events list shows only the two `PUBLISHED` events (Archived is
correctly hidden from that list and from its own gallery once
non-`PUBLISHED` — pre-existing app behavior, not something this module
changed), a certificate view renders and 200s, the Archived event's
public results page 200s. Confirmed the negative case too: `DEMO_MODE`
unset connects to the ordinary `raptor` database, `/config/public`
reports `demoMode: false`, and `seed-demo.ts` refuses to run at all
without `DEMO_MODE=true` (a hardcoded guard, not just relying on the
entrypoint never calling it). The frontend banner was verified in a
real browser (Playwright, installed for this check): renders the
exact required text, has no dismiss control, persists across
navigation, and is absent entirely against a non-demo API.
`docker-compose.yml`'s `DEMO_MODE` passthrough and the entrypoint
shell changes are reviewed but not container-tested — this sandbox has
no Docker (same limitation noted in `apps/api/Dockerfile`'s own header
comment).

**Post-build reconciliation:** the design doc's Section 2.1 was
rewritten to list every timeline field explicitly, in order, for all
three date-driven events, closing the "partial spec hides an ordering
bug" gap the Running-event bug above demonstrated. `seed-demo.ts`'s
Voting/Archived event constants had small day-offset drifts from these
now-exact values (e.g. Voting's `registrationOpensAt` was `-10d`
against the doc's `-9d`) — none individually broke ordering, but
updated to match the doc precisely rather than leaving code and doc
to describe slightly different timelines. Also fixed Section 5's own
lingering `/api/config/public` reference (missed when Module 19's
`/api`-prefix correction, D179, was made elsewhere). Re-verified live
after both fixes: phases still compute correctly, 470/470 tests
passing.

---

## The real run.py — Module 19's schema guess corrected, first genuine checker run

**D181 — The organizers' actual `run.py` was obtained and run for real
for the first time. It exposed a genuine schema bug in `.dogfood.toml`,
now fixed, and the run itself passed every check.**

Context: `.dogfood.toml` (D170, Module 19) was originally assembled by
guessing the shape the organizers' checker would expect — a nested
`[checker]` / `[checker.routes]` / `[checker.auth_headers]` structure,
with per-tier `t1_core`/`t2_judging`/`t3_public`/`t4_stretch` booleans
under `[tiers]`. No copy of the real `run.py` existed anywhere in this
repo to verify that guess against; it was carried as an assumption
across Modules 19/20.

**The real `run.py` (provided by the user this session, at
`D:\Raptor\run.py`, outside this repo) reads a completely different,
flatter shape**: top-level `[portal].base_url`, top-level `[routes]`
(gallery/submit/judge_scores/peer_scores/csv_export), top-level `[auth]`
(four full `Cookie: raptor_session=...` header lines), and `[tiers].
claimed` (a plain list of `"T1"`/`"T2"`/`"T3"`/`"T4"` strings — no
per-tier booleans at all; pass/fail is computed live from the checks
themselves, never read from the config). The guessed nested `[checker.*]`
shape would have crashed immediately on `cfg["portal"]["base_url"]`
(direct dict indexing, no `.get()` fallback) — a real bug that would
only have surfaced at the worst possible moment, during an organizer's
actual grading run, never having been caught by anything in this repo's
own test suite since nothing here ever previously executed the real
script.

**Fixed**: `.dogfood.toml` restructured to the real top-level
`[portal]`/`[routes]`/`[auth]` shape. The route values (already correct
from Module 19/20's own live verification) carried over unchanged; the
four auth header values were re-sourced from a fresh local boot of
`apps/api/.fixture-auth-headers.txt` and committed as full `Cookie:
raptor_session=...` lines (previously left blank in version control —
now committed deliberately, since they're throwaway fixture/seed
session rows against a local dev database, not production credentials,
and a real checker run needs them present to actually connect). The
`t1_core`/`t2_judging`/`t3_public`/`t4_stretch` booleans were kept as
this project's own human-readable bookkeeping (referenced from
`README.md`) since `run.py` silently ignores unrecognized keys — but
they are no longer what the real checker reads.

**Executed for real**: Postgres already running locally on `:5433`
(D57), `apps/api` booted in dev mode on `:4000` against the existing
fixture-seeded database, then `python run.py .dogfood.toml --fixtures
apps/api/prisma/fixtures.json` — the organizers' actual, unmodified
script, not a reproduction. Result: all 7 checks `PASS` (gallery
public; fixture project title present in the gallery body; closed-event
late submission rejected with a 4xx; judge sees own scores; judge
cannot see a peer's scores; participant blocked from judge_scores;
CSV export returns 200 with comma-delimited content), and the script's
own tier computation reports `claimed T1 T2, verified T1 T2` — no
overclaim warning. The full, unedited transcript is committed at
`acceptance-report.txt`.

**Tier claims updated to match, honestly**: `t1_core` and `t2_judging`
flipped to `true` — genuinely, independently confirmed by the real
checker, not this repo's own reproduction of equivalent checks (the
distinction D166's earlier entry drew explicitly). `t3_public` and
`t4_stretch` remain `false` — not because anything failed, but because
this `run.py` implements no checks for either tier at all (only
`TIERS = ["T1", "T2"]` worth of `Check` objects exist in the script);
whether those tiers hold is outside what any mechanical checker here
can confirm, and stays a human-judge call per D166's original framing.
`README.md`'s "Tiers claimed" section updated to show the real
transcript rather than the earlier all-`false` placeholder.

Rejected: leaving the nested `[checker.*]` guess in place since it "was
probably close enough" — the whole point of this file (D170: "the
receipt, not the ambition") is that it's read by an external, unmodified
script; a structural guess that would crash on first contact is exactly
the kind of overclaim-by-omission this project's own honesty rule
exists to catch, once the real artifact was actually available to check
against.

---

## Four new bonus-challenge documents — verified live, one real bug found and fixed

**D182 — `stages/22-pairwise-mode.md`, `NORMALIZATION.md`,
`THREAT-MODEL.md`, and `API.md` (initially landed at
`docs/design/bonus-challenges/bonus/` — an as-delivered packaging
bundle, treated like `fixtures.json`/`run.py` while it was being read,
not edited in place) were added this session. Each had explicit open
items — "not yet performed," "claims still to confirm," "things to
confirm" — that this entry closes out with real findings, not
inference.**

**Pairwise Mode (`22-pairwise-mode.md`):** explicitly "design only, not
implemented, not claimed" per its own header — left untouched, on
purpose. Nothing to verify; nothing to build.

**Threat Model — all five items in its former Section 7 checked
directly against the running code, each confirmed, folded into
Sections 3.5/4/5, and Section 7 itself deleted per its own instruction
("remove this section once each item is checked"):**
1. Verification reads the commit **author date**
   (`apps/worker/src/verification/github-client.ts`), not committer
   date or GitHub push time — the most spoofable of the three, exactly
   the risk 5.5 already named.
2. The gallery (`submissions.controller.ts`) carries **no rate-limit
   guard** — confirmed by reading every guard in the codebase; only
   uploads, team-join, comments, and voting have one.
3. Login (`auth.controller.ts`) carries **no rate-limit guard** either.
4. Fixture import has **no kill switch** — `seed.ts` imports
   unconditionally whenever a fixtures file exists at the default path
   or `FIXTURES_PATH`; no env flag disables it.
5. Session cookies: `httpOnly: true`, `secure` true in production,
   **`sameSite: 'lax'`** (`session.service.ts`) — real CSRF protection,
   confirmed rather than assumed.

**API.md:** confirmed, by grepping the entire `apps/api` tree, that
**no OpenAPI/Swagger tooling exists anywhere** — zero `@nestjs/swagger`
usage, no generated `openapi.json`, none of the three drift checks
wired in. The doc's own hedge ("API-first by architecture, specification
pending verification") was accurate; Section 5 rewritten from "confirm"
to "confirmed" — this is a real, unbuilt gap, not a misunderstanding.
Also confirmed: README/`.dogfood.toml`/this file all agree on
`http://localhost:4000`, and the session cookie is named
`raptor_session` with the attributes above.

**Normalization Proof (`NORMALIZATION.md`) — the substantial one, a
real bug found and fixed, not just documented:**

Section 7 said "not yet performed" and named three possible outcomes
of running normalization on the real fixture-imported event and
comparing against `scripts/normalization-proof.py`. Performed live:
booted the api against the real fixture database, triggered
`POST /events/:id/normalization-runs`, exported
`GET .../export/normalization-comparison.csv`. Two real obstacles hit
before a run could even happen — both left as permanent, working
platform behavior, not bypassed:

1. The already-imported fixture event's `resultsAnnounceAt` had long
   passed → `NORMALIZATION_LOCKED` (D126's lock, working exactly as
   designed).
2. Tried extending `resultsAnnounceAt` forward via `PATCH` to reopen
   the window → `TIMELINE_FIELD_IMMUTABLE` (D16's "a passed-phase
   timestamp can't be edited," also working as designed).

With the user's explicit authorization, reset the local fixture
database (`prisma migrate reset`, throwaway dev data only) and
re-seeded, giving a fresh, open normalization window. Manipulated
`judgingClosesAt` directly in the database into the recent past
(same technique this project's own test suite already uses — CLAUDE.md:
"tested by manipulating fixture timestamps... never by waiting real
time") rather than waiting 24 hours for the fixture's own relative
window to open naturally.

**First real run produced outcome 2 exactly as the document predicted**:
`NormalizedJudgeScore.usedFallback: true` for **123 of 123** judge-scores
— every judge on the event baseline, zero using a personal profile, not
just the 8 genuinely below minimum-N. Root cause, confirmed by reading
`fixtures-import.ts`: it writes `JudgeAssignment`/`Score`/`JudgeReview`
rows directly and never triggers the calibration-update side effect a
real `submit-review` call carries (`stages/09-normalization.md` Section
3). **Fixed** — `importFixtures()` now recomputes every imported
judge's calibration profile after import, reusing
`computeMeanStdDev`/`computeJudgeRawTotal` (the exact same pure
functions `CalibrationService.recompute()` uses — not a second
implementation of the formula that could drift from the real one).

**Re-verified after the fix**: **22 judges on their own profile, 8 on
the event baseline — an exact match** to `normalization-proof.py`'s
own independently-computed numbers. Re-ran the normalization export:
real rank movement appeared, and the corrected top-5
(Iron Switch, Slow Trail, Salt Ledger, Salt Loom, Salt Kiln) matches 4
of the reference script's own top-5 in identical order; the one
swap (Salt Kiln/Dry Relay) is fully accounted for by a confirmed,
intentional convention difference — the platform's
`computeMeanStdDev` uses population stddev (divide by N), the
reference script uses sample stddev (divide by N−1) — exactly the
"small differences" caveat Section 7 already anticipated, not a new
problem. 470/470 tests still pass, including `fixtures-import.spec.ts`,
unchanged by this fix.

**Housekeeping consequence of the DB reset, not a separate decision**:
resetting the local fixture database changed every fixture-derived ID
(`event`, `submissions`, `judges`), which made `.dogfood.toml`'s
committed route/auth values stale. Regenerated them from the fresh
seed and re-ran the real `run.py` (D181) against the new state — all 7
checks still pass, `claimed T1 T2, verified T1 T2`, `acceptance-report.txt`
updated to the new transcript. No change to which tiers are claimed.

Rejected: leaving Section 7's three hypothetical outcomes as
hypothetical once a real run was actually possible — the whole point
of this document (like `.dogfood.toml`) is being an honest receipt,
not a plausible-sounding forecast; once the live check could actually
be run, running it and fixing what it found was the only option
consistent with every other "verify live, don't assume" pattern already
established this session (D178–D181).

---

## Module 23 (Bonus Challenges) — file layout, exact-reproduction check, statuses

**D183 — `stages/23-bonus-challenges.md` arrived specifying an exact
file layout different from where D182's four documents had landed, plus
a precise "done when" bar and a four-value status vocabulary per
bonus. Reconciled fully:**

**Files moved to the paths Section 4 specifies** — `THREAT-MODEL.md`,
`NORMALIZATION.md`, `API.md` to the repository root (out of
`docs/design/`); `22-pairwise-mode.md` and `23-bonus-challenges.md`
into `stages/`; `normalization-proof.py`/`bradley-terry-reference.py`
into a new `scripts/` directory; their reference output files into
`docs/`; a new `scripts/requirements.txt` (`numpy`) added, since the
scripts need it and the acceptance checker (`run.py`) deliberately
doesn't. The `docs/design/bonus-challenges/` packaging bundle was
deleted once everything needed was copied out — Section 4's own
instruction ("not committed: the packaging zip and its `bonus/`
folder"). Fixed `NORMALIZATION.md`'s placeholder fixture path
(`path/to/fixtures.json`) to the real one.

**Exact-reproduction check performed** (Normalization Proof's "done
when" item b): re-ran `normalization-proof.py` with the default 2000
simulations against the real fixture and diffed against the committed
`docs/normalization-proof-output.txt` — byte-identical except for a
CRLF-vs-LF line-ending difference from the local Windows shell.
Confirmed reproducible, not just plausible.

**`JUDGING.md` Section 5.4 added** — the required pointer to
`NORMALIZATION.md`'s sparse-data limitation, closing that document's
last mechanical "done when" item.

**Statuses determined against Section 2's vocabulary, not assumed**:

- **Threat Model: `Claimed`.** Every item in its "done when" list is
  independently true — five abuse classes covered, every control
  checked against real code (D182), its former Section 7 empty and
  removed. This is the first bonus to cross the bar.
- **Normalization Proof: `Documented, unverified` — one item left.**
  Every mechanical item is done (cross-check performed, exact
  reproduction confirmed, real fixture path, `JUDGING.md` pointer). The
  one remaining item — Section 7's "adopt the joint-model upgrade, or
  keep the current method with its limitation documented" — is
  explicitly the project owner's call (it would change an already
  built and tested module), not something decided here. Per Rule 1
  ("partial evidence means Documented, unverified"), it can't be marked
  `Claimed` until that decision is made and logged.
- **API First: `Designed, not built`.** Confirmed in D182 — no
  OpenAPI/Swagger tooling exists anywhere in the codebase. Real,
  scoped work (generated `openapi.json` plus three wired-in drift
  checks), correctly left undone rather than half-built.
- **Pairwise Mode: `Designed, not built`**, unchanged — explicitly not
  attempted per its own document's framing.

`README.md` gained a "Bonus challenges" section (table plus the same
status vocabulary, TOC entry, docs-map rows for the three new root
docs, and the numpy-vs-stdlib note Section 4 requires) so a reader
never sees a claim here that the underlying documents don't back.

**Two items flagged back rather than decided — both explicitly named
as the project owner's call in `stages/23-bonus-challenges.md` Section
7, not mine to resolve:**
1. Whether to adopt the evaluated-but-unimplemented joint-model
   normalization upgrade, or keep the current z-score method with its
   sparse-data limitation documented as-is.
2. Whether to attempt API First or Pairwise Mode as real builds at all,
   given the organizers' own stated advice favors doing fewer bonuses
   properly over sampling all four.

**D184 — Both of D183's flagged owner decisions resolved by the user,
directly:**

1. **Normalization method: keep the current z-score method as-is.**
   The joint-model upgrade's simulated advantage was weighed against
   the cost of changing an already-built, tested, and (as of D182)
   live-verified module on the strength of a synthetic simulation with
   assumptions the document itself never claimed as certain
   (`NORMALIZATION.md` Section 4's own hedge: "different assumptions
   move the numbers... but this is a model, not the organizer's data").
   The sparse-data limitation this fixture exposes (median 3 reviews
   per judge, unstable personal profiles) is a data-coverage problem,
   not a formula problem — a joint model doesn't fix sparse coverage
   either, it just degrades somewhat more gracefully against it in
   simulation. Documented as a known, visible limitation
   (`NORMALIZATION.md`, `JUDGING.md` Section 5.4) rather than engineered
   around. This closes Normalization Proof's last "done when" item —
   **status moves from `Documented, unverified` to `Claimed`**
   (`stages/23-bonus-challenges.md` Section 3.2).
2. **Remaining bonuses: stop at two.** API First and Pairwise Mode both
   stay `Designed, not built` — not attempted further, by deliberate
   choice, not by running out of time. Rationale given directly: "build
   perfect rather than build all." Matches the organizers' own stated
   advice (`stages/23-bonus-challenges.md` Section 1: "do the ones that
   can be done properly and not sample all four") and this project's
   founding concern (D1: avoid exactly the "AI slop" that comes from
   generating breadth over depth). Pairwise Mode in particular is, by
   its own document's admission (Section 7), "the only bonus that is a
   second pipeline rather than a document or a report" — comparable in
   scope to an entire new judging mode, for 5 tie-break points with no
   direct score effect.

Both `stages/23-bonus-challenges.md` (status line, Section 3.2, Section
7) and `README.md`'s Bonus Challenges table updated to match —
Normalization Proof now shown as `Claimed` alongside Threat Model; API
First and Pairwise Mode explicitly labeled as a deliberate stop, not an
open gap.

---

## Module 24 (Release Closeout) — Group A/B items built and verified

**D185 — Built the Group A/B closeout checklist from
`stages/24-closeout.md`, with two items explicitly skipped and one
item's decision already covered by D184:**

- **A1, A2, A3** — already done (D181, D182). Re-verified as part of
  this module's own full test/acceptance re-run below.
- **A4 (rate limits).** Added `LoginRateLimitGuard` (keyed by source IP
  + normalized email, 10/15min default, generic 429 — never confirms
  whether an email is registered) on `POST /auth/login`, and
  `GalleryRateLimitGuard` (per-IP, 120/min default) on the public
  gallery list and submission-detail routes. Both reuse the existing
  `RateLimitService` (fail-open on a Redis outage, same posture as
  every other limiter in this codebase) — no new rate-limit mechanism
  invented. Both configurable by environment variable; neither can
  affect the acceptance checker, whose entire run is a handful of
  requests total.
- **A5 (fixture-import switch).** `FIXTURES_IMPORT`, default `true`.
  `false` skips `seed.ts` entirely — before any file read or database
  connection — so a real deployment carries no fixture event and no
  seeded checker credentials (THREAT-MODEL.md 5.7, now closed rather
  than just documented). Confirmed live and by reading
  `docker-entrypoint.sh`: independent of `DEMO_MODE` — `seed.js`
  (fixtures) and `seed-demo.js` (demo events) are two separate boot
  steps, so `FIXTURES_IMPORT=false` with `DEMO_MODE=true` still seeds
  the four demo events normally.
- **A6 (cookie attributes).** `secure` is now `COOKIE_SECURE === 'true'`,
  an explicit setting rather than inferred from `NODE_ENV` — a
  production deployment without TLS yet configured shouldn't have this
  silently flip on just because `NODE_ENV=production` (it would break
  login: browsers refuse to send a `Secure` cookie back over plain
  HTTP). `httpOnly`/`sameSite: 'lax'` were already correct (D182).
  Confirmed by reading every `@Get` route in the codebase (~50 of them):
  none perform a mutation.
- **A7 (gallery search/filter).** Added optional `q` (case-insensitive
  title/description match) and `trackId` params to
  `GET /events/:eventId/submissions`. With neither supplied, the where
  clause is unchanged from before — confirmed live: still returns all
  40 fixture submissions, since `.dogfood.toml`'s `gallery` check reads
  this exact route's raw body for a fixture title.
- **A8 (Docker cold start).** Not performed — this sandbox has no
  Docker (same limitation noted in `apps/api/Dockerfile`'s own header
  comment and every prior Module 19/20 entry). Left honestly untested
  in this environment rather than assumed passing.
- **A9 (base URL/port).** Re-checked — already consistent (D182);
  README/`API.md`/`.dogfood.toml` all agree on `http://localhost:4000`.
  No change needed.
- **B1 (organizer audit-log viewer).** Added a nullable, indexed
  `eventId` column to `AuditLog` (migration
  `20260928172433_audit_log_event_id`). `AuditService.record` now
  extracts `eventId` from the metadata object automatically
  (`extractEventId`, exported so the backfill script reuses the exact
  same rule) — confirmed by grep that every existing event-scoped call
  site already puts `eventId` directly in its metadata literal, so this
  required **zero changes to any of the ~30 existing `audit.record`
  call sites**. `scripts/backfill-audit-log-event-id.ts` catches up
  pre-existing rows once, idempotently (only ever touches rows where
  `eventId IS NULL`, never guesses one where metadata carries none).
  New route `GET /events/:eventId/audit-log`
  (`OrganizerAuditLogController`/`Service`), organizer-or-siteAdmin via
  the same `EventRoleGuard` every other organizer route uses — its
  cross-event isolation is already proven by that guard's own existing
  test suite, not re-tested per-controller. Cursor-paginated (50/page),
  filterable by date range and action. Frontend: an "Audit log" item
  in the organizer shell sidebar and a list page, using the same
  Card-list pattern every other organizer-shell list already uses
  (not a separate desktop-table/mobile-card pair — nothing in this
  codebase works that way). **Live-verified end-to-end**: triggered a
  real `VOTING_ELIGIBILITY_MODE_SET` action as organizer, confirmed it
  appeared in the new route immediately with the correct actor/action,
  with `eventId` populated automatically and no manual backfill needed
  for a fresh write.
- **B2 (ballot order).** Checked `stages/11-voting.md` directly — no
  mention of randomized ballot order anywhere in the spec. Per the
  closeout doc's own fallback ("if not required, record the decision
  and skip"): **not required, skipped.** No code change.
- **B3 (OpenAPI).** Explicitly skipped — this is the API First bonus
  the project owner already decided not to build (D184). Flagged back
  to the user directly before touching anything, given it visibly
  contradicted a decision made two turns earlier; user confirmed
  keeping D184 standing.
- **C1–C4, C7** — already done as part of D182/D183 (real fixture path
  in `NORMALIZATION.md`, `JUDGING.md` Section 5.4 pointer,
  `scripts/requirements.txt`). This entry is C4's own log for A4–A9/B1/B2.
- **C2 (README).** Added a "Production hardening" table (the four new
  A4–A6 settings, defaults, and what to change for production) and
  extended the audit-log line in "What's included."
- **C5 (THREAT-MODEL.md).** Items 4, 7, 8, 9 in Section 5 rewritten —
  each previously said a mitigation did not exist (true when D182
  wrote it); now each states the real fix that now exists (A4/A5/A6
  above) plus the honest residual risk that remains even with it (a
  generous rate limit slows but doesn't stop a determined attacker
  rotating IPs; `FIXTURES_IMPORT` still defaults to `true`; a login
  rate limit resets after its window rather than permanently locking
  an account). Never left describing a gap that a few edits earlier in
  this same session had already closed.
- **C6.** No bonus status changed by this module's work — Threat
  Model's `Claimed` status already accounted for exactly this kind of
  future code change (its bar is "every control checked against the
  code," which C5 keeps satisfied by keeping the document in sync, not
  by freezing the code).
- **C8 (licence).** Not touched — user explicitly kept Apache-2.0
  (already the project's licence throughout; `stages/24-closeout.md`'s
  own "MIT" instruction was flagged back rather than followed, given a
  licence-type change is a real legal decision, not a housekeeping
  edit a document should silently make).
- **C9.** Full test suite re-run after all of the above: 500/500
  passing (up from 470 — 30 new tests across `seed.spec.ts`,
  `login-rate-limit.guard.spec.ts`, `gallery-rate-limit.guard.spec.ts`,
  `audit.service.spec.ts`, `backfill-audit-log-event-id.spec.ts`,
  `organizer-audit-log.service.spec.ts`, and the new
  `listSubmittedForEvent` filter tests). `apps/web` typechecks clean.
  `apps/api` builds clean. The real `run.py` re-run after all code
  changes — see the acceptance-report update below.
- **C10 (stray-file cleanup).** Attempted — blocked by the safety
  classifier (pre-existing files not explicitly named by the user this
  turn, even though this document instructs it). Left in place,
  flagged back to the user directly rather than worked around.

**Not done, by explicit user instruction, overriding this document
where they conflict:** B3 (OpenAPI/API First) and C8 (MIT licence
switch). Both flagged back before being skipped, not silently ignored.

---

## `docs/design/FRONTEND-MEGA-DOC.md` — audited against the real frontend, three real gaps fixed

**D186 — A consolidated, all-34-pages frontend design reference
arrived ("consolidating and superseding scattered prior work"),
including an explicit correction dropping a navy/indigo/fuchsia
gradient hero and banning purple/violet/indigo/fuchsia entirely. Given
this project's own documented history of flip-flopping on exactly this
color question (monochrome → "boring," +violet/teal/rose → this doc's
reversal), flagged back to the user directly before touching anything,
rather than silently picking a side. User confirmed: follow the new
doc's color rule, and audit the rest for concrete gaps rather than a
full rewrite.**

**Audited every checkable claim in the doc against the real code —
found it already compliant on every point except one:**

- **Color palette:** already fully compliant, predating this doc.
  `tailwind.config.ts`'s `colors` object fully replaces Tailwind's
  defaults with only gray/blue/status colors — no violet/purple/
  indigo/fuchsia utility class even exists to use, structurally, not
  just by convention. Grepped the whole `apps/web` tree for every
  literal violet/purple/indigo/fuchsia hex value: none found.
- **Typography:** already compliant — `globals.css`'s `--font-display`/
  `--font-body` are a plain system-font stack, zero webfont downloads,
  one typeface for display and body alike, exactly as specified.
- **The gradient hero the doc's own correction describes:** already
  gone — the homepage was rebuilt around real event discovery (search/
  filter/grid) with the hero/gradient/marketing section removed
  entirely, predating this doc.
- **Toast rule** ("success-only; errors always inline, never toast"):
  checked all 21 `showToast` call sites in the codebase — every one is
  a success message; no error path routes through toast anywhere.
- **Destructive-action/mandatory-reason rule:** checked every
  `ConfirmDialog` call site — disqualify, ban, round-restart, transfer,
  corrections, comment moderation all set `requireReason`; team kick/
  delete/leave correctly don't, matching this doc's own Part 4.3
  ("none require a reason, per Module 4's correction") — no
  contradiction between this doc and the established exception.
- **Site map (34 pages):** every listed page has a real, working
  implementation. Several sit at different (the site map's own header
  calls them "illustrative") paths than listed — `/teams/:id` is
  folded into the event-scoped team page, `/events` was intentionally
  merged into `/` (D90, predates this doc) — neither is a gap, both
  are prior, deliberate decisions this doc's prose doesn't actually
  contradict.

**One real, concrete gap found and fixed — the Table→Card responsive
contract** ("every data table has a genuine card-based mobile layout
below `md`... never horizontal scroll as the only adaptation"): three
pages violated it outright (`overflow-x-auto` + `<table>` with no card
fallback) — `leaderboard/page.tsx`, the organizer normalization
comparison table, and the organizer verification queue. Fixed all
three: the existing table now renders only at `md`+, a new stacked-card
view (reusing `Card`/`Badge`/`Avatar`, the same list idiom already used
elsewhere in this app) renders below it with identical data and
actions. The verification queue's expanded-row content (approve/
disqualify, with its own `ConfirmDialog`) was extracted into a
wrapper-free `VerificationRowExpandedContent` so the exact same
interactive component works inside both a `<td>` (desktop) and a plain
`<div>` (mobile card) — one implementation, not two that could drift
apart, per this doc's own Part 2 rule.

**Verification:** `apps/web` typechecks clean; all three changed pages
confirmed rendering (HTTP 200, no server-side crash) against a live
dev server. **Honest limitation:** no browser-automation tool is
available in this environment, so the mobile card layout's actual
visual appearance at narrow widths was not confirmed by eye — only
that it renders without error.
