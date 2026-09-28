# Frontend Design: Module 10 — Results & Rankings

Status: **Design locked, not yet implemented.**
Backend reference: `stages/10-results-and-rankings.md`.

---

## 1. Screens

1. **Public: Results page.**
2. **Organizer: Draft results.**
3. **Organizer: Publish & correct.**

---

## 2. Public results page

### Structure
Rank-ordered list (dense ranking — shared positions rendered as
genuinely shared rows, e.g. two submission cards visually grouped
under one "2nd" marker, not two separate "2nd" labels that look like a
display bug). Each entry: rank, submission title/team, `finalScore`
(with the **Overachiever** label, per Module 8/9's overflow rule, when
`finalScore` exceeds `finalScoreDisplayScale`). Special-award winners
shown in a separate section below the main ranking, each tagged with
its award name.

A corrected entry (Section 4) is **visibly marked** — a small
"Corrected" tag with the reason available on click/tap — never
presented identically to an original result, matching backend Section
7's explicit requirement.

### States
| State | Behavior |
|---|---|
| `EventPhase: RESULTS_ANNOUNCED`, no `PublishedResultVersion` at `LIVE` | **Reveals nothing** — this is the single most important state in this whole doc, since it's the exact backend guarantee (D101/module map) that phase and visibility are independent. Shows: "Results haven't been published yet." — never partial data, never a countdown implying a specific time (the organizer controls this manually, especially in `MANUAL` publish mode) |
| Published, `LIVE` | Full results as above |
| A shared/tied position | Both/all tied entries rendered together under one shared rank marker, with a small note: "Tied — sharing this position." |
| Disqualified submission | **Absent from the list entirely** — not shown crossed-out or greyed, simply not present, matching backend's "removed entries aren't re-ranked around" rule (also consistent with Module 14's Global Ranking inheriting this same behavior) |

---

## 3. Draft results (organizer)

### Structure
Step one: **select a normalization run** (from Module 9's history,
default pre-selected to most recent, full list with timestamps
visible — matching backend Section 2 exactly). Step two: computed
draft preview (same rank-list visual as the public page, but privately
viewable regardless of publish state). A **Ready** toggle
(`draftStatus`) and a **Publish mode** choice (`AUTO` / `MANUAL`,
plain radio buttons, not a dropdown — this is a consequential enough
choice to deserve visible weight).

### States
| State | Behavior |
|---|---|
| Draft `IN_PROGRESS` | Editable, Ready toggle off |
| Draft marked `READY`, mode `AUTO` | A confirmation banner: "This will publish automatically at {resultsAnnounceAt}." — reassurance that the mechanism is understood, not a black box |
| Draft marked `READY`, mode `MANUAL` | No auto-publish — a visible **Publish now** button becomes available instead |
| `resultsAnnounceAt` passes while draft is still `IN_PROGRESS` (backend D99's safety gate) | Auto-publish does **not** fire — the draft screen shows a banner: "The scheduled announcement time has passed, but this draft isn't marked Ready yet. Publish manually when ready." Never silently auto-publishes an unfinished draft |
| Special-award section of the draft | Ties (backend D140's bonus-before-finalScore cascade) rendered with the same shared-position treatment as rank ties, worded to match: "Tied — sharing this award." |

---

## 4. Publish & correct (organizer)

### Structure
The live/published view, plus three organizer-only actions per entry:
**Disqualify**, **Adjust rank** (a simple up/down control, or drag —
same accessibility requirement as Module 7's drag-and-drop: a
non-drag equivalent must exist), **Override score**. All three route
through the destructive confirmation Modal, reason required — this is,
alongside Module 6's disqualify action, one of the two heaviest real
uses of that pattern in the platform.

### States
| State | Behavior |
|---|---|
| Any correction confirmed | New `PublishedResultVersion` created — the public page (Section 2) updates to show the "Corrected" tag on the affected entry |
| Attempting a correction with empty reason | Confirm button disabled, matching the Modal contract |
| Unpublish clicked | Same destructive pattern, reason required — public page (Section 2) reverts to "Results haven't been published yet" the instant this completes |
| Version history | A simple list of past versions (superseded/unpublished included), each viewable read-only — the audit trail made visible, not just logged invisibly on the backend |

---

## 5. Flow continuity check

- **Into this module:** Module 9's normalization run selection;
  Module 6's disqualification status (a submission already
  disqualified there never appears in the draft at all, consistent
  exclusion carried through).
- **Out of this module:** the public results page feeds directly into
  Module 11's shortlist reveal (the exact moment `PublishedResultVersion`
  goes `LIVE` is what makes the voting shortlist visible, per backend
  D141) and into Module 14's Global Ranking snapshot recompute trigger.
  Both of those hand-offs are worth restating explicitly once those
  docs are written, to confirm the timing described there matches what
  this doc promises.
