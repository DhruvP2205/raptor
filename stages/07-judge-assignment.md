# Stage Spec: Judge Assignment

Status: **Design locked, not yet implemented.**
Depends on Module 2 (Roles & Membership, for judge `EventMembership` and
track scoping), Module 3 (Event Management, for tracks), and Module 6
(Submission Verification, for the `finalDecision` gate). If code and
this doc disagree, update this doc first.

---

## 1. Scope of this stage

- Manual assignment: organizer assigns judges to projects directly,
  respecting a per-judge project limit.
- Algorithmic assignment: checkbox-driven — by track (if the event has
  tracks) or random (fallback, or by explicit choice even when tracks
  exist).
- The hard gate: only `finalDecision: APPROVED` submissions
  (Module 6) are ever assignable, by either mode.
- No-show handling: manual transfer of incomplete work, plus a
  permanent, platform-wide reliability note on the judge's profile.
- The immutability of completed assignments.
- Participant-side anonymity of judge identity.

Explicitly **not** in this stage: scoring itself, the rubric, or
normalization (later modules) — this module only decides *who reviews
what*, not what happens once they do.

---

## 2. The verification gate

**Neither assignment mode can act on a submission unless
`SubmissionVerification.finalDecision = APPROVED`.** A submission still
`PENDING_REVIEW` or resolved `DISQUALIFIED` is not merely deprioritized
— it is **structurally excluded** from both the manual project picker
and the algorithmic assignment pool. This is enforced at the query level
(the list of assignable submissions is filtered by `finalDecision =
APPROVED` before it's ever presented or acted on), not as a validation
check that could be bypassed by a direct API call naming a specific
submission ID. Attempting to manually assign a judge to a
non-`APPROVED` submission is rejected the same way as any other invalid
request, not silently ignored.

---

## 3. Manual assignment

- Organizer works through approved projects one at a time
  (`POST /events/:id/assignments`), assigning one or more judges to each.
- **Per-judge limit, enforced:** each event has a configured
  `maxProjectsPerJudge`. A manual assignment that would push a judge past
  their limit is rejected — the organizer must either choose a different
  judge or explicitly raise that judge's limit
  (`EventMembership.projectLimitOverride`, nullable, overrides the
  event-wide default for that one judge) before the assignment can
  proceed. This is a deliberate friction point, not a silent auto-allow,
  since an unbounded judge workload is exactly the kind of thing the
  brief's live progress dashboard (a later module) exists to catch.
- A single project can have multiple judges assigned to it (the normal
  case — the brief's own example is 3 reviews per project).

---

## 4. Algorithmic assignment

Organizer configures, then triggers a single "auto-assign" action:

- **Reviews-per-project target** (e.g. 3).
- **`maxProjectsPerJudge`** — same cap manual assignment respects.
- **Assignment strategy, chosen via checkboxes:**
  - **By track** — if the event has tracks configured
    (`trackAttachmentMode != NONE`), judges are matched against
    submissions within their `EventMembership.trackIds` scope (empty =
    all tracks). Only submissions within a judge's allowed tracks are
    eligible for that judge.
  - **Random** — the fallback when the event has no tracks configured,
    or an explicit organizer choice even when tracks exist (e.g. a small
    event where track-purity matters less than raw coverage).
- **Underlying mechanism:** round-robin assignment with a randomized
  starting offset per judge — guarantees every eligible project gets
  exactly the target review count, judge load stays balanced within 1,
  and no correlated clustering (the same small group of judges
  repeatedly landing on the same small group of projects).
- Auto-assign only ever operates on the `finalDecision: APPROVED` pool
  (Section 2) and only ever considers judges with
  `invitationStatus: ACCEPTED` (Module 2) — a `PENDING` judge invitation
  is invisible to the algorithm exactly as it's invisible to every other
  judge-gated action in the platform.

**Manual and algorithmic assignment can coexist on the same event.**
Typical flow: auto-assign the bulk, then manually adjust specific pairs
afterward (add a subject-matter expert to a specific project, move a
project off an overloaded judge, etc.). `JudgeAssignment.
assignmentMethod: MANUAL | ALGORITHMIC` records provenance for audit
purposes only — the isolation and access-control logic downstream treats
every assignment row identically regardless of how it was created.

---

## 5. No-show handling & judge reliability

**If an assigned judge never starts or never completes their review**
(assignment sits in `PENDING`/`IN_PROGRESS` with no submitted score),
organizer can manually transfer that specific assignment to a different
judge (`POST /assignments/:id/transfer`):

- The original assignment row is marked `TRANSFERRED` (not deleted —
  kept for the audit trail), referencing the new assignment it was
  replaced by.
- A fresh `JudgeAssignment` row is created for the receiving judge.
- **Organizer/admin attaches a written remark**, which is stored **on
  the judge's `User` profile, not scoped to this one event** — visible
  to *any* organizer or admin, platform-wide, for as long as that judge
  account exists. This is explicit and deliberate: the purpose is to
  inform future invite decisions on *other* events, not just to log an
  incident locally. The judge themselves never sees this remark.

**Once a project has been fully evaluated (a score is actually
submitted) by an assigned judge, that assignment is permanently locked
to that judge.** No transfer is possible after completion — not by
organizer, not by admin, under any circumstance. This is consistent with
the platform-wide rule that a completed, real record is never silently
altered after the fact (the same principle protecting a finalized
submission's team roster, a certificate's payload, or a completed
voting round's cast votes).

---

## 6. Participant anonymity

**A participant never learns which judge(s) reviewed their project, at
any point** — not during judging, not after results are published, not
via any API response, export, or certificate. This is a structural
guarantee: no participant-facing endpoint or data export ever includes
judge identity fields, at any stage of the pipeline.

**Honest scope of what this does and doesn't solve**, worth stating
plainly rather than implying more than is true: this prevents a
participant from lobbying, pressuring, or retaliating against a specific
judge, and it removes one avenue for a judge to be influenced by knowing
which team is watching them score. It does **not**, by itself, prevent a
judge from recognizing whose project it is from the content itself (a
familiar teammate's coding style, a project idea they already knew
about) — that's a different problem, and per the earlier discussion in
this module, this platform's answer to it is **organizer-managed
conflict avoidance only** (no self-service judge conflict-declaration
mechanism was requested or built) — an organizer who becomes aware of a
personal conflict handles it via manual reassignment (Section 5's
transfer mechanism, used proactively rather than only for no-shows).

---

## 7. Data model

### `JudgeAssignment`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `judgeId` | fk → User | |
| `submissionId` | fk → Submission | Must have `finalDecision: APPROVED` at assignment time (enforced, not merely expected) |
| `status` | enum: `PENDING \| IN_PROGRESS \| COMPLETED \| TRANSFERRED` | `COMPLETED` is permanent — no further status transition possible once reached |
| `assignmentMethod` | enum: `MANUAL \| ALGORITHMIC` | Audit/provenance only, no behavioral difference downstream |
| `transferredFromAssignmentId` | fk, nullable | Set on the *new* assignment row when created via transfer, pointing back to the `TRANSFERRED` row it replaced |
| `assignedAt`, `completedAt` | datetime | |

### `EventMembership` (extended, Module 2)

- `projectLimitOverride: Int?` — per-judge override of the event's
  `maxProjectsPerJudge` default, set explicitly by an organizer when a
  manual assignment would otherwise exceed the default cap.

### `Event` (extended, Module 3)

- `maxProjectsPerJudge: Int` — event-wide default cap, referenced by
  both assignment modes.

### `JudgeReliabilityNote` (new — on `User`, not event-scoped)

| Field | Type | Notes |
|---|---|---|
| `id`, `judgeUserId` | fk → User | |
| `eventId` | fk → Event | Context: which event this incident occurred during (retained for reference even though the note itself is platform-wide) |
| `authorUserId` | fk → User | The organizer/admin who wrote it |
| `remark` | text | |
| `createdAt` | | |

Visible on the judge's profile to any organizer/admin platform-wide —
e.g. surfaced during a future event's judge-invitation flow, so an
organizer considering re-inviting this judge can see it before doing so.
**Never visible to the judge themselves, and never visible to any
participant.**

---

## 8. What I'm testing for this module

- A submission with `finalDecision: PENDING_REVIEW` or `DISQUALIFIED`
  never appears in the manual-assignment picker's list, and a direct API
  attempt to assign a judge to it is rejected — not just hidden from a
  dropdown.
- Manual assignment respects `maxProjectsPerJudge` (or a judge's
  `projectLimitOverride` if set) — an assignment that would exceed the
  limit is rejected until the limit is explicitly raised.
- Auto-assign with "by track" selected never assigns a judge outside
  their `trackIds` scope; "random" ignores track scoping entirely.
- Auto-assign produces exactly the configured review count per
  submission, with judge load balanced within 1 across all eligible
  judges.
- Manual and algorithmic assignments coexist without conflict — running
  auto-assign after some manual assignments already exist doesn't
  duplicate or overwrite them unexpectedly.
- A `PENDING` (not yet `ACCEPTED`) judge invitation is excluded from
  auto-assign eligibility, identical to how it's excluded from every
  other judge-gated action.
- Transferring an incomplete assignment correctly marks the original
  `TRANSFERRED`, creates a new `PENDING`/`IN_PROGRESS` row for the
  receiving judge, and attaches the reliability note to the original
  judge's `User` profile — visible to a *different* organizer viewing
  that judge's profile on an unrelated event.
- Attempting to transfer an assignment that already has `status:
  COMPLETED` is rejected, unconditionally, regardless of actor
  (organizer or admin).
- No participant-facing API response, export, or certificate at any
  pipeline stage includes judge identity.

---

## 9. Open questions

None outstanding for this stage. Conflict-of-interest handling is
confirmed as organizer-managed only (Section 6) — no self-service judge
declaration mechanism exists in this design; revisit only if a future
need surfaces it explicitly.
