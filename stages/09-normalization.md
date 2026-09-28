# Stage Spec: Normalization

Status: **Design locked, not yet implemented.**
Depends on Module 3 (Event Management, for `judgingClosesAt` /
`resultsAnnounceAt`), Module 8 (Rubric & Scoring, for `rawTotal` and the
`finalScoreDisplayScale` final step). If code and this doc disagree,
update this doc first.

---

## 1. Scope of this stage

- Why raw cross-judge averaging alone is insufficient, and what
  normalization corrects for.
- The judge calibration profile: global, platform-wide, live-updating.
- The minimum-N fallback and the blending problem it solves.
- Zero-variance ("uniform scoring") handling.
- The manual trigger, unlimited re-runs, and the hard lock at
  `resultsAnnounceAt`.
- Snapshotting: why a run's inputs are frozen permanently, not tied to
  a judge's ever-changing live profile.
- Visibility of calibration data to admin/organizer.

Explicitly **not** in this stage: results computation/ranking display,
prize assignment, or the "publish results" action itself — those belong
to a later Results & Rankings module that *consumes* this module's
output; this module only produces the normalized numbers.

---

## 2. Why normalization exists

Averaging `rawTotal` (Module 8) directly across judges assumes every
judge's numbers mean the same thing — they don't. One judge may
routinely score in the 60s and reserve 90+ for exceptional work; another
may score everything in the 80s–90s. Without correction, a project's
outcome depends partly on *which judges happened to be assigned to it*,
not purely on merit. Normalization adjusts each judge's contribution
relative to their own scoring tendency before combining across judges.

---

## 3. Judge calibration profile — global, not per-event

**Confirmed: a judge's calibration is a platform-wide personal trait,
not something that resets per event.** Fields live directly on `User`:

```
judgeCalibrationMean: Float
judgeCalibrationStdDev: Float
judgeCalibrationSampleCount: Int
```

- Recomputed after **every** `submit-review` call (first submit or any
  resubmit — Module 8, D110/D111) — the input set is every `rawTotal`
  value from every `JudgeAssignment` with `status: COMPLETED` that this
  judge has ever had, across **all events**, not scoped to one.
- **This is always the live, current profile** — it keeps evolving as
  the judge reviews more projects across future events. It is *not*
  what a normalization run uses directly (see Section 6, Snapshotting).

**Minimum-N = 3, counted platform-wide.** A judge with fewer than 3
`COMPLETED` reviews *ever* (not per-event) does not have a statistically
meaningful personal mean/stddev yet — see Section 4 for how their scores
are still incorporated safely.

---

## 4. The blending problem, and its fix

**The problem:** on any given submission, some assigned judges may have
enough history to be meaningfully normalized (a real personal z-score),
while others (new judges, or judges early in their platform history) do
not. Averaging a real z-score with an unconverted raw number is not
mathematically valid — they are not the same kind of quantity.

**The fix — event-baseline fallback:** for a judge below the
minimum-N threshold, normalize them against **this event's own
aggregate mean/stddev** (computed across every `rawTotal` from every
`COMPLETED` judge assignment in this specific event, at the time of the
run) instead of their own unreliable personal figures. This is
equivalent to assuming "we don't know this judge's personal tendency
yet, so treat them as an average judge for this event" — it keeps every
judge's contribution in the same z-score space, so cross-judge averaging
on a submission is always valid, regardless of which judges have
platform history and which don't.

```
eventMean, eventStdDev = mean/stddev of every rawTotal value across
                          every COMPLETED JudgeAssignment in this event,
                          computed fresh at run time
```

This decision was made directly rather than asked back — it's the
standard, defensible statistical handling of a mixed-reliability
population, and the alternative (mixing raw and normalized numbers
directly) would be a real correctness bug, not a style choice.

---

## 5. The full formula, per judge per submission

```
if judgeCalibrationSampleCount >= 3 AND judgeCalibrationStdDev > 0:
    z = (rawTotal - judgeCalibrationMean) / judgeCalibrationStdDev

elif judgeCalibrationSampleCount >= 3 AND judgeCalibrationStdDev == 0:
    z = 0                          ← "uniform scoring" — see Section 5.1

else (judgeCalibrationSampleCount < 3):
    z = (rawTotal - eventMean) / eventStdDev     ← Section 4's fallback
```

**Per submission:** average `z` across every judge with
`JudgeAssignment.status: COMPLETED` for that submission — same
exclusion rule as Module 8 (D116); a non-responding judge contributes
nothing to either the sum or the divisor.

**Across the whole event, once:** take every submission's averaged `z`
value and linearly rescale that entire set onto `0–100`, using the
actual min and max of the set as the rescale bounds. Then apply Module
8's exact final step, reused as-is:
```
finalScore = (rescaledValue / 100) × Event.finalScoreDisplayScale
```
One consistent last step, whether or not normalization ran — this keeps
the display/output shape identical regardless of which scoring path
produced the number feeding into it.

### 5.1 Zero-variance ("uniform scoring") judges

A judge whose `judgeCalibrationStdDev` is exactly `0` (they've given
every project across their history the *identical* `rawTotal`) has no
differentiating signal to normalize. Their z-score is set to `0`
(neutral — neither helping nor hurting any submission they judged), and
this is **flagged** — visible to admin/organizer (Section 8), not
silently absorbed. Consistent with the platform-wide principle that no
status is ever invisible to a human who might need to act on it.

---

## 6. Trigger: manual, unlimited re-runs, hard-locked after
`resultsAnnounceAt`

- **Never automatic.** An organizer or admin explicitly triggers a
  normalization run (`POST /events/:id/normalization-runs`).
- **Allowed only while `judgingClosesAt <= now() < resultsAnnounceAt`.**
  Attempting to trigger it before `judgingClosesAt` (judging isn't even
  closed yet) or at/after `resultsAnnounceAt` is rejected outright.
- **Can be re-run any number of times within that window** — e.g. if a
  late assignment transfer (Module 7) changes the input population, or
  an organizer just wants to re-check after fixing something.
- **Once `resultsAnnounceAt` passes, normalization is permanently
  locked for that event — no exceptions, no admin override.** This is
  the same class of protection as an already-cast vote or an issued
  certificate: once results are real and public, the computation behind
  them cannot be silently redone.

---

## 7. Snapshotting — why a run doesn't depend on a live, moving profile

**Per your explicit instruction: every normalization run attaches each
judge's mean/stddev/sample-count, as they stood *at that exact moment*,
to the specific review it was used for** — not a live reference back to
the judge's ever-evolving global profile.

Why this matters: `judgeCalibrationMean`/`StdDev` keep changing as a
judge reviews more projects at future events. Without snapshotting, a
past event's normalization could silently shift if you queried it again
after the judge's global profile moved on — exactly the kind of
after-the-fact mutation this platform refuses to allow anywhere else. A
`NormalizedJudgeScore` row (Section 9) is written on every run, and it
never changes after being written, even as the judge's live profile
continues to evolve. The last run before `resultsAnnounceAt` locks in as
the permanent record.

---

## 8. Visibility

**Judge mean/stddev — both the live global profile and any specific
run's snapshot — visible to admin and organizer.** Extending this
platform-wide (any organizer/admin, not only the organizer of the event
currently being normalized) for consistency with how Module 7's
`JudgeReliabilityNote` already works — both exist to inform trust/
calibration judgments about a judge that may matter beyond just the one
event in front of you. **Never visible to the judge themselves, and
never visible to any participant** — same boundary as every other
internal judge-performance signal in this platform.

**Both raw and normalized results are shown to organizers side by
side** — normalized is the official ranking basis, but raw is never
hidden or discarded. This directly satisfies the brief's own
Normalization Proof bonus framing ("show the raw scores, the normalized
scores, and the ranking change").

---

## 9. Data model

### `User` extension

| Field | Type | Notes |
|---|---|---|
| `judgeCalibrationMean` | float | Live, recomputed after every `submit-review`, platform-wide history |
| `judgeCalibrationStdDev` | float | Same |
| `judgeCalibrationSampleCount` | int | Same — this is what's checked against the minimum-N threshold |

### `NormalizationRun`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `runByUserId` | fk → User | |
| `runAt` | datetime | |
| `method` | enum | `Z_SCORE` (only method for this stage) |
| `minimumN` | int | `3`, stored per-run for historical accuracy even if the platform default ever changes later |
| `eventMean`, `eventStdDev` | float | This run's computed event-wide baseline (Section 4), frozen at run time |

### `NormalizedJudgeScore` — the snapshot, one per judge per run

| Field | Type | Notes |
|---|---|---|
| `id`, `normalizationRunId`, `judgeAssignmentId` | | Ties the snapshot to the specific review it was computed for |
| `rawTotal` | float | The input value at run time |
| `judgeMeanAtRun`, `judgeStdDevAtRun`, `sampleCountAtRun` | float, float, int | Frozen copies — **never** a live reference to `User.judgeCalibration*` |
| `usedFallback` | boolean | `true` if this judge was below minimum-N and the event baseline was used instead |
| `uniformScoringFlagged` | boolean | `true` if `judgeStdDevAtRun = 0` |
| `zScore` | float | The computed value, per Section 5 |

### `NormalizedScore` — one per submission per run

| Field | Type | Notes |
|---|---|---|
| `id`, `normalizationRunId`, `submissionId` | | |
| `averagedZScore` | float | Average of `NormalizedJudgeScore.zScore` across `COMPLETED` judges for this submission |
| `rescaledValue` | float | This run's linear rescale of `averagedZScore` onto 0–100, using the run's own min/max across all submissions |
| `finalScore` | float | `(rescaledValue / 100) × Event.finalScoreDisplayScale` — the same final number Module 8 would show for a non-normalized event |
| `rank` | int | Within this run |

---

## 10. What I'm testing for this module

- A judge with `judgeCalibrationSampleCount < 3` is normalized against
  the event's own baseline, not their own mean/stddev — verified by a
  fixture where using their (too-small-sample) personal figures would
  produce a visibly different, wrong z-score.
- A judge with `judgeCalibrationStdDev = 0` gets `z = 0` for every
  submission they judged, and is flagged (`uniformScoringFlagged: true`)
  — visible on the admin/organizer dashboard.
- `judgeCalibrationMean/StdDev/SampleCount` on `User` update correctly
  after a `submit-review` call, and reflect history across **multiple
  events**, not just the current one — tested with a fixture judge who
  has completed reviews on two different past events.
- A normalization run's `NormalizedJudgeScore` rows are frozen at
  creation — a subsequent change to the judge's live
  `judgeCalibrationMean` (e.g. from judging a different, later event)
  does **not** alter a previously-created run's stored snapshot values.
- Triggering a normalization run before `judgingClosesAt` is rejected.
- Triggering a normalization run at or after `resultsAnnounceAt` is
  rejected unconditionally — including as a `siteAdmin`, with no bypass
  path.
- Multiple re-runs within the valid window each produce their own
  independent `NormalizationRun` + snapshot set — an earlier run's data
  is never overwritten or deleted by a later one.
- A submission's `averagedZScore` correctly excludes any judge whose
  `JudgeAssignment.status != COMPLETED` for that submission, matching
  the same exclusion behavior already tested in Module 8 (D116).
- The final `finalScore` produced by this module, for an event with
  only one judge who has plenty of history and zero variance issues,
  matches what Module 8's own (non-normalized) formula would have
  produced for the same input — confirming normalization doesn't change
  the output when there's nothing to correct for.
- Both raw (`Submission`/`Score`-derived) and normalized
  (`NormalizedScore`) results are independently queryable by an
  organizer at the same time — normalizing never deletes or hides the
  raw data it was computed from.

---

## 11. Open questions

None blocking. One scope confirmation made directly rather than asked
back: **calibration visibility is platform-wide (any organizer/admin),
not scoped to only the organizer of the event currently being
normalized** — consistent with Module 7's `JudgeReliabilityNote`
visibility pattern. Flag if you want this scoped more narrowly instead.
