# Frontend Design: Module 9 — Normalization

Status: **Design locked, not yet implemented.**
Backend reference: `stages/09-normalization.md`. Organizer/admin-only,
confirmed in the module map — no participant or judge-facing surface.

---

## 1. Screen

**Organizer/admin: Run & compare normalization.**

### Structure
A **Run normalization** button (primary), enabled only within the
backend's valid window (`judgingClosesAt <= now() < resultsAnnounceAt`)
— outside that window it's **absent, not disabled**, with a line
explaining the current state: before the window, "Judging hasn't
closed yet"; after, "Normalization is locked — results have been
announced" (matching backend D89's unconditional, no-exception lock).

Below: a **run history list** — every prior `NormalizationRun` for this
event, each showing its timestamp and a **preview link**. Selecting a
run shows a side-by-side table: raw `averageRawTotal` vs. normalized
`finalScore` per submission, plus the rank movement between the two —
directly satisfying the brief's own Normalization Proof bonus
requirement ("show the raw scores, the normalized scores, and the
ranking change").

A per-judge panel shows calibration data (mean, stddev, sample count —
both the live platform-wide figure and this specific run's frozen
snapshot, backend D90) with a flag icon on any judge marked
`uniformScoringFlagged`.

### States
| State | Behavior |
|---|---|
| Before `judgingClosesAt` | Run button absent, explanatory line shown |
| Valid window | Run button available |
| Running | Button loading state — this computation is fast (pure math over already-collected scores, no external API calls unlike Module 6), so a simple inline spinner is honest, no need for a background-job pattern here |
| Run complete | New entry appears at the top of the run history, auto-selected, results table populates |
| No prior runs yet | Empty state before the first run: "No normalization runs yet." + the Run button |
| A judge below minimum-N (backend D87, event-baseline fallback used) | That judge's row in the calibration panel shows a small note: "Using event baseline — not enough scoring history yet" instead of their (statistically meaningless) personal figures |
| After `resultsAnnounceAt` (locked) | Run button gone, but **run history and comparison views remain fully viewable** — the lock is on creating new runs, never on reviewing what already happened |
| Attempting to view a run whose event has zero completed judge assignments (degenerate case) | "No completed reviews to normalize yet." — same empty-state pattern, different cause named specifically |

---

## 2. Flow continuity check

- **Into this module:** organizer's event management area, alongside
  Module 6's verification queue and Module 7's assignment board — all
  three are judging-pipeline organizer tools living in the same area
  of the event's admin section.
- **Out of this module:** the selected/most-recent run feeds directly
  into Module 10's "select the official run" step — that hand-off is
  the entire reason this screen exists, and Module 10's doc opens
  exactly there.
