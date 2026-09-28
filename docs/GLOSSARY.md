# GLOSSARY.md

Precise definitions for terms that are easy to use loosely but mean
something exact in this project. If a stage doc or code comment uses one
of these words, it means exactly this — not a close-enough synonym.

---

**Account type** (`User.accountType`)
`PARTICIPANT`, `JUDGE`, or `ORGANIZER`. Set once at account creation,
never edited afterward. Distinct from `EventMembership.role`, which is
per-event — account type is the platform-wide, permanent identity; role
is what that identity is doing on one specific event. A `JUDGE`-type
account can only ever hold `JUDGE` memberships; it can never hold an
`ORGANIZER` or `PARTICIPANT` membership on any event.

**Admin** (team context)
The fixed, non-transferable controller of a `Team`. Not the same concept
as **admin** (platform context, see `siteAdmin` below) — a team admin
has no platform-wide power, only control over their one team.

**siteAdmin**
A boolean flag on `User`, orthogonal to account type. Platform-wide
operator privilege — bypasses per-event authorization checks, with every
bypass audited. Provisioned outside normal app flow (bootstrap/seed
only), never created via an in-app button.

**Status vs. Phase** (Event)
- **Status** — manual, deliberate, actor-set. `DRAFT → PUBLISHED →
  ARCHIVED / DELETED`. Never changes on its own.
- **Phase** — fully computed from `now()` against the event's timeline
  timestamps, recalculated on every read, never stored as a column.
  Only meaningful once `status = PUBLISHED`.
These are independent axes. An event can be `PUBLISHED` and in phase
`JUDGING` simultaneously — status answers "has someone decided this is
public," phase answers "where does the clock currently say we are."

**everSubmitted** (`Submission.everSubmitted`)
A one-way, permanent flag — `false` until the first successful `submit`,
then `true` forever, regardless of any later `unsubmit`. Distinct from
`isDraft`, which toggles freely. Anything that needs to know "has this
submission ever been finalized, even once" (e.g. the team-roster lock)
checks this field, never `isDraft`.

**isDraft** (`Submission.isDraft`)
The *current* state of a submission — freely toggled by `submit`
(`false`) and `unsubmit` (`true`). Says nothing about history; a
submission can be `isDraft: true` right now while `everSubmitted: true`
forever, because it was submitted once and then pulled back for edits.

**Invitation status** (`EventMembership.invitationStatus`)
`PENDING | ACCEPTED | DECLINED | EXPIRED`. Only `ACCEPTED` grants any
access — a `PENDING` row exists in the table but behaves identically to
no row at all for every authorization check. `EXPIRED` and `DECLINED`
are deliberately distinct (never-responded vs. actively-refused), since
an organizer deciding whether to re-invite cares which one it is.

**TEST_MODE**
A single environment flag, off by default, checked at exactly one call
site (verification-email dispatch). When true: the verification token is
logged AND a real, clearly-labeled test email is still sent. Never
enabled in a real deployment. Not a general "dev mode" switch — it does
not affect any other behavior in the system, and if a second call site
ever checks this flag, that's a sign of scope creep to flag and reverse.

**Solo submission vs. team submission**
Two mutually exclusive participation modes for the same event, tracked
by `Submission.submissionType`. A user with a solo submission (draft or
finalized) for an event cannot create or join a team for that same
event, and vice versa — enforced as a hard reject, never a silent
merge/conversion.

**Roster lock** (Team Management)
The point after which a team's membership (join/kick/regenerate
link/delete) can no longer change. Keyed to `Submission.everSubmitted`
being `true` — **permanent** once tripped, not reversible by
`unsubmit`ting back to draft. Not the same as "currently in draft" —a
team can be back in draft state and still be roster-locked if it has
ever submitted before.

**Voting round**
A single, time-boxed instance of public voting for an event. An event
can have more than one over its lifetime if an earlier round is
deactivated and restarted — each round has its own shortlist, its own
votes, and its own one-vote-per-user constraint (scoped to the round, not
the event as a whole).

**Shortlist**
The specific, curated subset of submissions eligible to appear on a
voting round's ballot — not "everyone who submitted." Auto-suggested
(top N by judge rank) but freely organizer-adjustable before it's
published and locked.

**Certificate payload**
The JSON record of facts (`Certificate.payloadJson`) a certificate's
signature is computed over — recipient name, event, role, date, etc.
This, not any rendered image, is the actual stored source of truth; SVG
and PDF renderings are always regenerated from this at request time (or
served from a disposable cache keyed to it).

**Account-age gate**
The voting-eligibility rule that a user's account must have been created
before `event.eventStartsAt` to be allowed to vote. Anchored specifically
to `eventStartsAt`, not `registrationOpensAt` or `votingOpensAt` — a
deliberate choice to block accounts created purely to farm a specific
vote after the event's real timeline is already underway.

**Guard** (technical)
A NestJS authorization check that runs before a route handler executes,
resolving the relevant resource's ID from the request path and checking
the current user's scoped permission for that specific resource — never
a global role check. The only authorization mechanism in the codebase;
there is no parallel frontend-only check anywhere that substitutes for
this.
