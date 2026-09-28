# Stage Spec: Results & Rankings

Status: **Design locked, not yet implemented.**
Depends on Module 3 (`resultsAnnounceAt`), Module 8 (Rubric & Scoring,
including the retroactively-added `SPECIAL_AWARD` criterion kind —
Section 2.3 of that doc), Module 9 (Normalization, for `NormalizedScore`
and the permanent lock at `resultsAnnounceAt`). If code and this doc
disagree, update this doc first.

---

## 1. Scope of this stage

- Selecting which `NormalizationRun` is the official one for an event.
- Computing rank-based prizes (top 3, etc.) with a deterministic
  tie-break cascade that ends in genuinely **sharing** a position, not
  escalating to manual review.
- Computing special-award winners from Module 8's nomination flags.
- The draft → publish workflow, including auto vs. manual publish
  timing and an explicit "ready" gate.
- The versioned post-publish correction layer — disqualification, rank
  adjustment, explicit score override — and how it coexists with
  Module 9's permanent normalization lock without contradicting it.
- The visibility gate (a published result, not the event's timestamp
  phase, is what actually reveals data).

Explicitly **not** in this stage: the separate public-voting results
flow (`votingWinnerAnnounceAt`) — that's a distinct later module, which
should reuse this module's draft/publish/correction pattern rather than
inventing a new one, but is not designed here.

---

## 2. Selecting the official normalization run

Module 9 permits unlimited re-runs before `resultsAnnounceAt`. Before
building a results draft, the organizer/admin explicitly picks which
`NormalizationRun` to base it on:

- **Default: the most recent run.** Not automatic/implicit — surfaced
  as a pre-selected default the organizer can change.
- **Full run history is visible**, each with its `runAt` timestamp and
  method, plus a preview of the ranking it would produce, so the
  organizer can compare runs before committing to one rather than
  picking blind.
- Once a run is selected for a draft, that draft is tied to it — see
  Section 5.

---

## 3. Rank-based prizes: dense ranking with genuine tie-sharing

**Sorting basis:** the selected run's `NormalizedScore.finalScore`,
descending, across `finalDecision: APPROVED` submissions only (Module
6's gate still applies — a disqualified or pending-review submission
never enters rankings).

**Tie-break cascade, three levels, ending in sharing rather than
escalation:**
1. Higher `NormalizedScore.finalScore` wins outright.
2. Still tied → higher pre-normalization `averageRawTotal` (Module 8/9
   raw combined score) wins.
3. Still tied → higher raw bonus contribution (`bonusRaw`, Module 8)
   wins.
4. **Still tied after all three levels → the tied submissions share the
   position and its prize together.** No manual-review escalation for
   rank ties — this is a deliberate, fully automatic resolution per
   explicit instruction, distinct from how ties are handled in other
   modules (e.g. voting) where automation stops short of a final call.

**Dense ranking, not skip-ranking — confirmed via worked example:**
positions do not skip after a tie. If two submissions share 2nd place,
the next distinct-scoring submission takes **3rd**, not 4th. Concretely,
for four submissions A > B = C > D:

```
A    → 1st (alone)
B, C → 2nd (tied, share the position and prize)
D    → 3rd (not 4th — the next position is sequential, not skipped)
```

This is "dense ranking" / modified competition ranking, and it's the
one both of the worked examples in design discussion actually described
— **standard "Olympic" skip-ranking (which would have made D 4th) is
explicitly rejected** for this platform.

**Sharing a prize, precisely:** a `Prize` row for a given `rank` can
have more than one winning submission linked to it when a tie produces
shared occupants. The platform records *who* shares a position and its
associated prize; actual monetary/physical prize division between
co-winners is an organizer's real-world responsibility, not something
this system computes or enforces.

---

## 4. Special-award winners

From Module 8, Section 2.3: each `SPECIAL_AWARD` criterion accumulates
`Score.value = 1` nomination flags from every `COMPLETED` judge
assignment across the event.

**Winner computation, per `SPECIAL_AWARD` criterion:** the submission
with the highest total nomination count wins. **Tie-break cascade,
distinct from Section 3's rank-prize cascade — bonus is checked before
the overall normalized score, not after:**

1. Higher nomination count wins outright.
2. Still tied → higher raw bonus contribution (`bonusRaw`, Module 8)
   wins.
3. Still tied → higher `NormalizedScore.finalScore` (from the same
   selected run) wins.
4. Still tied → **share the award**, same resolution philosophy as a
   rank tie.

Bonus is checked *before* the general final score here — the reverse
order from Section 3's rank-prize cascade (which checks the general
raw total before bonus). This is deliberate: a special category like
"Most Unique Feature" often correlates more directly with whatever a
bonus track is rewarding (e.g. an "Innovation" bonus) than with the
overall weighted rubric does, so it makes sense to let that
more-topically-relevant signal break a tie first, before falling back
to the general score.

---

## 5. Draft → publish workflow

### 5.1 Drafting

- A `ResultsDraft` is created against a specific selected
  `NormalizationRun` (Section 2), computing the full rank-based and
  special-award results privately — visible only to organizer/admin,
  never to participants, regardless of `EventPhase`.
- Organizer reviews the draft for correctness before committing to
  anything public. This exists specifically so a real error (wrong run
  selected, an assignment issue not yet caught) can be found and fixed
  *before* anything goes live, rather than only being correctable after
  the fact via Section 7's heavier correction mechanism.
- **`draftStatus: IN_PROGRESS | READY`** — organizer explicitly marks a
  draft `READY` once satisfied. This flag is what Section 5.2's
  auto-publish checks against.

### 5.2 Publish mode: `AUTO` or `MANUAL`

Configured per draft (or per event, applied to its draft):

- **`AUTO`** — when `now()` reaches `event.resultsAnnounceAt`, the
  draft goes live automatically, **but only if `draftStatus: READY` at
  that moment.** If the draft is still `IN_PROGRESS` when the timestamp
  arrives, auto-publish does **not** fire on an unfinished, unreviewed
  draft — it falls back to requiring an explicit manual publish action
  once the organizer finishes preparing it. This gate was decided
  directly by Claude, not asked back, as the safer default: silently
  auto-publishing whatever half-finished state happens to exist at a
  timestamp is a worse failure mode than requiring one extra manual
  click in the rare case a draft wasn't ready in time.
- **`MANUAL`** — regardless of timestamp, nothing goes live until the
  organizer explicitly clicks publish **and confirms** (a required
  confirmation step, same pattern as `submit-review`'s confirmation
  dialog) — even after `resultsAnnounceAt` has already passed.

### 5.3 Publishing creates an immutable version

Publishing a `ResultsDraft` creates a `PublishedResultVersion` —
`versionNumber: 1`, `status: LIVE`. This version, once live, is never
edited in place — see Section 7 for how corrections work instead.

### 5.4 Unpublishing

Organizer/admin can unpublish a live version (`status: LIVE →
UNPUBLISHED`) if it went live by mistake — **requires a reason**, same
justification-required pattern used for every other consequential
action in this platform, and writes an `AuditLog` entry. The version
record itself is never deleted, only marked non-live — nothing in this
platform silently disappears.

---

## 6. Visibility — decoupled from `EventPhase`

**`EventPhase` reaching `RESULTS_ANNOUNCED` is purely timestamp-driven
(Module 3) and happens whether or not an organizer actually published
anything.** The actual data gate for participants is entirely separate:
**does a `PublishedResultVersion` with `status: LIVE` exist for this
event.** If the phase has advanced but nothing has been published yet
(e.g. `MANUAL` mode, organizer hasn't clicked yet), participants see
nothing — same "waiting on an explicit organizer action" state used
elsewhere in this platform, never a fallback to showing partial or
draft data just because a timestamp passed.

Once live: every `APPROVED` submission's score (with overflow labels
per Module 8/9) is visible in the public gallery, winners get a visible
prize/award badge, and non-winning submissions are simply unranked
-highlighted, never hidden.

---

## 7. Post-publish correction — a new, versioned layer, not a reopening
of normalization

**This does not conflict with Module 9's D126 (normalization
permanently locked after `resultsAnnounceAt`).** That lock still holds
completely — no `NormalizationRun` can ever be re-executed or altered
for this event again, full stop. What's introduced here is a
**separate, explicit, heavily-audited override layer sitting on top of
an already-published, already-computed result** — conceptually similar
to how a certificate's underlying payload is immutable, yet the
platform can still supersede a record through a visible, deliberate
action when genuinely necessary.

**Organizer/admin can, after publish:**

- **Disqualify a project** from the published results (removing it from
  ranking/awards entirely going forward).
- **Manually reorder rank** — move a submission up or down, overriding
  the computed order.
- **Explicitly override a displayed score** for a specific submission in
  this version, bypassing what `NormalizedScore.finalScore` computed.

**Every one of these actions:**

- **Requires a mandatory written reason** — same non-negotiable pattern
  as disqualification (Module 6), bans, and voting-round restarts.
- **Creates a new `PublishedResultVersion`** (`versionNumber: N+1`),
  marks the previous version `SUPERSEDED` (never deleted, never edited
  in place).
- **Is visibly marked as a correction** wherever results are displayed
  — a corrected entry shows a distinct label/indicator and its reason,
  never presented identically to an original, uncorrected result.
- **Writes a complete `AuditLog` entry** — who, what changed, why, when,
  and which version it produced.

---

## 8. Data model

### `ResultsDraft`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `normalizationRunId` | fk → NormalizationRun | Which run this draft is based on (Section 2) |
| `draftStatus` | enum: `IN_PROGRESS \| READY` | Gates auto-publish (Section 5.2) |
| `publishMode` | enum: `AUTO \| MANUAL` | |
| `createdByUserId`, `createdAt` | | |

### `PublishedResultVersion`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId`, `versionNumber` | | |
| `status` | enum: `LIVE \| SUPERSEDED \| UNPUBLISHED` | Never deleted — status transitions only |
| `resultsDraftId` | fk, nullable | Null for a version created purely by a correction with no new draft |
| `publishedByUserId`, `publishedAt` | | |
| `correctionReason` | text, nullable | Required whenever this version resulted from a Section 7 correction, not an original publish |
| `unpublishReason` | text, nullable | Required if `status = UNPUBLISHED` |

### `RankResultEntry` — one per submission per version

| Field | Type | Notes |
|---|---|---|
| `id`, `publishedResultVersionId`, `submissionId` | | |
| `rank` | int | Dense ranking — multiple entries can share the same `rank` within one version (Section 3) |
| `displayScore` | float | Normally mirrors `NormalizedScore.finalScore`; may be an explicit override (Section 7) — `isScoreOverridden: Boolean` flags which |
| `isDisqualified` | boolean | Set by a Section 7 correction |

### `SpecialAwardResultEntry`

| Field | Type | Notes |
|---|---|---|
| `id`, `publishedResultVersionId`, `criterionId`, `submissionId` | | |
| `nominationCount` | int | |
| `isShared` | boolean | True if this award was resolved via the tie-share outcome (Section 4) |

### `Prize` (extended)

- Supports multiple linked winning submissions per `rank` when a tie
  produces shared occupants (Section 3) — this is a relationship
  cardinality note, not a new field.

---

## 9. What I'm testing for this module

- Rank computation uses dense ranking, not skip-ranking — verified with
  the exact A > B=C > D fixture from design discussion (B and C both
  get rank 2; D gets rank 3, not 4).
- A three-way tie that survives all three cascade levels (identical
  `finalScore`, identical `averageRawTotal`, identical bonus) results
  in all three sharing one rank and one prize — never an arbitrary
  fourth-level tiebreaker like submission ID or timestamp.
- Special-award winner computation correctly tallies only
  `COMPLETED` judge assignments' nomination flags; a `PENDING`/
  `IN_PROGRESS` assignment's (unset) nomination never counts.
- **Special-award ties resolve via nomination count → `bonusRaw` →
  `finalScore` → share** — verified with a fixture where two
  submissions tie on nomination count but differ on bonus, confirming
  bonus (not `finalScore`) is checked first, the reverse order from the
  rank-prize cascade.
- A `PENDING_REVIEW` or `DISQUALIFIED` (Module 6) submission never
  appears in rank-based or special-award results, even if it somehow
  has a high raw score.
- `EventPhase: RESULTS_ANNOUNCED` alone, with zero `PublishedResultVersion`
  at `status: LIVE`, reveals no result data to any participant-facing
  endpoint.
- `AUTO` publish mode does not fire at `resultsAnnounceAt` if
  `draftStatus` is still `IN_PROGRESS` at that exact moment — confirmed
  via a fixture where the timestamp passes with the draft intentionally
  left unfinished.
- `MANUAL` mode never publishes without an explicit, confirmed action,
  even well after `resultsAnnounceAt` has passed.
- A correction (disqualify, reorder, or score override) always creates
  a new `PublishedResultVersion`, never mutates the previous one in
  place — the prior version remains fully intact and queryable at
  `status: SUPERSEDED`.
- Every correction and every unpublish action rejects an empty reason
  and writes a complete `AuditLog` entry.
- Attempting to trigger a new `NormalizationRun` for an event after
  `resultsAnnounceAt` is still rejected (Module 9, D126) — confirming a
  Section 7 correction never provides a backdoor into re-running
  normalization itself.

---

## 10. Open questions

None blocking. One implementation-detail call made directly rather
than asked back:

1. **`AUTO` publish requiring `draftStatus: READY`** (Section 5.2) — a
   safety gate against auto-publishing an unfinished draft, not
   explicitly requested but consistent with this platform's general
   bias toward requiring an explicit human action over a risky silent
   default.
