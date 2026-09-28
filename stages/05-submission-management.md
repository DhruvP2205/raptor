# Stage Spec: Submission Management

Status: **Design locked, not yet implemented.**
Depends on Module 1 (Auth), Module 2 (Roles & Membership), Module 3
(Event Management), and Module 4 (Team Management) already existing. If
code and this doc disagree, update this doc first.

---

## 1. Scope of this stage

- The current, deliberately minimal submission field set (more fields
  arrive in later modules, additively).
- Solo vs. team submission as mutually exclusive participation modes.
- Event-configurable track attachment (none / single / multiple).
- Draft/submit as a single-table status flag, not two tables.
- Deadline enforcement on every write.
- Visibility rules: organizer vs. admin vs. owner, for draft vs.
  submitted content.

Explicitly **not** in this stage: scoring, custom organizer-defined
questions beyond the fixed field set (deferred to whichever module
introduces them), gallery search/filter presentation (the data supports
it; the module that builds the public gallery view can consume it).

---

## 2. Submission fields — fixed for now, additive later

Current field set, deliberately minimal:

- `title` (project name)
- `description` (markdown source — same sanitized-render pattern as
  event/track descriptions: stored as markdown, rendered through a
  sanitizing renderer at display time, identical code path for any future
  preview feature and the real public page)
- `repoUrl`
- `demoVideoUrl`
- `liveUrl`

**No thumbnail, no image gallery, no tech tags** — deliberately dropped
from the earlier draft of this module. If reintroduced later, they'd
follow Module 3's file-upload security pipeline (magic-byte validation,
re-encode, strip EXIF, UUID filenames) rather than a new one.

**URL fields are validated only for well-formedness** (a syntactically
valid URL), not for reachability or content — no outbound server-side
request to check that a repo/demo/live link actually resolves. That's
fragile, adds a network call to every save, and a judge can simply click
the link themselves.

**This field set will grow in later modules** (e.g. organizer-defined
custom questions, once that module is designed). The schema is built so
new fields are additive to the same `Submission` row — no restructuring
required when they're introduced.

---

## 3. Solo vs. team — mutually exclusive, platform-enforced

- A registered participant can submit **without ever forming or joining
  a team.** A submission attaches either to a `teamId` (team submission)
  or directly to a `userId` (solo submission) — never both.
- **`submissionType: SOLO | TEAM`** field indicates which, set once at
  creation and consistent with which foreign key is populated.
- **No `minTeamSize`.** A team can be just its admin, with no other
  members, all the way up to `event.maxTeamSize`. Solo participation and
  a 1-person team are structurally different (no `Team` row exists at all
  for solo) but functionally similar in practice.
- **A participant with a solo submission (draft or submitted) for an
  event cannot create or join a team for that same event, and vice
  versa** — a participant who is on a team (any role) cannot start a solo
  submission for that event. This mirrors the existing "can't join a
  second team" rule from Module 4, extended to cover solo-vs-team as the
  same underlying conflict: **one participation track per user per
  event, full stop.** Attempting the disallowed transition is a hard
  reject with a clear message (e.g. "you already have a solo submission
  for this event — delete it first if you want to join a team instead"),
  never a silent auto-merge or conversion.

---

## 4. Track attachment — event-configurable

At event setup (Module 3 territory, referenced here since it governs this
module's form): organizer sets `Event.trackAttachmentMode`:

- **`NONE`** — no track field shown on the submission form at all.
- **`SINGLE`** — submission form shows a single-select; a submission
  attaches to exactly one `trackId`.
- **`MULTIPLE`** — submission form shows a multi-select; a submission can
  attach to more than one track simultaneously.

The submission form's presentation is driven directly by this event-level
setting — no separate per-submission choice about whether tracks apply.

---

## 5. Draft vs. submit — one table, one flag

**Single `Submission` table. `isDraft: Boolean` is the only distinction
between an in-progress and a finalized submission.** No separate draft
table.

Rationale for this over a two-table split: un-submitting (going back from
submitted to draft to make further edits, then resubmitting — already an
established capability in this platform's design) is a trivial flag flip
under this model, versus a copy-and-delete operation between two tables
under a split model. Since resubmission before the deadline is explicitly
supported, one table with a flag is the simpler design that produces the
same guarantees.

### 5.1 Draft saves

- `PATCH /submissions/:id` — saves whatever fields are provided, with no
  completeness requirement. A team/solo participant can save an
  effectively empty shell and fill it in incrementally over multiple
  sessions without the system ever complaining at a partial save.
- Permitted for any team member (not just admin) or the solo participant
  themselves, at any point up to `submissionsCloseAt`.

### 5.2 Submitting

- `POST /submissions/:id/submit` — **a distinct action**, not implied by
  any particular `PATCH`. Before flipping `isDraft` to `false` and
  stamping `submittedAt`, the server validates that every fixed required
  field (`title`, `description`, plus `trackId(s)` if
  `trackAttachmentMode != NONE`) is non-empty. A submit attempt with
  missing required fields is rejected with a specific error naming which
  field(s) are missing — never a generic failure.
- **UI requires a confirmation dialog before this action fires** — the
  submit button is never a single, unconfirmed click. This is a
  deliberate friction point specifically to prevent an accidental final
  submission, mirroring the same confirmation-before-irreversible-action
  pattern used elsewhere in this platform (Module 2's staff-account role
  assignment).
- Submitting does not lock the row from further edits — see 5.3.

### 5.3 Un-submitting and resubmitting

- `POST /submissions/:id/unsubmit` — flips `isDraft` back to `true`.
  **`submittedAt` always updates to reflect the most recent submit
  action** — it is overwritten on every `submit`, not preserved from the
  first one. (Resolved: this was previously an open detail; the original
  first-submission timestamp is not separately retained by this field. If
  "when did this team first finish" is ever needed later, that's a
  distinct value — see `everSubmitted`/first-submission tracking below —
  not something `submittedAt` itself carries.)
- **`everSubmitted: Boolean`** — set to `true` the first time
  `POST /submissions/:id/submit` succeeds, and **never reset to `false`
  afterward**, including through any number of subsequent
  unsubmit/resubmit cycles. This is a separate, permanent flag from
  `isDraft` specifically because `isDraft` toggles freely while this must
  not — it's the field Module 4 (Team Management, Section 6) keys the
  permanent team-roster lock off, since "has this team ever finalized a
  submission" needs to survive a later unsubmit even though `isDraft`
  itself does not reflect that history.
- A team/solo participant can cycle draft → submit → unsubmit → edit →
  submit again as many times as they want, with no limit, right up until
  `submissionsCloseAt`. Every cycle after the first leaves `everSubmitted`
  unchanged (already `true`) and `submittedAt` updated to the latest
  submit timestamp.

### 5.4 Deadline enforcement — every write, server time only

Every write to a submission — `PATCH`, `submit`, `unsubmit` — checks
`now() <= event.submissionsCloseAt` at the moment the request is
processed, using server-side time exclusively. A request arriving after
the deadline is rejected regardless of client-side countdown state, a
disabled-but-bypassed button, or client clock drift. This is tested
directly (Section 8), not inferred from UI behavior.

---

## 6. Visibility

| Actor | Draft submissions | Submitted submissions |
|---|---|---|
| Organizer (for their own event) | **No access at all** — not even aware a draft exists | Full detail |
| Admin (`siteAdmin`) | **List only** — can see which teams/individuals currently have a draft in progress, but not its content | Full detail |
| Team member / solo owner | Full access to their own | Full access to their own |
| Public (unauthenticated gallery) | Never | Only once the broader gallery-visibility feature is built (out of scope for this stage's data model, but the `isDraft` flag is exactly what that feature will filter on) |

This is a genuine, deliberate asymmetry between organizer and admin —
**organizers cannot see that a draft exists at all**, while **admin has
visibility into the existence and ownership of drafts (for
platform-level oversight — e.g. detecting stalled participation) without
being able to read their content.** Any endpoint returning draft-adjacent
data must respect this distinction precisely: an admin-facing "drafts in
progress" list returns team/user identifiers and timestamps, never the
`title`/`description`/link fields.

---

## 7. Data model notes

- `Submission.submissionType: SOLO | TEAM`
- `Submission.teamId` (nullable — populated only when `submissionType =
  TEAM`) and `Submission.soloUserId` (nullable — populated only when
  `submissionType = SOLO`) — mutually exclusive, enforced at the
  application layer (exactly one of the two is set, never both, never
  neither).
- `Submission.trackIds` — modeled as an array (works for both `SINGLE`
  and `MULTIPLE` modes with one shape; `SINGLE` mode simply constrains
  the array to length 1 at validation time rather than needing a
  separate single-value column).
- `Submission.isDraft: Boolean`, `submittedAt: DateTime?` (always the
  *most recent* submit action's timestamp — overwritten on every
  resubmit, not preserved from the first), `everSubmitted: Boolean`
  (set `true` on first successful submit, permanent, never reset — this
  is the field Module 4 keys its permanent team-roster lock off, not
  `isDraft`).
- No `SubmissionImage`, no `techTags` array — removed from the earlier
  schema draft for this stage.

---

## 8. What I'm testing for this module

- A solo submission and a team submission cannot both exist for the same
  user on the same event — attempting the second (in either direction)
  is rejected with a clear message, and the first participation record is
  left untouched.
- Draft saves succeed with partially empty fields; `submit` is rejected
  with a specific missing-field error when required fields are empty,
  and succeeds once they're filled.
- `submit` requires the confirmation step at the API/flow level (or at
  minimum, the endpoint design assumes a confirmed client action — this
  is primarily a frontend UX requirement, but the backend still performs
  its own required-field validation regardless of what the frontend
  confirmed, since the server never trusts client-side confirmation as a
  substitute for its own checks).
- `unsubmit` correctly flips the flag and the submission becomes editable
  again; a subsequent `submit` re-validates required fields from
  scratch. `everSubmitted` remains `true` across this cycle (never resets
  to `false`), and `submittedAt` reflects the timestamp of the latest
  `submit`, not the original one.
- Any write (`PATCH`, `submit`, `unsubmit`) attempted after
  `submissionsCloseAt` is rejected using server time, tested with a
  request landing exactly at/after the boundary.
- An organizer's API access to a draft submission (detail or existence)
  returns nothing — not a 403 that reveals existence, but genuinely no
  signal that a draft exists at all, consistent with "no access at all."
- An admin's "drafts in progress" list returns ownership/timestamp data
  only — a direct attempt to fetch a draft's content via any admin-facing
  route is rejected.
- `trackAttachmentMode: SINGLE` rejects a submit attempt with more than
  one track selected; `MULTIPLE` allows more than one; `NONE` ignores/
  rejects any track data submitted at all.

---

## 9. Open questions

None outstanding for this stage. `submittedAt`'s most-recent-vs-original
question is resolved above (always most recent); the team-roster-lock
interaction with unsubmit, previously flagged as a cross-module gap, is
resolved via the new `everSubmitted` permanent flag — see Module 4's doc,
Section 6.
