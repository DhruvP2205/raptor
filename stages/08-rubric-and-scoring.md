# Stage Spec: Rubric & Scoring

Status: **Design locked, not yet implemented.**
Depends on Module 3 (Event Management — extended by this doc, see
Section 7), Module 7 (Judge Assignment, for `JudgeAssignment`). If code
and this doc disagree, update this doc first.

---

## 1. Scope of this stage

- Organizer-defined weighted rubric, judge input on a 0–100 scale per
  criterion, set at event
  creation.
- The scoring flow: draft saves, full submit/resubmit, unlimited edits
  until `judgingClosesAt`.
- Per-project-per-judge required feedback/justification.
- Full revision history of every resubmit — immutable, append-only.
- The live progress dashboard.
- Weighted raw-score computation (input to Module 9's normalization —
  this module does not itself normalize across judges).
- The new `Event.judgingClosesAt` timeline field and its ripple into
  Module 3's phase sequence.

Explicitly **not** in this stage: cross-judge normalization (Module 9),
results computation/ranking (a later module), pairwise/Bradley-Terry
mode (bonus, separate module).

---

## 2. Rubric definition

Defined once, at event creation, by the organizer — **two independent
kinds of criteria**, not one undifferentiated list.

### 2.1 Scoring criteria (required, weighted, sum to 100)

- **`RubricCriterion` with `kind: SCORING`**: `label`, **`description`**
  — judge-facing guidance text, **`weightPercent`** (integer).
- **Judge input scale: 0–100 per criterion.** This supersedes the
  earlier fixed-1–5 judge-input decision (see `DECISIONS.md` D109,
  formally superseded by D118) — judges now enter a raw 0–100 value per
  criterion directly, not a 1–5 rating. The **display/winning scale**
  (Section 3) is a completely separate, organizer-configured value
  (default 5) — the two are never the same number, and must not be
  confused with each other in code, UI copy, or documentation.
- **Validation, confirmed: `weightPercent` values across all `SCORING`
  criteria for an event must sum to exactly 100.** Every criterion still
  validated positive.

### 2.2 Bonus tracks (optional, flat point value, not weighted)

- **`RubricCriterion` with `kind: BONUS`**: same authoring shape —
  `label`, `description`, judge-facing guidance text — plus a flat
  **`maxPoints`** value (e.g. +5, +10), never a percentage.
- **Fully optional at the event level.** Zero, one, or many bonus tracks
  per event, each with its own independent `maxPoints`.
- **A judge scores each bonus track on a scale of `0` to that track's
  `maxPoints`** — never required to complete `submit-review`.

### 2.3 Special-award criteria (optional, nomination-based, never scored
numerically) — added retroactively; a genuine gap in the original
design

**This was missing from the original version of this module.** The
brief's special categories (Best Code, Most Unique Feature, etc.) can't
be computed from a numeric rubric the way rank-based prizes can — they
need a mechanism for judges to actually express an opinion, or an
organizer picking a winner with zero judge input at all would undermine
the same judging-integrity bar this whole module exists to uphold.

- **`RubricCriterion` with `kind: SPECIAL_AWARD`**: `label`,
  `description` (guidance on what the category is looking for) — no
  `weightPercent`, no `maxPoints`. Never required to complete
  `submit-review`, same as bonus tracks.
- **Mechanism: per-submission, per-judge nomination, folded directly
  into the existing review flow — no separate step, no new UI beyond
  what a judge already sees while reviewing one submission.** While
  scoring a specific submission, a judge can toggle "nominate this
  submission for [Award Name]" for each `SPECIAL_AWARD` criterion
  defined on the event — a yes/no flag, not a number.
- **`Score.value` for a `SPECIAL_AWARD` criterion is constrained to `0`
  or `1`** (not nominated / nominated) — reusing the same `Score` table
  as `SCORING` and `BONUS` rather than a separate model, differentiated
  only by the valid value range for that criterion's `kind`.
- **Special-award nominations are never part of the `generalRaw` /
  `bonusRaw` / `rawTotal` formula (Section 3) in any way.** They don't
  affect a submission's rank-based score at all — they're tallied
  completely separately, at results-computation time (Module 10), by
  counting nomination flags across every `COMPLETED` judge assignment
  for that submission. Highest nomination count wins that category.
- Editable until `judgingClosesAt` and logged in `ScoreRevision`
  snapshots exactly like every other criterion — no new mutability or
  history mechanism needed, this rides on the existing one.
- **Honest limitation, worth naming plainly:** a judge can only nominate
  from among the submissions *they personally reviewed* — there's no
  cross-event comparison step where a judge sees every submission and
  picks a favorite from the full pool. Given assignment (Module 7)
  already distributes multiple judges across overlapping submissions,
  tallying nominations across all of them still produces a real signal,
  but it's a coverage-dependent one, not a full head-to-head comparison
  across every submission in the event. This is documented, not hidden.

### 2.4 Bonus guardrail — soft warning, not a hard block

Because bonus points are added directly into the same raw space as the
0–100 general score (Section 3), **an oversized combined bonus total can
let a weak project outscore a strong one** — proven with worked numbers
in design discussion (a single +90 bonus track let a `generalRaw=10`
project tie a `generalRaw=95` project). This is not a math bug; it's a
configuration risk that depends entirely on the organizer keeping bonus
values small relative to 100.

**Mitigation:** if the sum of all `BONUS` criteria's `maxPoints` for an
event exceeds a threshold (default: **20**, i.e. 20% of the 100-point
general base), the event-creation/edit UI shows an explicit warning
before allowing the organizer to proceed ("Your bonus tracks total N
points — this may let bonus outweigh actual project quality more than
recommended"). The organizer can still proceed past the warning
(deliberately not a hard block — organizer judgment is respected
elsewhere in this platform too), but doing so **writes an `AuditLog`
entry** recording the acknowledgment, consistent with how every other
powerful-but-risky organizer action in this platform is handled (not
prevented, but never silent).

---

## 3. Final score calculation

**This section reflects the finalized, example-verified formula — see
`DECISIONS.md` D119 for the full derivation history and why simpler
variants were rejected.**

### 3.1 Per judge: combine general and bonus while still in raw units

```
generalRaw (per judge) = Σ(criterionValue × weightPercent) / 100
                          → ranges [0, 100], criterionValue is the
                            judge's raw 0–100 input per criterion
bonusRaw (per judge)    = Σ(awarded points across all enabled bonus
                            tracks) → e.g. 0 to 8 for a +5/+3 setup
rawTotal (per judge)    = generalRaw + bonusRaw
```

**Critical: this addition happens while `generalRaw` is still in its
full 0–100 range — never after it has been divided down to a smaller
scale.** Dividing first and adding bonus after was tried and proven
broken during design discussion (a weak project with full bonus could
outscore a strong project with none) — the fix is that bonus must always
be added while both sides are in comparable, undivided raw units.

### 3.2 Across judges: average the raw totals, excluding non-responders

```
averageRawTotal = average of rawTotal across every judge with
                   JudgeAssignment.status = COMPLETED

  — a judge who never completes their review is excluded entirely from
    both the sum and the divisor (Module 7/8, D116) — never counted as
    zero, never counted at all.
```

### 3.3 Scale exactly once, at the very end

```
finalScore = (averageRawTotal / 100) × Event.finalScoreDisplayScale
```

- **`finalScoreDisplayScale`** — organizer-configured at event creation,
  default `5`.
- **Overflow is expected and honest, not an error.** If
  `averageRawTotal > 100` (possible whenever bonus pushes a judge's
  `rawTotal` past 100, and that effect survives averaging across
  judges), `finalScore` exceeds `finalScoreDisplayScale` — e.g. `5.34 /
  5`. This is displayed as-is with an overflow label (Section 3.5), never
  clamped or hidden.
- **The overflow check happens on the averaged submission-level score,
  not per individual judge.** A single generous judge alone does not
  trigger the label if the average across all completed judges stays at
  or under 100 — confirmed via worked example during design.

### 3.4 Worked examples (verified and confirmed correct)

**Example A — no bonus, two judges:**
```
Judge A: generalRaw = 83.75, bonus = 0  → rawTotal = 83.75
Judge B: generalRaw = 67.5,  bonus = 0  → rawTotal = 67.5
averageRawTotal = 75.625
finalScore = (75.625 / 100) × 5 = 3.78 / 5
```

**Example B — with bonus, one non-responding judge excluded:**
```
Judge A: generalRaw = 92.2, bonus = 8  → rawTotal = 100.2
Judge B: generalRaw = 57,   bonus = 3  → rawTotal = 60
Judge C: never submitted → excluded entirely, not counted as 0
averageRawTotal = (100.2 + 60) / 2 = 80.1     ← divided by 2, not 3
finalScore = (80.1 / 100) × 5 = 4.01 / 5
```

**Example C — overflow, checked at the averaged level:**
```
Judge A: rawTotal = 108
Judge B: rawTotal = 105.75
averageRawTotal = 106.875
finalScore = (106.875 / 100) × 5 = 5.34 / 5   → overflow label applies
```

### 3.5 Overflow labeling

When `finalScore > finalScoreDisplayScale`: displayed as the raw
computed number (e.g. "5.34 / 5") plus a fixed text label — **"Overachiever"**
(single flat label, not tiered by degree of overflow, per the simpler
option discussed). Shown in the public gallery. **Never shown on
certificates** — certificates remain pure factual records (name, event,
role) with no score of any kind, overflowing or otherwise, per the
existing certificate design (D34).

---

## 4. The scoring flow

### 4.1 Draft saves

- `PATCH /assignments/:id/scores` — a judge can save any subset of
  criterion values at any time (both `SCORING` and `BONUS` kinds), with
  no completeness requirement. Draft saves **do not** create a
  revision-history entry (Section 5) — only a full resubmit does. This
  avoids the history log filling with noise from every incremental
  autosave.
- Permitted only for the judge that specific `JudgeAssignment` row
  belongs to — the same per-resource guard pattern used everywhere else
  in this platform, never a generic "is this user a judge on this event"
  check.

### 4.2 Submitting (and resubmitting) a full review

- `POST /assignments/:id/submit-review` — validates every **`SCORING`**
  criterion has a value (0–100) and that the **overall feedback field is
  non-empty** (required). **`BONUS` tracks are never required** —
  unscored bonus tracks default to 0 contribution and do not block
  submission. Rejected with a specific error naming what's missing if a
  required check fails.
- On first successful submit: `JudgeAssignment.status → COMPLETED`,
  `completedAt` stamped. Per Module 7 (D106), **this permanently locks the
  assignment against transfer to a different judge** — that guarantee is
  unchanged and unaffected by anything in this module.
- **The same judge can call `submit-review` again, any number of times,
  right up until `event.judgingClosesAt`.** Each call is a full
  resubmission — validated the same way as the first submit, and each
  one appends a new entry to the revision history (Section 5). There is
  no separate "unlock" step needed (unlike participant submissions'
  explicit `unsubmit` action) — a `COMPLETED` assignment simply remains
  directly re-submittable by its judge until the deadline, since there's
  no team-roster-style lock to worry about reopening here.
- **After `judgingClosesAt`, `submit-review` (and the draft-save `PATCH`)
  is rejected outright, server time only** — same deadline-enforcement
  principle used for every other timestamp boundary in this platform.

### 4.3 Two distinct forms of immutability — not to be confused

- **Assignment ownership lock (Module 7, D106):** once *any* score is
  submitted, this assignment can never be handed to a different judge.
  Permanent, unconditional, unaffected by this module.
- **Content mutability (this module):** the *same* judge's actual score
  values and feedback text remain editable, by them, until
  `judgingClosesAt`. Not permanent until the deadline passes.

These are independent properties of the same row — a `COMPLETED`
assignment is simultaneously "locked to this judge forever" and "still
editable by this judge for now."

---

## 5. Revision history — full, immutable, append-only

Every successful `submit-review` call (the first one and every
resubmission) writes a `ScoreRevision` — a full snapshot, not a diff, of
every criterion value plus the overall feedback text at that moment,
timestamped. **Never edited or deleted after being written.** This is
what "log store all the changes judges made during the resubmit"
requires — an organizer/admin can pull up a judge's full history for a
given submission and see exactly how their scores moved between the
first pass and the final one, not just the end state.

Draft saves (Section 3.1) are explicitly **not** logged here — only a
completed, validated `submit-review` call creates a revision.

---

## 6. Live progress dashboard

Organizer-facing, per event: for each judge, a count of assignments
`total / COMPLETED / IN_PROGRESS / PENDING`. Purely a read-side
aggregation over `JudgeAssignment.status` — no new write path, and the
numbers must always reflect the live table state exactly (no cached
count that could drift), so an organizer can trust it to spot a judge
falling behind before the deadline rather than after.

---

## 7. Timeline change: `Event.judgingClosesAt` (amends Module 3)

**This module introduces a new, explicit timeline field that Module 3's
original design did not have.** Module 3 modeled the judging period as
an *implicit* gap between `eventEndsAt` and `resultsAnnounceAt`, with no
stored boundary of its own. That's superseded now:

- **New field:** `Event.judgingClosesAt`, organizer-set at event
  creation/edit, subject to the same phase-aware editing rules as every
  other timestamp (Module 3, Section 3).
- **Updated validation chain:**
  ```
  ... < eventEndsAt < judgingClosesAt <= resultsAnnounceAt < ...
  ```
  (`<=` rather than strict `<` between `judgingClosesAt` and
  `resultsAnnounceAt`, allowing an organizer to announce results the
  instant judging closes if they want zero gap for
  normalization/review — though in practice most events will want some
  buffer.)
- **Updated `EventPhase` sequence** (Module 3, Section 2.2):
  ```
  ... SUBMISSIONS_CLOSED → JUDGING → JUDGING_CLOSED → RESULTS_ANNOUNCED ...
  ```
  `JUDGING` now runs from `eventEndsAt` to `judgingClosesAt` (scoring
  actively happening, submit-review calls accepted); `JUDGING_CLOSED` is
  a new phase from `judgingClosesAt` to `resultsAnnounceAt` (scores
  frozen, normalization/organizer review happening, nothing judge-facing
  is writable anymore).

**Module 3's doc should be updated to reflect this** — the "(judging
window, implicit)" note in its Section 2.2 is now inaccurate; judging has
a real, named, organizer-configured boundary.

---

## 8. Data model

### `RubricCriterion` (now fully specified — was a placeholder in
Module 5's doc)

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `kind` | enum: `SCORING \| BONUS \| SPECIAL_AWARD` | Determines validation and calculation treatment — see Section 2 |
| `label` | string | |
| `description` | text | Judge-facing guidance — what to look for, how to score it |
| `weightPercent` | int, nullable | **`SCORING` only.** Must sum to exactly 100 across an event's `SCORING` criteria |
| `maxPoints` | int, nullable | **`BONUS` only.** Flat point value, e.g. 5, 10 — never a percentage |
| *(judge input scale)* | — | **`SCORING`: 0–100** (D118, supersedes the earlier fixed 1–5 design). **`BONUS`: 0 to `maxPoints`. `SPECIAL_AWARD`: 0 or 1** (nomination flag — Section 2.3). The organizer-facing display/winning scale (`Event.finalScoreDisplayScale`) is entirely separate from all of this — never conflate the two |

### `Score`

| Field | Type | Notes |
|---|---|---|
| `id` | | |
| `judgeAssignmentId` | fk → JudgeAssignment | |
| `criterionId` | fk → RubricCriterion | |
| `value` | int | **`SCORING` criteria: 0–100. `BONUS` criteria: 0 to that criterion's `maxPoints`. `SPECIAL_AWARD` criteria: 0 or 1** (nomination flag, Section 2.3). The live, current value — mutable by the assigning judge until `judgingClosesAt` |
| `note` | text, nullable | Optional per-criterion note |

### `JudgeReview` (one per `JudgeAssignment`)

| Field | Type | Notes |
|---|---|---|
| `id`, `judgeAssignmentId` (unique) | | |
| `overallFeedback` | text | **Required** to complete `submit-review` — the judge's justification in their own words |
| `submittedAt` | datetime | Always the most recent submit/resubmit timestamp — same "most recent, not original" pattern as `Submission.submittedAt` (Module 5, D31) |
| `revisionCount` | int | Convenience counter, incremented on every resubmit |

### `ScoreRevision` (append-only, never edited/deleted)

| Field | Type | Notes |
|---|---|---|
| `id`, `judgeAssignmentId` | | |
| `revisionNumber` | int | 1 for the first submit, incrementing on each resubmit |
| `scoresSnapshotJson` | json | Every criterion's value + note, as they stood at this submission (both `SCORING` and `BONUS`) |
| `overallFeedbackSnapshot` | text | The feedback text as it stood at this submission |
| `submittedAt` | datetime | |

### `Event` extension

- `judgingClosesAt: DateTime` — see Section 7.
- `finalScoreDisplayScale: Int` — organizer-configured, default `5`.
  Entirely separate from the 0–100 judge-input scale (Section 2.1) —
  never the same number, never conflated in code or copy.
- No new stored field for the bonus guardrail (Section 2.3) — it's a
  UI-time validation check (sum of `BONUS.maxPoints` vs. threshold) plus
  an `AuditLog` entry on override, not a persisted event setting.

---

## 9. What I'm testing for this module

- Event creation rejects a rubric where `SCORING` criteria's
  `weightPercent` values don't sum to exactly 100.
- Bonus tracks are accepted with zero validation against the 100-sum
  rule — their `maxPoints` values are independent of `SCORING`
  weighting entirely.
- **Event creation/edit shows the bonus-guardrail warning (Section 2.3)
  when the sum of `BONUS.maxPoints` exceeds the threshold (default 20),
  allows the organizer to proceed anyway, and writes an `AuditLog` entry
  recording that acknowledgment when they do.**
- An event with zero bonus tracks behaves identically to the
  pre-bonus-tracks design — `finalScore` reduces to exactly
  `(generalRaw / 100) × finalScoreDisplayScale`, averaged across
  `COMPLETED` judges.
- A judge can save partial scores repeatedly via `PATCH` with no
  completeness requirement (for both `SCORING` and `BONUS` criteria),
  and no `ScoreRevision` is created by these draft saves.
- `submit-review` rejects if any `SCORING` criterion is missing a value
  or if `overallFeedback` is empty — but succeeds with every `BONUS`
  track left completely unscored.
- **The final-score formula is verified end-to-end against the three
  worked examples in Section 3.4** — no-bonus averaging, non-responding
  judge exclusion at the raw-total stage (not after scaling), and the
  overflow case checked specifically at the *averaged* level (a single
  generous judge's individual `rawTotal > 100` must not, by itself,
  trigger the overflow label if the cross-judge average stays ≤ 100).
- **The bug from an earlier rejected formula variant does not
  reappear**: a low-`generalRaw` project with full bonus must never
  outscore a high-`generalRaw` project with none, when bonus tracks are
  within the recommended guardrail range — tested explicitly, since this
  exact failure mode was caught and fixed twice during design.
- A successful `submit-review` sets `status: COMPLETED`, stamps
  `completedAt` on first submit only, and creates exactly one new
  `ScoreRevision` row per call (including resubmits).
- A judge can call `submit-review` again after already being
  `COMPLETED`, and doing so succeeds (updates `Score` rows,
  `JudgeReview`, and appends a new `ScoreRevision`) — right up until
  `event.judgingClosesAt`.
- Any scoring write (`PATCH` or `submit-review`) attempted after
  `judgingClosesAt` is rejected using server time, tested at the exact
  boundary.
- Module 7's transfer-lock (D106) still holds independently — a
  `COMPLETED` assignment cannot be transferred to a different judge, even
  though its own judge can still edit it before the deadline.
- `ScoreRevision` rows are never mutated or deleted by any code path,
  including by admin — verified by attempting an update/delete directly
  and confirming rejection or the complete absence of such an endpoint.
- The progress dashboard's counts match live `JudgeAssignment.status`
  values exactly, with no caching drift.
- `Event` timestamp validation now enforces `eventEndsAt <
  judgingClosesAt <= resultsAnnounceAt`, rejecting any creation/edit that
  violates the updated chain.
- `EventPhase` correctly resolves to `JUDGING` between `eventEndsAt` and
  `judgingClosesAt`, and to `JUDGING_CLOSED` between `judgingClosesAt`
  and `resultsAnnounceAt`, tested via manipulated fixture timestamps.

---

## 10. Follow-up required in Module 3's doc

`03-event-management.md` currently describes the judging period as an
implicit gap with no stored boundary ("Between `eventEndsAt` and
`resultsAnnounceAt`, judges score"). Update that doc's timeline table,
validation chain, and `EventPhase` sequence to include the new
`judgingClosesAt` field and the new `JUDGING_CLOSED` phase, per Section 7
above.

---

## 11. Open questions

None blocking. The judge-input-scale question (0–100 vs. 1–5) and the
formula's order of operations are both fully resolved and confirmed
against worked examples (D118, D119). Two items remain as my own
implementation-detail calls rather than explicit user confirmation,
both easily reversible:

1. **`overallFeedback` is mandatory** to complete `submit-review` — see
   original reasoning in earlier revisions of this doc.
2. **Bonus guardrail is a soft warning + audit log, not a hard block**,
   with a default threshold of 20 (sum of `BONUS.maxPoints`). If a hard
   cap is preferred instead — i.e. the platform refuses to publish an
   event whose bonus tracks exceed the threshold, full stop, no
   override — that's a one-line change to the validation logic
   (reject instead of warn-and-log).
