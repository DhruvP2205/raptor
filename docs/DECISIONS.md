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
