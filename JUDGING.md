# How Raptor Judges a Hackathon

This document exists for one reader: someone who needs to verify that
Raptor's scoring and ranking are mathematically correct and fair, and
who wants the exact rules, not a marketing summary. If you're looking
for "how do I run this thing," see [README.md](README.md) instead —
this document assumes the platform is already running.

Every rule below is implemented in code, not aspirational. The
authoritative source for each is named inline so you can go verify it
directly: `docs/stages/*.md` is the locked design spec, and the paired
`*-formula.ts` file is the pure function that implements it (unit
tested against the worked examples quoted here).

---

## 1. The pipeline, end to end

```
Submission                                                      Public
  created  ──▶ Verification ──▶ Assignment ──▶ Scoring ──▶ Normalization ──▶ Results
 (draft/    (automated check,  (organizer or   (judges,    (z-score across   (draft →
  submit)    organizer gate)   algorithmic)     0–100/      calibration,      publish,
                  │              cap+override    per-       manual trigger,   versioned
                  │                              criterion)  locked after      correction
                  ▼                                          announce)        layer)
          APPROVED only ──────────────────────────────────────────────────────▶
          (PENDING_REVIEW /
           DISQUALIFIED stop
           here)
```

Only a submission with `finalDecision: APPROVED` ever reaches a judge.
Everything downstream — scores, normalization, ranking, published
results — is built on that gate never being bypassed.

---

## 2. Verification (brief)

*Full spec: `docs/stages/06-submission-verification.md`*

An organizer manually triggers an automated check against a
submission's repo URL (GitHub only — no automated check runs for
non-GitHub URLs, and that absence is never treated as evidence of
guilt). The check produces a `checkStatus` (`VERIFIED` / `FLAGGED` /
`REJECTED` / `NOT_RUN`), which is a separate field from
`finalDecision` (`PENDING_REVIEW` / `APPROVED` / `DISQUALIFIED`) —
**only `finalDecision` gates judge assignment.** A clean automated
check auto-resolves straight to `APPROVED` with no human step. Anything
short of clean (flagged, rejected, or simply not automatable) lands in
`PENDING_REVIEW` and requires an explicit organizer decision.
`DISQUALIFIED` always requires a mandatory, non-empty written reason —
never a silent status flip.

---

## 3. Assignment (brief)

*Full spec: `docs/stages/07-judge-assignment.md`*

Organizers assign judges to `APPROVED` submissions either manually or
algorithmically, both respecting `Event.maxProjectsPerJudge` (a per-
judge override, `EventMembership.projectLimitOverride`, can raise or
lower the cap for one specific judge). A judge assignment with no
recorded score can be reassigned freely if a judge no-shows; **the
instant any score is submitted for it, the assignment is permanently
locked to that judge** and can never be transferred to anyone else,
even by an admin. Participants never see which judges are reviewing
their submission.

---

## 4. Scoring — the exact formula

*Full spec: `docs/stages/08-rubric-and-scoring.md` · implementation:
`apps/api/src/scoring/score-formula.ts`*

### 4.1 Three kinds of rubric criteria

| Kind | Judge input | Counts toward score? |
|---|---|---|
| `SCORING` | 0–100 per criterion, `weightPercent` set at event creation, **must sum to exactly 100** across all `SCORING` criteria | Yes — the weighted base |
| `BONUS` | 0 to that track's `maxPoints`, optional, never required to submit a review | Yes — added on top, in raw units |
| `SPECIAL_AWARD` | 0 or 1 (a nomination toggle: "nominate this project for [Award]") | **No** — tallied completely separately, never part of the score formula (Section 6.2) |

### 4.2 Per judge, per submission

```
generalRaw = Σ(criterionValue × weightPercent) / 100        → range [0, 100]
bonusRaw   = Σ(awarded points across all enabled bonus tracks)
rawTotal   = generalRaw + bonusRaw
```

**Bonus is added while `generalRaw` is still in its full 0–100
range — never after scaling down.** This ordering was chosen
specifically because the reverse (divide, then add bonus) lets a weak
project with a large bonus outscore a strong project with none; adding
in raw, undivided units before any scaling closes that hole.

### 4.3 Across judges

```
averageRawTotal = average of rawTotal across every judge whose
                   JudgeAssignment.status = COMPLETED

  A judge who never completes a review is excluded from both the sum
  and the divisor — never counted as a zero.
```

### 4.4 Final scale, applied exactly once

```
finalScore = (averageRawTotal / 100) × Event.finalScoreDisplayScale
```

`finalScoreDisplayScale` is organizer-configured per event, default
`5`. It is a display scale only, and is never the same number as the
0–100 judge-input scale — the two are deliberately kept unconflatable
in both code and copy.

**Overflow is expected, not an error.** If `averageRawTotal > 100`
(possible whenever bonus pushes totals past 100), `finalScore` exceeds
`finalScoreDisplayScale` — e.g. `5.34 / 5` — and is shown as-is with an
**"Overachiever"** label in the public gallery. The check happens on
the *averaged* value, not per individual judge, so one generous judge
alone doesn't trigger it if the cross-judge average stays ≤ 100.
Certificates never show any score, overflowing or otherwise — they
remain pure factual records.

### 4.5 Worked example (verified in `score-formula.spec.ts`)

```
Judge A: generalRaw = 92.2, bonus = 8  → rawTotal = 100.2
Judge B: generalRaw = 57,   bonus = 3  → rawTotal = 60
Judge C: never submitted → excluded entirely, not counted as 0

averageRawTotal = (100.2 + 60) / 2 = 80.1        ← divided by 2, not 3
finalScore      = (80.1 / 100) × 5 = 4.01 / 5
```

### 4.6 Bonus guardrail

Because bonus is added in raw units, an oversized bonus pool can let a
weak project outscore a strong one on paper. If the sum of an event's
`BONUS.maxPoints` exceeds **20** (i.e. 20% of the 100-point base), the
organizer sees an explicit warning before proceeding. This is a soft
warning, not a hard block — the organizer can proceed anyway, but doing
so writes an `AuditLog` entry recording the acknowledgment. Nothing
about this bypasses the math above; it just makes a risky configuration
visible instead of silent.

### 4.7 Unlimited resubmission, full history kept

A judge can call `submit-review` as many times as they want, right up
until `Event.judgingClosesAt` — each call is a full resubmission,
validated the same way every time (every `SCORING` criterion must have
a value; overall feedback text is required; `BONUS`/`SPECIAL_AWARD` are
never required). **Every submission and resubmission writes a
`ScoreRevision` snapshot — full, immutable, append-only.** Nothing is
ever overwritten in a way that loses the prior state; an organizer can
pull up exactly how a judge's scores moved between their first pass and
their final one. Draft (`PATCH`) saves do not create a revision — only
a validated `submit-review` does. After `judgingClosesAt`, every write
path is rejected, checked against server time only.

---

## 5. Normalization — correcting for judge tendency

*Full spec: `docs/stages/09-normalization.md` · implementation:
`apps/api/src/normalization/normalization-formula.ts`*

Averaging `rawTotal` directly across judges assumes every judge's
numbers mean the same thing. They don't — one judge might score
everything in the 60s, another in the 90s. Normalization converts each
judge's contribution to a personal z-score before combining, so a
submission's result depends on merit, not on which judges happened to
be assigned to it.

### 5.1 Judge calibration — global, not per-event

Each judge has a platform-wide (not per-event) `judgeCalibrationMean` /
`judgeCalibrationStdDev` / `judgeCalibrationSampleCount` on their
`User` record, recomputed after every `submit-review` call across
**every event they've ever judged**.

### 5.2 The formula, per judge per submission

```
if sampleCount >= 3 AND stdDev > 0:
    z = (rawTotal - judgeCalibrationMean) / judgeCalibrationStdDev

elif sampleCount >= 3 AND stdDev == 0:
    z = 0                    ← "uniform scoring" — flagged for admin/organizer

else (sampleCount < 3):
    z = (rawTotal - eventMean) / eventStdDev
        ← event-baseline fallback: a judge without enough personal
          history yet is treated as an average judge for this specific
          event, so every judge's contribution stays in the same
          z-score space regardless of how much platform history they have
```

Per submission: average `z` across every `COMPLETED` judge (same
non-responder exclusion as scoring). Across the whole event, once:
linearly rescale the full set of averaged z-scores onto 0–100 using
that set's own min/max, then apply the *same* final step as
non-normalized scoring:

```
finalScore = (rescaledValue / 100) × Event.finalScoreDisplayScale
```

### 5.3 The permanent lock — the single most important guarantee here

**A normalization run can be triggered manually and re-run any number
of times, but only while `judgingClosesAt <= now() < resultsAnnounceAt`.
The instant `resultsAnnounceAt` passes, normalization is permanently
locked for that event — no exceptions, no admin override, full stop.**

Every run snapshots each judge's mean/stddev/sample-count *as they
stood at that exact moment* into a `NormalizedJudgeScore` row — never a
live reference to the judge's ever-evolving global profile. This means
a past event's normalization can never silently drift, even years
later, even after the same judges have scored hundreds more projects
elsewhere. Once results are public, the computation behind them is
frozen exactly as it was when it went live. (A separate, heavily
audited correction layer exists for genuine post-publish fixes —
Section 7 — but it never reopens or re-executes normalization itself.)

Both raw and normalized numbers stay visible side by side to
organizers/admins after a run — normalization is never a black box that
discards the input it worked from.

---

## 6. Ranking

*Full spec: `docs/stages/10-results-and-rankings.md` · implementation:
`apps/api/src/results/results-formula.ts`*

### 6.1 Rank-based prizes — dense ranking, ties genuinely share

Sorted by the selected normalization run's `finalScore`, descending,
across `finalDecision: APPROVED` submissions only. Tie-break cascade:

1. Higher `finalScore` wins.
2. Still tied → higher pre-normalization `averageRawTotal` wins.
3. Still tied → higher raw bonus contribution (`bonusRaw`) wins.
4. **Still tied after all three → the tied submissions share the
   position and its prize together.** There is no fourth-level
   tiebreaker (no submission ID, no timestamp, no coin flip) and no
   escalation to manual review — a genuine tie is resolved
   automatically by sharing, every time.

**Dense ranking, not skip-ranking**: for four submissions scoring
`A > B = C > D`, the result is `A: 1st`, `B: 2nd`, `C: 2nd`, `D: 3rd` —
not 4th. Positions never skip after a tie.

### 6.2 Special-award winners — a different cascade, on purpose

Each `SPECIAL_AWARD` criterion tallies nomination flags
(`Score.value = 1`) from every `COMPLETED` judge assignment. Winner:
highest nomination count. Tie-break cascade — **note the order is
reversed from Section 6.1**:

1. Higher nomination count wins.
2. Still tied → higher `bonusRaw` wins (**checked before the general
   score here**, because a category like "Most Unique Feature" tends to
   correlate more with whatever a bonus track already rewards than with
   the overall weighted rubric).
3. Still tied → higher `finalScore` (from the same selected run) wins.
4. Still tied → share the award, same philosophy as a rank tie.

### 6.3 Ties share, never arbitrary — this is absolute

Both cascades above terminate in a share, never in an arbitrary
deterministic-but-meaningless tiebreaker. If the platform ever ranked
two truly identical submissions differently based on, say, which one
happened to have the lower database ID, that would be indistinguishable
from a coin flip dressed up as math — and that is exactly the outcome
this design refuses to produce.

---

## 7. Publishing and correction

*Full spec: `docs/stages/10-results-and-rankings.md` Sections 5–7*

Results are computed privately into a `ResultsDraft` (organizer/admin
only, never participant-visible regardless of event phase) tied to one
specific normalization run. The organizer marks a draft `READY` when
satisfied. Publishing can be `AUTO` (fires at `resultsAnnounceAt`, but
**only** if the draft is `READY` at that exact moment — an unfinished
draft never auto-publishes) or `MANUAL` (requires an explicit,
confirmed click, any time). Publishing creates an immutable
`PublishedResultVersion`.

**`EventPhase` reaching `RESULTS_ANNOUNCED` is purely timestamp-driven
and is not, by itself, what participants see.** The real visibility
gate is whether a `PublishedResultVersion` with `status: LIVE` exists.
A passed timestamp with nothing published yet shows participants
nothing — never a fallback to partial or draft data.

**Post-publish corrections** (disqualify a project, manually reorder a
rank, override a displayed score) never touch normalization — that
lock (Section 5.3) is absolute. Instead, every correction requires a
mandatory written reason, creates a **new** `PublishedResultVersion`
(the prior one marked `SUPERSEDED`, never deleted or edited in place),
is visibly labeled as a correction wherever shown, and writes a
complete `AuditLog` entry: who, what, why, when, which version.

---

## 8. Adjacent systems (pointers)

- **Voting** (`docs/stages/11-voting.md`) — a separate, single-choice
  public ballot (one vote per person per round), distinct from judge
  scoring entirely. Results are hidden while a round is open — no
  live tally is ever exposed, to anyone, mid-round — and become visible
  only in aggregate after the organizer publishes. A full round restart
  is available and fully audited, but carries **zero carryover**: a new
  round starts from a blank shortlist, and the one-vote-per-round
  uniqueness constraint means every past voter gets exactly one fresh
  vote in the new round.
- **Certificates** (`docs/stages/12-certificates.md`) — Ed25519-signed
  factual records (name, event, role — **never a score**), rendered
  from a stored `payloadJson` + signature at request time, never as a
  pre-rendered image. Verifiable independently of the platform's own
  UI by checking the signature against the payload.
- **Global ranking** (`docs/stages/14-global-ranking.md`) — a
  platform-wide leaderboard aggregating points across every event a
  person has won an award in, using its own six-level tie-break cascade
  (points → firsts → seconds → thirds → events entered → earliest first-
  event date → shared position) — deliberately a different cascade from
  Section 6.1's per-event one, because it's answering a different
  question (a career track record, not a single event's outcome).

---

## 9. Why this is defensible

Every number a participant, judge, or organizer sees on this platform
traces back to a rule in this document, and every rule in this document
traces back to a pure, unit-tested function with no hidden branch and
no manual override that bypasses it silently. Authorization for every
privileged action (marking a submission `DISQUALIFIED`, triggering
normalization, publishing or correcting results) is enforced at the
API layer, not just hidden in the UI. Every one of those actions writes
to an append-only `AuditLog`. Normalization is provably frozen the
moment results go live. Ties are never broken arbitrarily — they share.
And nothing here depends on a third-party scoring service, a hosted
database, or any component a self-hoster can't audit directly, because
the entire stack is plain, inspectable, open-source code running on
infrastructure the organizer controls.
