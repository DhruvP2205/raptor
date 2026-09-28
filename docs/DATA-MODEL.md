# DATA-MODEL.md

The schema, table by table, and why each field exists. This is the
human-readable narrative version of `apps/api/prisma/schema.prisma`.

**Status note:** the schema described below is the cumulative target.
`apps/api/prisma/schema.prisma` is built up **incrementally, stage by
stage**, matching each stage doc's own declared scope. **All ten
currently-locked modules (1 through 10) are implemented** (`User`
including `judgeCalibrationMean/StdDev/SampleCount`, `Session`,
`EventMembership`, `AuditLog`, the full `Event` table including
`maxTeamSize`, `trackAttachmentMode`, `maxProjectsPerJudge`,
`judgingClosesAt`, and `finalScoreDisplayScale`, `Track`, `Prize`,
`Team`, `TeamMembership`, the full `Submission` table,
`SubmissionVerification`, `GithubToken`, `JudgeAssignment`,
`JudgeReliabilityNote`, `RubricCriterion`, `Score`, `JudgeReview`,
`ScoreRevision`, `NormalizationRun`, `NormalizedJudgeScore`,
`NormalizedScore`, `ResultsDraft`, `PublishedResultVersion`,
`RankResultEntry`, `SpecialAwardResultEntry`). `Event` started as a
deliberately minimal anchor in Module 2 (D59) and Module 3 grew it
additively to the full shape below; Module 4 added `maxTeamSize` the
same way (D75), Module 5 added `trackAttachmentMode` (D75-equivalent
pattern, same commit), Module 7 added `maxProjectsPerJudge` the same
way again, Module 8 added `judgingClosesAt` (D108) and
`finalScoreDisplayScale`. `Submission` started as a minimal anchor in
Module 4 — `id`, `teamId`, `everSubmitted`, `createdAt` (D75) — and
Module 5 extended it additively to the full shape below, per its own
scope. **Modules 11-12 (Voting, Certificates) are now implemented** —
`Event.eventClosedAt`/`votingEligibilityMode`/`certificatesEnabled*`,
`VotingRound`, `ShortlistEntry`, `Vote`, `VoteAbuseFlag`,
`VotingResultVersion`, `VotingResultEntry`, `Certificate`,
`CertificateTemplate` all exist in the live schema (§11-12 below).
**Module 13 (Comments) has a locked stage doc as of this update but is
not yet implemented** — §13 below describes its target schema only. If
the live schema and a field documented here disagree **and the owning
module has already been implemented**, that's a bug.

---

## 1. Identity

### `User`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `email` | string, unique | |
| `passwordHash` | string | argon2 |
| `displayName` | string | |
| `accountType` | enum: `PARTICIPANT \| JUDGE \| ORGANIZER` | Set once at creation, **never edited afterward** (Decision D9, D10) |
| `siteAdmin` | boolean | Orthogonal flag, separate from `accountType` |
| `mustResetPassword` | boolean | True for admin-created staff accounts until first password change |
| `emailVerifiedAt` | datetime, nullable | Only meaningful/required for `PARTICIPANT` accounts; drives voting eligibility later |
| `verificationTokenHash` / `verificationTokenExpiresAt` | string unique, nullable / datetime, nullable | Module 1. Hashed, never raw (D54). **Not cleared on successful verification** — `emailVerifiedAt` alone gates single-use/idempotent-replay behavior; overwritten (invalidating the previous token) on signup and on every resend. |
| `bannedAt` / `bannedReason` | nullable | Module 1. Checked at signup to reject a banned email outright. |
| `bannedByUserId` | nullable | **Deferred (D55)** — not yet in the Prisma schema; no ban-issuing endpoint exists in any locked stage doc yet, only the signup-time check above, which doesn't need it. Arrives with whichever module designs the actual ban action. |
| `createdAt`, `updatedAt` | datetime | `createdAt` is the account-age gate input for voting eligibility (D44) |
| `judgeCalibrationMean`, `judgeCalibrationStdDev`, `judgeCalibrationSampleCount` | float, float, int | **Implemented (Module 9, D122).** Platform-wide, live-updating personal scoring-tendency profile — recomputed after *every* `submit-review` this user makes as a judge, across all events ever, never scoped to one. `sampleCount` is what's checked against the minimum-N=3 threshold (D123). Meaningless/unused for non-judge accounts, left at the 0/0/0 default. |

**Why `accountType` lives directly on `User` rather than being inferred
from membership history:** it must be knowable even before any
`EventMembership` exists (e.g. immediately after an admin creates a
judge account, before any invitation has happened).

### `Session`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | fk → User | |
| `tokenHash` | string, unique | Raw token is **never** stored — only its hash (D3) |
| `userAgent`, `ipHash` | nullable | For a future "your active sessions" view. `ipHash` is HMAC-keyed with `APP_SECRET` (D58), not a plain hash — an IP address is too low-entropy for an unkeyed hash to actually be one-way. `null` if `APP_SECRET` isn't configured, rather than a hash with no key. |
| `expiresAt`, `revokedAt` | datetime | Revocation is instant — deleting/marking a row invalidates it immediately |

---

## 2. Roles & Event Membership

### `EventMembership`

The single table every authorization guard checks. No global role field
is ever consulted for event-scoped actions.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | fk → User | |
| `eventId` | fk → Event | |
| `role` | enum: `PARTICIPANT \| JUDGE \| ORGANIZER` | Must match the user's `accountType` — a `PARTICIPANT`-track account can never hold a `JUDGE`/`ORGANIZER` membership row, enforced at the application layer |
| `trackIds` | string[] | Empty = all tracks. The field existed from Module 2; the mechanics of actually scoping assignment by it **arrived with Module 7** (`PATCH /events/:id/judges/:membershipId`) |
| `projectLimitOverride` | int, nullable | **Implemented (Module 7).** Per-judge override of `Event.maxProjectsPerJudge`; `null` = use the event default |
| `invitationStatus` | enum: `ACCEPTED \| PENDING \| DECLINED \| EXPIRED` | `ACCEPTED` immediately for organizer rows (D12); starts `PENDING` for judge rows |
| `invitedByUserId` | fk → User, nullable | |
| `invitedAt`, `respondedAt` | datetime, nullable | |
| **No `respondByAt` field** | — | Deadline is always computed live as `event.eventStartsAt` (D13) — never a stored snapshot |
| Invitation token fields | hashed, single-use | Same pattern as `Session`/email-verification tokens |

---

## 3. Events

### `Event`

**Implemented (Module 3), grown additively by later modules** — same
principle as `Event` itself starting as a minimal anchor (D59):
`maxTeamSize` arrived with Module 4 (D75), `trackAttachmentMode` with
Module 5, `maxProjectsPerJudge` with Module 7, `judgingClosesAt` and
`finalScoreDisplayScale` with Module 8 (D108), `eventClosedAt` and
`votingEligibilityMode` with Module 11 (voting-round-restart window and
eligibility policy, D43/D49/D142 — see §11 below). `phase` adds a
synthetic `NOT_STARTED` value
(D69) for a PUBLISHED event sitting before `registrationOpensAt`, not
named in the stage doc's own phase list but required by its explicit
"early hype, before registration opens" supported use case (Section 8).

| Field | Type | Notes |
|---|---|---|
| `id`, `slug` (unique) | | Slug editable only while `status = DRAFT` (D17). Auto-generated from `name` if not given (D68). |
| `name`, `description` | markdown string, nullable | Sanitized on every render (D18), through `MarkdownService` — the same function for preview and production |
| `posterUrl`, `thumbnailUrl` | nullable | Local-disk-served, re-encoded on upload (D19, D71 — always re-encoded to JPEG regardless of input format) |
| `status` | enum: `DRAFT \| PUBLISHED \| ARCHIVED \| DELETED` | Manual, actor-controlled (D15). `DELETED` reachable from DRAFT or PUBLISHED, not ARCHIVED (D70). |
| `trackAttachmentMode` | enum: `NONE \| SINGLE \| MULTIPLE`, default `NONE` | **Implemented (Module 5).** Drives the submission form's track UI (Section 4, docs/stages/05-submission-management.md) |
| ~~`minTeamSize`~~ | — | No such field; a team can be admin-only (D25) |
| `maxTeamSize` | int, default 4 | **Implemented (Module 4, D75).** Admin counts toward the total (D25) |
| `maxProjectsPerJudge` | int, default 20 | **Implemented (Module 7).** Event-wide cap referenced by both manual and algorithmic assignment; a per-judge `EventMembership.projectLimitOverride` can override it. Default is an inferred value, not stated by the stage doc — see the schema's own comment |
| `finalScoreDisplayScale` | int, default 5 | **Implemented (Module 8).** Organizer-facing display scale — entirely separate from the 0-100 judge input scale (§8 below); never the same number, never conflated |
| `votingEligibilityMode` | enum: `PARTICIPANTS_ONLY \| VERIFIED_PLATFORM_USERS`, nullable | **Implemented (Module 11, D43).** Organizer-chosen once; nullable until then (round 1 cannot be created without it), immutable once round 1 exists — see §11 |
| Timeline fields (all `timestamptz`, UTC) | required at creation | `registrationOpensAt`, `registrationClosesAt`, `eventStartsAt`, `submissionsOpenAt`, `submissionsCloseAt`, `eventEndsAt`, `judgingClosesAt`, `resultsAnnounceAt`, `votingOpensAt`, `votingClosesAt`, `votingWinnerAnnounceAt`, `eventClosedAt` |
| `eventClosedAt` | timestamptz, UTC | **Implemented (Module 11, D49/D142).** Upper bound of the voting-round-restart window (`[resultsAnnounceAt, eventClosedAt]`); added to the ordering chain strictly after `votingWinnerAnnounceAt`, same additive precedent as `judgingClosesAt`. Introduces no new `EventPhase` value — see §11 |
| `judgingClosesAt` | timestamptz, UTC | **Implemented (Module 8, D108).** Sits between `eventEndsAt` and `resultsAnnounceAt` in the ordering chain; Module 3's own code (`event-timeline.ts`, `event-phase.ts`) was amended to add it and the new `JUDGING_CLOSED` phase — the one place a later module amends an earlier, already-shipped one, per Module 8 Section 10 (and Module 3's own doc, Sections 2.2/3.3). |
| *(computed, not stored)* `phase` | `EventPhase \| null` | Derived from `now()` vs. the timeline fields on every read (D15); `null` for non-PUBLISHED, `NOT_STARTED` for PUBLISHED-but-pre-registration (D69). Now includes `JUDGING_CLOSED`, between `JUDGING` and `RESULTS_ANNOUNCED` (Module 8). |

**Validation, enforced on every create and every edit** — see
`apps/api/src/events/utils/event-timeline.ts`:
```
registrationOpensAt < registrationClosesAt <= eventStartsAt
  < submissionsOpenAt < submissionsCloseAt <= eventEndsAt
  < judgingClosesAt <= resultsAnnounceAt < votingOpensAt
  < votingClosesAt < votingWinnerAnnounceAt
```
PUBLISHED adds two more rules per field: immutable once its own
boundary has passed, and never movable earlier than its current value
while still pending.

### `Track`

Implemented (Module 3). No delete — removal semantics are explicitly
unresolved in the stage doc (D74).

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `name` | string | Unique per event, not globally (`@@unique([eventId, name])`) |
| `description` | markdown, nullable | Same sanitized-render pattern as `Event.description` |

### `Prize`

Implemented (Module 3). No delete, same reasoning as `Track` (D74).

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `trackId` | nullable | Must belong to the same event — cross-event references rejected at the application layer |
| `name`, `rank` | | |
| `decidedBy` | enum: `JUDGES \| PUBLIC_VOTE` | The two prize tracks are computed by entirely different queries and revealed at different times (`resultsAnnounceAt` vs. `votingWinnerAnnounceAt`) |

---

## 4. Teams

**Implemented (Module 4).**

### `Team`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | A team belongs to exactly one event |
| `name` | string, **immutable after creation** | Unique per event (D21) |
| `adminUserId` | fk → User | Fixed, non-transferable (D22) — no `ownerId`-style field that implies transferability |
| `joinLinkPrefix` | string | `slugify(name)` alone, no added literal constant (D76) — derived once at creation, never regenerated since the name never changes |
| `joinLinkSuffix` | string, 6-digit | The actual rotating credential — changed on regenerate (D23), old value invalidated immediately |
| `createdAt` | | |

### `TeamMembership`

| Field | Type | Notes |
|---|---|---|
| `id`, `teamId`, `userId` | | |
| `joinedAt` | | |

No `isOwner` flag — admin status lives on `Team.adminUserId`, not as a
per-membership boolean, since it's a property of the team, not something
multiple members could hold simultaneously.

---

## 5. Submissions

**Implemented (Module 5).** `teamId`/`everSubmitted`/`createdAt` started
as a minimal anchor in Module 4, since the team roster lock (D26) needed
`everSubmitted` to read before this module existed (D75); everything
else below is this module's own addition.

### `Submission`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `submissionType` | enum: `SOLO \| TEAM` | |
| `teamId` | fk → Team, nullable, unique | Populated only when `submissionType = TEAM`. Unique — one submission per team, enforced at the DB level; a second creation attempt maps a unique-constraint collision to a 409 (D80) |
| `soloUserId` | fk → User, nullable | Populated only when `submissionType = SOLO` — exactly one of `teamId`/`soloUserId` is set, enforced at the application layer, never both, never neither (D28). `@@unique([eventId, soloUserId])` — nulls are distinct under Postgres's default semantics, so this only constrains actual solo rows |
| `title` | string, nullable | Required to `submit` (not at the schema level — a draft can be an empty shell, Section 5.1) |
| `description` | markdown, nullable | Required to `submit`; sanitized identically to Event/Track descriptions, rendered fresh into `descriptionHtml` at response time, never stored as HTML |
| `repoUrl`, `demoVideoUrl`, `liveUrl` | string, nullable | Validated for well-formedness only, not reachability |
| `trackIds` | string[], default `[]` | Shape works for both `SINGLE` (constrained to length 1 at validation) and `MULTIPLE` modes. `NONE` rejects any non-empty value outright rather than silently dropping it (D82) |
| `isDraft` | boolean, default `true` | The only flag distinguishing in-progress from finalized (D30) — toggled freely by `submit`/`unsubmit` |
| `everSubmitted` | boolean, default `false` | **Permanent once true.** Set on first successful `submit`, never reset by `unsubmit` (D32). This, not `isDraft`, is what Module 4's team-roster lock (D26) checks. |
| `submittedAt` | datetime, nullable | Always the **most recent** submit timestamp — overwritten on every resubmit (D31); untouched by `unsubmit` |

**Visibility (Section 6), enforced in `SubmissionsService`, not the
schema:** owner (any team member, or the solo participant) always sees
their own row, any state. Organizer and siteAdmin see a *submitted* row
in full, but get the same 404 as "doesn't exist" for a *draft* — no 403
that would at least confirm one exists (D81). siteAdmin additionally has
a list-only view of drafts in progress per event (ownership + timestamps
via an explicit Prisma `select`, never title/description/links).

**Removed from an earlier draft:** `thumbnailUrl`, `SubmissionImage`
(gallery images), `techTags` (D27) — deliberately descoped for the
current stage; may be reintroduced additively in a later module.

### `RubricCriterion` — placeholder, not yet designed

Referenced in earlier drafts for organizer-defined custom questions and
weighted scoring criteria. Not part of the confirmed Module 5 field set
(no custom questions were included in this stage's fixed field list) —
will be properly specified once judging (Module 7+) or a
custom-questions module is designed.

---

## 6. Submission Verification (Module 6)

**Implemented.**

### `SubmissionVerification`

| Field | Type | Notes |
|---|---|---|
| `id`, `submissionId` (unique) | | |
| `checkStatus` | enum: `NOT_RUN \| VERIFIED \| SUSPICIOUS \| REJECTED \| PRIVATE \| NON_GITHUB \| ERROR` | Machine-generated observation |
| `finalDecision` | enum: `PENDING_REVIEW \| APPROVED \| DISQUALIFIED` | What actually gates judge assignment — only `APPROVED` proceeds |
| `firstCommitAt`, `lastCommitAt` | datetime, nullable | UTC, normalized from GitHub's response regardless of the offset GitHub returns |
| `totalCommits`, `commitsInWindow` | int | Window is `eventStartsAt` → `submissionsCloseAt` |
| `outsideWindowCommits` | json | Full sha/timestamp/message/author detail for organizer review |
| `finalDecisionRemarks` | text, nullable | Mandatory when `finalDecision = DISQUALIFIED` |
| `reviewedByUserId` | fk, nullable | |
| `checkedAt`, `reviewedAt` | datetime, nullable | |

### `GithubToken`

| Field | Type | Notes |
|---|---|---|
| `id`, `label` | | |
| `tokenEncrypted` | string | **AES-256-GCM — the one deliberate exception to this schema's hash-everything-sensitive default**, since the plaintext must be recoverable to call the GitHub API |
| `isValid`, `rateLimitRemaining`, `rateLimitResetAt`, `lastUsedAt`, `revokedAt` | | Drives rotation logic — a valid token with the most remaining headroom is selected per call |

---

## 7. Judge Assignment (Module 7)

**Implemented.**

### `JudgeAssignment`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `judgeId` | fk → User | |
| `submissionId` | fk → Submission | Must have `finalDecision: APPROVED` — enforced at assignment time, not merely assumed |
| `status` | enum: `PENDING \| IN_PROGRESS \| COMPLETED \| TRANSFERRED` | **`COMPLETED` is permanent** — no transfer possible after a score is actually submitted, by anyone |
| `assignmentMethod` | enum: `MANUAL \| ALGORITHMIC` | Audit/provenance only — no behavioral difference downstream |
| `transferredFromAssignmentId` | fk, nullable | Links a replacement assignment back to the `TRANSFERRED` row it replaced |
| `assignedAt`, `completedAt` | datetime | |

### `JudgeReliabilityNote`

| Field | Type | Notes |
|---|---|---|
| `id`, `judgeUserId` | fk → **User**, not `EventMembership` | Deliberately platform-wide, not event-scoped — the point is to inform *future* invite decisions on other events |
| `eventId` | fk → Event | Context only (which event the incident happened during) |
| `authorUserId` | fk → User | |
| `remark` | text | |

**Never visible to the judge it's about, and never visible to any
participant** — organizer/admin-only, everywhere it's surfaced.

### `Event` / `EventMembership` extensions

- `Event.maxProjectsPerJudge: Int` — event-wide default cap.
- `EventMembership.projectLimitOverride: Int?` — per-judge override,
  set explicitly when a manual assignment would otherwise exceed the
  default.

**Participant-facing anonymity:** no participant-facing endpoint,
export, or certificate at any pipeline stage includes judge identity, at
any point in this schema — this is enforced by simply never including a
judge-identifying field in any participant-scoped query or DTO, rather
than by a field-level access-control check that could be gotten wrong.

---

## 8. Rubric & Scoring (Module 8)

**Implemented.**

### `RubricCriterion` (now fully specified)

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `kind` | enum: `SCORING \| BONUS \| SPECIAL_AWARD` | Three independent kinds — `SPECIAL_AWARD` added retroactively (D129), see Module 8 doc Section 2.3 |
| `label`, `description` | string, text | `description` is judge-facing guidance |
| `weightPercent` | int, nullable | **`SCORING` only** — must sum to exactly 100 across an event's `SCORING` criteria |
| `maxPoints` | int, nullable | **`BONUS` only** — flat point value, no sum requirement |

**Judge input scale: `SCORING` criteria take a raw 0–100 value
(D118 — supersedes the earlier fixed 1–5 design). `BONUS` criteria take
0 to their own `maxPoints`. `SPECIAL_AWARD` criteria take 0 or 1** — a
nomination flag, never part of the `generalRaw`/`bonusRaw`/`rawTotal`
formula, tallied entirely separately at results-computation time
(Module 10). The organizer-configured winning/display scale
(`Event.finalScoreDisplayScale`) is a completely separate number —
never conflate a judge's raw input scale with the scale a result is
ultimately displayed on.

### `Score`

| Field | Type | Notes |
|---|---|---|
| `id`, `judgeAssignmentId`, `criterionId` | | |
| `value` | int | 0–100 for `SCORING`; 0 to `maxPoints` for `BONUS`; 0 or 1 for `SPECIAL_AWARD`. Live, mutable by the assigning judge until `event.judgingClosesAt` |
| `note` | text, nullable | Optional per-criterion note |

### `JudgeReview`

| Field | Type | Notes |
|---|---|---|
| `id`, `judgeAssignmentId` (unique) | | |
| `overallFeedback` | text | Required to complete a review — justification in the judge's own words |
| `submittedAt` | datetime | Most recent submit/resubmit — same "most recent, not original" pattern as `Submission.submittedAt` (D31) |
| `revisionCount` | int | |

### `ScoreRevision` — append-only, never edited or deleted

| Field | Type | Notes |
|---|---|---|
| `id`, `judgeAssignmentId`, `revisionNumber` | | |
| `scoresSnapshotJson` | json | Full snapshot of every criterion's value+note (both kinds) at this submission |
| `overallFeedbackSnapshot` | text | |
| `submittedAt` | datetime | |

Written on every successful `submit-review` call (first submit and every
resubmit) — never on a draft save. This is the permanent record of how a
judge's scoring evolved, independent of the live, mutable `Score` rows.

### `Event` extension

- `judgingClosesAt: DateTime` — explicit judging deadline.
- `finalScoreDisplayScale: Int` — organizer-configured, default `5`.
- No stored field for the bonus guardrail below — it's a validation-time
  check plus an `AuditLog` entry on override, not a persisted setting.

### Final score computation — finalized formula (D118, D119)

**Per judge — combine while still in raw, undivided units:**
```
generalRaw (per judge) = Σ(criterionValue × weightPercent) / 100   → [0, 100]
bonusRaw (per judge)    = Σ(awarded points across enabled bonus tracks)
rawTotal (per judge)    = generalRaw + bonusRaw
```

**Across judges — average the raw totals first, excluding
non-responders (D116), then scale exactly once:**
```
averageRawTotal = average of rawTotal across judges with
                   JudgeAssignment.status = COMPLETED only
finalScore = (averageRawTotal / 100) × Event.finalScoreDisplayScale
```

**Overflow** (`averageRawTotal > 100`, i.e. `finalScore >
finalScoreDisplayScale`) is expected and honest, not an error — shown
as the raw number plus a fixed "Overachiever" label in the public
gallery, never on certificates. The overflow check applies to the
*averaged* submission-level score, not any individual judge's score —
one generous judge alone doesn't trigger it if the cross-judge average
stays at or under 100.

**Rejected variant, recorded for posterity:** dividing `generalRaw` down
to a small scale *before* adding bonus (rather than after) was tried and
proven broken during design — it lets a low-quality project with full
bonus outscore a high-quality project with none, since bonus then
becomes disproportionately large next to an already-shrunk general
score. The fix is strict: combine general and bonus while both remain in
the same full-size raw units; divide only once, at the very end.

**Bonus guardrail:** if the sum of an event's `BONUS.maxPoints` exceeds
a threshold (default 20, i.e. 20% of the 100-point general base), the
organizer sees a warning before publishing and can proceed only with an
explicit acknowledgment, written to `AuditLog`. Soft warning, not a hard
block, by deliberate design choice.

**Two independent forms of immutability, not to be confused:** the
*assignment* is permanently locked to its judge once any score is
submitted (Module 7, D106 — no transfer, ever, after that point), while
the *content* of that same judge's scores remains editable by them until
`judgingClosesAt`. Both are true of the same row simultaneously.

---

## 9. Normalization (Module 9)

**Implemented.**

### `User` extension

| Field | Type | Notes |
|---|---|---|
| `judgeCalibrationMean`, `judgeCalibrationStdDev` | float | Live, recomputed after every `submit-review`, across **every event** that judge has ever reviewed — not scoped to one event |
| `judgeCalibrationSampleCount` | int | Checked against the minimum-N threshold (3, platform-wide) |

### `NormalizationRun`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId`, `runByUserId`, `runAt` | | |
| `method` | enum | `Z_SCORE` |
| `minimumN` | int | Stored per-run (default 3) |
| `eventMean`, `eventStdDev` | float | This event's own aggregate baseline at run time — used as the fallback for judges below minimum-N (D124) |

### `NormalizedJudgeScore` — permanent snapshot, one per judge per run

| Field | Type | Notes |
|---|---|---|
| `id`, `normalizationRunId`, `judgeAssignmentId` | | |
| `rawTotal` | float | Input value at run time |
| `judgeMeanAtRun`, `judgeStdDevAtRun`, `sampleCountAtRun` | | **Frozen copies — never a live reference to `User.judgeCalibration*`** (D127) |
| `usedFallback` | boolean | True if this judge was below minimum-N (D124) |
| `uniformScoringFlagged` | boolean | True if `judgeStdDevAtRun = 0` (D125) |
| `zScore` | float | |

### `NormalizedScore` — one per submission per run

| Field | Type | Notes |
|---|---|---|
| `id`, `normalizationRunId`, `submissionId` | | |
| `averagedZScore` | float | Averaged across `COMPLETED` judges only (same D116 exclusion) |
| `rescaledValue` | float | Linear rescale of the run's full set of averaged z-scores onto 0–100 |
| `finalScore` | float | `(rescaledValue / 100) × Event.finalScoreDisplayScale` — reuses Module 8's exact final step |
| `rank` | int | |

**Trigger and lock:** manual only, re-runnable any number of times
while `judgingClosesAt <= now() < resultsAnnounceAt`. **Permanently
locked once `resultsAnnounceAt` passes — no exceptions, no admin
override** (D126), consistent with how cast votes, issued certificates,
and finalized team rosters are protected elsewhere in this schema.

**Blending fix (D124):** a judge below minimum-N is normalized against
this run's `eventMean`/`eventStdDev` rather than their own unreliable
personal figures — keeps every judge's contribution in the same
z-score space so cross-judge averaging on a submission stays valid.

**Visibility (D128):** both live `User.judgeCalibration*` and any run's
frozen `NormalizedJudgeScore` snapshot are visible to admin/organizer,
platform-wide — never to the judge themselves or to any participant.

## 10. Results & Rankings (Module 10)

**Implemented.**

### `ResultsDraft`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId`, `normalizationRunId` | | Which run this draft is based on — organizer-selectable, defaults to most recent |
| `draftStatus` | enum: `IN_PROGRESS \| READY` | Gates auto-publish |
| `publishMode` | enum: `AUTO \| MANUAL` | |

### `PublishedResultVersion` — never edited in place, only superseded

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId`, `versionNumber` | | |
| `status` | enum: `LIVE \| SUPERSEDED \| UNPUBLISHED` | Status transitions only — never deleted |
| `correctionReason` | text, nullable | Required whenever this version came from a post-publish correction |
| `unpublishReason` | text, nullable | Required if unpublished |

### `RankResultEntry`

| Field | Type | Notes |
|---|---|---|
| `id`, `publishedResultVersionId`, `submissionId` | | |
| `rank` | int | **Dense ranking** — multiple entries can share the same `rank` when tied all the way through the cascade |
| `displayScore`, `isScoreOverridden` | float, boolean | Override flag for post-publish score corrections |
| `isDisqualified` | boolean | |

### `SpecialAwardResultEntry`

| Field | Type | Notes |
|---|---|---|
| `id`, `publishedResultVersionId`, `criterionId`, `submissionId` | | |
| `nominationCount` | int | Tally of `Score.value = 1` across `COMPLETED` assignments for that `SPECIAL_AWARD` criterion |
| `isShared` | boolean | True if resolved via tie-share |

**Rank tie-break cascade (ends in sharing, never manual escalation):**
`NormalizedScore.finalScore` → pre-normalization `averageRawTotal` →
`bonusRaw` → **share the position and prize.** Dense ranking, not
skip-ranking — a tie at rank 2 means the next distinct score takes rank
3, not 4.

**Special-award tie-break cascade — bonus checked before final score,
the reverse order from the rank cascade above:** nomination count →
`bonusRaw` → `NormalizedScore.finalScore` → share the award.

**Visibility gate:** independent of `EventPhase` — governed entirely by
whether a `PublishedResultVersion` with `status: LIVE` exists.

**Post-publish correction is a new, versioned layer, not a reopening
of Module 9's permanently-locked normalization** — `NormalizationRun`
itself remains untouchable after `resultsAnnounceAt` (D126); corrections
only ever produce a new `PublishedResultVersion` on top of an existing,
frozen computation.

---

## 11. Voting (Module 11)

**Implemented.** See `stages/11-voting.md`. Depends on Module 10's
publish mechanism for shortlist reveal timing, and reuses its
draft/publish/correction pattern rather than inventing a new one
(`VotingResultsService`, mirroring `ResultsService`).

### `VotingRound`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId`, `roundNumber` | | Unique on `(eventId, roundNumber)` |
| `status` | enum: `ACTIVE \| SUPERSEDED \| DEACTIVATED` | `SUPERSEDED` is declared (the stage doc's own table lists it) but never produced by current application code — only `ACTIVE -> DEACTIVATED` (Section 7's restart flow) is ever exercised; implemented literally per CLAUDE.md rather than silently dropped, flagged in the schema's own comment |
| `votingOpensAt`, `votingClosesAt`, `votingWinnerAnnounceAt` | datetime | Round 1 initializes from the event's original timeline fields; a restart round gets fresh organizer-set values |
| `deactivatedAt`, `deactivatedByUserId`, `deactivationReason` | | `deactivationReason` is **mandatory text**, not optional, on every restart (D49) |

### `ShortlistEntry`

| Field | Type | Notes |
|---|---|---|
| `id`, `votingRoundId`, `submissionId` | | Unique on `(votingRoundId, submissionId)` |
| `addedByUserId`, `isAutoSuggested` | | Provenance only |

Becomes publicly visible the moment judge-decided results are published
(`PublishedResultVersion.status: LIVE`, Module 10) — not at
`votingOpensAt`. Voting itself remains gated separately by
`votingOpensAt`/`votingClosesAt` (D141).

### `Vote`

| Field | Type | Notes |
|---|---|---|
| `id`, `votingRoundId` | fk | Unique on `(votingRoundId, userId)` — one-vote constraint is scoped per round, not per event — a restart gives everyone a fresh vote (D49) |
| `submissionId`, `userId` | | Single-choice: exactly one submission per user per round (D42) — no `weight` field, since quadratic voting was dropped for public voting |
| `ipHash` | string, nullable | HMAC-keyed on `APP_SECRET`, same construction as `Session.ipHash` (D58) — shared via `common/ip-hash.util.ts` rather than re-derived; null only if `APP_SECRET` isn't configured |

No public-facing field ever exposes who voted for what — only aggregate
percentage/count are surfaced post-publication (D46).

### `VoteAbuseFlag`

| Field | Type | Notes |
|---|---|---|
| `id`, `votingRoundId`, `ipHash`, `implicatedUserIds` | | Unique on `(votingRoundId, ipHash)` |
| `status` | enum: `PENDING \| REVIEWED_CLEARED \| REVIEWED_BANNED` | Flags never auto-block a vote — admin-reviewed only (D47). Review can ban a chosen subset of `implicatedUserIds`, not forced all-or-nothing — a flagged IP can implicate an innocent account alongside a genuinely abusive one (not stated explicitly by the stage doc; a reasonable narrowing of "admin can ban an account by email") |

### `VotingResultVersion` / `VotingResultEntry`

Reuses Module 10's draft/publish/correction pattern (never edited in
place, only superseded) — see `stages/11-voting.md` Section 9.
`VotingResultEntry.isSharedWin` handles tied vote counts via sharing,
never an arbitrary tiebreaker (D142). Post-publish corrections are
`DISQUALIFY` and `REASSIGN_CREDIT` (the latter is this implementation's
reading of the stage doc's "adjust which submission is credited" —
rejects if the target submission already has its own entry in that
version, rather than silently merging two entries).

CAPTCHA/proof-of-work challenge state is Redis-only (ephemeral,
short-TTL, `vote-pow:*`/`vote-captcha:*` keys) — not part of the
Postgres schema. Both fail OPEN on a genuine Redis connection error and
fail CLOSED on a missing/expired/wrong answer — same fail-open-for-
anti-abuse-not-authorization distinction `RateLimitService` already
draws for itself (`ARCHITECTURE.md` §2/§6).

### `Event` extension

- `eventClosedAt: DateTime`, required — bounds the voting-restart
  window (`[resultsAnnounceAt, eventClosedAt]`, D49) — see §3 above.
- `votingEligibilityMode: enum`, nullable — `PARTICIPANTS_ONLY \|
  VERIFIED_PLATFORM_USERS` (D43). **Cross-doc gap now resolved**:
  `stages/11-voting.md`'s own Section 10 never formally declared this
  field even though Section 2 discusses it and `stages/13-comments.md`
  refers to it by name — implemented as nullable (organizer hasn't
  chosen yet), settable exactly once, and locked immutable the moment
  `VotingRound` round 1 exists for the event (mirrors the shortlist's
  own "locked once finalized for round 1" rule, Section 4).

---

## 12. Certificates (Module 12)

**Implemented.** See `stages/12-certificates.md`. Depends on Module 10
(publish gate), and on Module 6/8 for disqualification/special-award
exclusion. Certificate rendering runs synchronously in the API's
request thread (`svg-to-pdfkit`, pure-JS) — not the `worker` container;
an earlier assumption in `ARCHITECTURE.md` that it would reuse that
container was corrected once this module was actually implemented.

### `Event` extension

| Field | Type | Notes |
|---|---|---|
| `certificatesEnabled` | boolean | Default `false` |
| `certificatesEnabledAt`, `certificatesEnabledByUserId` | | Can only be set once a `PublishedResultVersion` exists at `status: LIVE` (Module 10, D144); rejects re-enabling once already true |

### `Certificate`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Unguessable, non-sequential by construction (D38) |
| `eventId`, `userId` | | **Recipient is always resolved from the authenticated caller's own participation record — never a free-text or searched-for input.** A direct, structural fix for a real vulnerability found in a competing platform (D143) |
| `role` | enum: `PARTICIPANT \| JUDGE \| WINNER \| SPECIAL_AWARD_WINNER` | A person can hold multiple certificate rows for one event — a `WINNER` certificate is additional to, not a replacement for, their `PARTICIPANT` one (D146). `@@unique([eventId, userId, role])` — the DB itself, not just application logic, prevents duplicate issuance |
| `teamId`, `submissionId` | fk, nullable | `teamId` null for solo participants and for `JUDGE`; `submissionId` null for `JUDGE` only |
| `payloadJson` | json | The facts a signature is computed over — **never a rendered image** (D34). Canonicalized (recursively key-sorted) before signing/verifying, since Postgres `jsonb` doesn't preserve key order on a round trip |
| `signature` | string | Ed25519 over `payloadJson`, base64 |
| `publicKeyId` | string | Fingerprint of the currently-configured signing key — no rotation registry yet; verification simply fails if the certificate's `publicKeyId` doesn't match the currently-configured key |
| `templateId`, `templateVersion` | fk, int | Points at one specific, immutable `CertificateTemplate` row — never retroactively changed by a later template edit (see below) |
| `issuedAt` | datetime | |

**Issuance trigger:** a single, unified event-wide switch
(`certificatesEnabled`), flipped by organizer/admin, gated on judge
results already being published live (D144). Covers participants and
judges under the same trigger. Disqualified submissions' participants
are excluded from automatic issuance by default; organizer can
manually override per case (D145, bypasses the exclusion but not the
uniqueness check — a second manual attempt for an already-issued role
is rejected, not silently ignored).

### `CertificateTemplate`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | **Append-only — one row PER VERSION**, `@@unique([eventId, version])`. An edit creates a new row; it never mutates a previous one. This is the only way "an already-issued certificate continues rendering against that version forever" can hold in practice — a single mutable row would delete the very markup an old certificate needs the moment it's edited |
| `svgMarkup` | text | **Sanitized on upload** (D36) via `sanitize-html`'s real parser (not regex), case-sensitive-attribute-preserving — strips `<script>`/`<style>`/`<foreignObject>`/`<use>`/`<image>` (content and all, not just the tag) and any attribute not on an explicit allowlist (which excludes every `on*`/`href` by omission) |
| `version` | int | The "current" template for an event = the row with the highest `version` for that `eventId` |

Rendering is never cached as a second source of truth — cache entries
(Redis, keyed `certificate:{id}:{templateVersion}:{format}`, per D37)
are disposable and fully reconstructable from `payloadJson` + the pinned
template row at any time; a Redis outage falls through to a fresh
render rather than failing the request.

**Public certificate gallery:** `GET /users/:id/certificates` — no auth
required, lists a user's certificates across every event. A deliberate
public-by-default decision (D147), not an oversight. No
per-certificate hide/opt-out exists in this design.

---

## 13. Comments (Module 13)

**Locked stage doc as of this update, not yet implemented** — see
`stages/13-comments.md`. Depends on Module 1 (`emailVerifiedAt`) and
Module 5 (gallery visibility via `isDraft`).

### `Comment`

| Field | Type | Notes |
|---|---|---|
| `id`, `submissionId`, `userId` | | |
| `body` | text | |
| `createdAt`, `editedAt` | datetime, nullable | `editedAt` reflects most-recent edit, same pattern as `Submission.submittedAt` (D31) |
| `deletedAt` | datetime, nullable | Soft-delete only, never a hard `DELETE` |
| `deletedByUserId`, `deletionReason` | | `deletionReason` mandatory only for moderation deletion (someone other than the comment's own author) — self-deletion needs no reason (D148) |

### `Event` extension

| Field | Type | Notes |
|---|---|---|
| `commentsEnabled` | boolean | Default `true` |

Flat structure — no threading/replies (D148). Eligibility: any user
with `emailVerifiedAt` set, not participation-gated. Rate-limited via
the same Redis mechanism used for voting/CAPTCHA — no new
infrastructure. A comment remains visible even if its submission later
reverts to draft status — only new comment *creation* is gated by
current gallery visibility (D149).

---

## 14. Audit

### `AuditLog`

Append-only. Every privileged or destructive action across every module
writes here — role assignment, invitation actions, `siteAdmin` bypasses
(D14), voting round resets with their mandatory reason, results
publication. Never a bare `DELETE` anywhere in the schema without a
corresponding audit entry for context.

---

## 15. Import / export paths (brief requirement, tracked here as they're
decided)

- Event/Track/Prize descriptions are stored as markdown — directly
  exportable as plain text with no lossy HTML-to-text conversion needed.
- CSV export at every pipeline stage is a stated brief requirement;
  concrete field mappings will be added here once the export module is
  designed.
- Bulk import/export (T4) not yet designed.
