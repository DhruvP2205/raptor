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
