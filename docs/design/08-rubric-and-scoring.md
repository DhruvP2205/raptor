# Frontend Design: Module 8 — Rubric & Scoring

Status: **Design locked, not yet implemented.**
Backend reference: `stages/08-rubric-and-scoring.md`. Flagged in the
module map as the highest-complexity screen in the platform — the
judge scoring interface carries the most business logic of anything in
this design pass (0–100 inputs, bonus tracks, special-award
nominations, mandatory feedback, unlimited resubmission, a real
deadline).

---

## 1. Screens

1. **Organizer: Rubric builder** — defines `SCORING`/`BONUS`/
   `SPECIAL_AWARD` criteria at event setup.
2. **Organizer: Judging progress dashboard.**
3. **Judge: Scoring interface.**

---

## 2. Rubric builder (organizer)

### Structure
Three sections, one per criterion kind, each an editable list with an
"Add criterion" action:

- **Scoring criteria** — label, guidance text (`Textarea`), weight
  (number input, %). **A live running total is shown at all times**
  ("Total: 85% — add 15% more") — this is the single most important
  piece of real-time feedback this form needs, since the backend
  rejects anything that doesn't sum to exactly 100.
- **Bonus tracks** — label, guidance text, max points. A running sum is
  also shown here, but framed differently: "Bonus tracks total: 24
  points" with a warning treatment (not an error — this is backend
  D84's soft guardrail) once it crosses the configured threshold (20
  by default): an inline amber note, not a blocking one, plus the
  confirmation Modal described below only firing at actual save time.
- **Special award criteria** — label, guidance text only (no
  weight/points field at all — visually distinct from the other two
  sections specifically so it's clear these work differently).

### States
| State | Behavior |
|---|---|
| Scoring weights don't sum to 100 | Save button disabled, running total shown in `status-danger` color once total is set and wrong — not just at submit time |
| Bonus total exceeds guardrail threshold, attempting save | Standard Modal: "Bonus tracks total 24 points — this may let bonus outweigh project quality more than recommended. Publish anyway?" — Cancel or Confirm, matching backend D84's audit-logged override exactly |
| Removing a criterion that already has scores against it (event already published, judging underway) | **Blocked, not just discouraged** — removing a scoring criterion mid-judging would silently invalidate every already-submitted score's weighting. Inline message: "Can't remove — judging has already started for this event." |
| Save success | Toast: "Rubric saved." |

---

## 3. Judging progress dashboard (organizer)

### Structure
Per-judge rows: name, assignment counts (`total / completed /
in-progress / not-started`), a small horizontal stacked bar
visualizing the same split. Sorted least-complete-first — surfaces who
needs a nudge.

### States
Straightforward — loading skeleton, standard error block, and one
specific rule: **counts must always reflect live data, no caching
layer that could drift** (backend explicitly requires this — restating
it here since a naive implementation might reach for a cached/
memoized count for performance and silently violate it).

---

## 4. Scoring interface (judge)

This is the core screen. One submission at a time, reached from Module
7's assignment list.

### Structure
Read-only submission content at the top (title, description, links —
same rendering as the public detail page, Module 5, since a judge
should see exactly what everyone else sees, not a special view).

Below: the rubric, laid out in the same three sections as the builder
(2), but as **inputs**, not editable definitions:

- **Scoring criteria**: each a 0–100 numeric input (backend D81/D118)
  **with a slider alongside it, not instead of it** — a slider alone
  is imprecise for a 0–100 range; a bare number input alone loses the
  at-a-glance sense of where a score sits. Both, kept in sync. An
  optional per-criterion note field below each.
- **Bonus tracks**: 0–`maxPoints` input per track, clearly visually
  lighter-weight than scoring criteria (smaller, in a muted section) —
  reinforces that these are optional, never required to submit.
- **Special award criteria**: a toggle (not a number) per award —
  "Nominate for {award name}."
- **Overall feedback**: `Textarea`, required (backend confirmed
  mandatory) to complete a review.

Two actions: **Save draft** (secondary, no validation) and **Submit
review** (primary → standard confirmation Modal).

### States
| State | Behavior |
|---|---|
| Draft, partial | Save draft always available, no validation blocking it — a judge should be able to save an incomplete pass and come back |
| Submit clicked, a required scoring criterion is empty | Inline errors, scroll/focus to first — confirmation modal never opens on an invalid form |
| Submit clicked, valid | Confirmation Modal: "Submit this review? You can still make changes until judging closes on {date}." — sets the accurate expectation that this isn't the last word, matching backend's unlimited-resubmit design exactly |
| Submitted (`status: COMPLETED`) | **Interface stays fully editable** — this is a deliberate departure from Module 5's submission-form pattern (which locks and needs an explicit Unsubmit). Here, per backend D73, a completed review is directly re-submittable with no unlock step. The only visual change: a small persistent note, "Last submitted {time ago}," and the primary button relabels to "Update review" instead of "Submit review" |
| Every resubmit | Same confirmation Modal, worded identically each time — no escalating language on the 2nd/3rd resubmit |
| `judgingClosesAt` has passed | **Entire interface becomes read-only** — no Save draft, no Submit/Update, a banner: "Judging closed on {date}. Your last submitted review is shown below." This is a hard, server-enforced deadline (backend, tested at the exact boundary) — the frontend's read-only state is a courtesy reflecting that reality, not the actual enforcement mechanism (the API rejects the write regardless of what the UI shows) |
| Assignment already `TRANSFERRED` away from this judge (no-show handling, Module 7) mid-session | If a judge somehow still has this screen open after being transferred off an assignment, any further save/submit attempt is rejected by the backend — the frontend shows: "This assignment is no longer yours." and redirects to Module 7's list. Rare, but a real possible race, worth specifying rather than leaving as an unhandled edge case |
| Special-award nomination toggle, event has zero `SPECIAL_AWARD` criteria configured | That whole section is simply absent from the form — not shown empty | 

---

## 5. Flow continuity check

- **Into this module:** organizer reaches the rubric builder from event
  create/edit (Module 3, "Bonus tracks & special awards" section
  actually already referenced there — this doc is the detailed version
  of what that section opens into). Judges reach scoring from Module
  7's assigned-projects list.
- **Out of this module:** completed scores feed Module 9
  (Normalization) — nothing in this UI triggers that directly (it's a
  separate organizer action), but it's the direct downstream consumer
  of everything scored here.
