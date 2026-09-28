# Frontend Design: Module 7 — Judge Assignment

Status: **Design locked, not yet implemented.**
Backend reference: `stages/07-judge-assignment.md`.

---

## 1. Screens

1. **Organizer: Assignment board** — manual + algorithmic assignment.
2. **Judge: "My assigned projects"** — a judge's own worklist.

---

## 2. Assignment board (organizer)

### Structure
Two-pane layout: left, the list of `APPROVED` submissions (Module 6
gate — a non-approved submission never appears here at all, matching
that module's structural exclusion, not a filter someone could
accidentally clear); right, the list of `ACCEPTED` judges (Module 2
gate, same logic) with their current assignment count against
`maxProjectsPerJudge`.

**Auto-assign** is a toolbar action opening a standard Modal: reviews-
per-project number input, strategy checkboxes (**By track** / **Random**
— By track only shown/enabled if the event has tracks configured,
matching backend's conditional logic exactly), confirm button runs the
algorithm.

**Manual assignment**: drag-and-drop a judge onto a submission, or (for
accessibility — drag-and-drop must always have a non-drag equivalent) a
plain "Assign judge" button on each submission row opening a judge
picker.

### States
| State | Behavior |
|---|---|
| No approved submissions yet | Empty state, points back to Module 6: "No approved submissions yet — check the verification queue." |
| No accepted judges yet | Empty state, points back to Module 2: "No judges have accepted an invitation yet." |
| Manual assign — target judge at `maxProjectsPerJudge` | Rejected inline, not silently allowed: "This judge is at their limit (5/5)." + a secondary action "Raise this judge's limit" (sets `projectLimitOverride`) — surfacing the backend's real override path rather than just blocking with no way forward |
| Auto-assign running | Modal shows a loading state, board behind it is inert until it resolves (this is a bulk, structural change to the board — treating it as a blocking action is the right call here, unlike Module 6's background verification jobs, since auto-assign is fast and its result needs to be seen before doing anything else) |
| Auto-assign complete | Modal closes, board updates, toast: "42 assignments created." |
| Transfer (no-show handling) | On a judge's row, a "Transfer incomplete assignments" action — opens a destructive-style Modal (not because transferring is dangerous to data, but because it requires the mandatory reliability-note reason per backend Section 5) — reason field feeds directly into the judge's permanent, cross-event `JudgeReliabilityNote` (backend D68), so the modal's consequence line says exactly that: "This note will be visible to any organizer considering this judge for a future event." |
| Attempt to transfer a `COMPLETED` assignment | Not offered at all — the transfer action is simply absent on any row where a score's already been submitted, matching backend D69's unconditional lock |

---

## 3. My assigned projects (judge)

### Structure
A simple list — project title, track, a status indicator (`Not
started` / `In progress` / `Completed`, mapped to `neutral`/`live`/
`success` Badges), each linking into Module 8's scoring interface.

### States
| State | Behavior |
|---|---|
| No assignments yet | "You haven't been assigned any projects yet." — no action to take, this is entirely organizer-driven |
| Assignments present | List as above, sorted not-started-first (surfaces what needs attention) |
| An assignment's submission gets disqualified after assignment (rare edge case) | Row shows a `neutral` badge "No longer eligible" instead of the normal status — the judge should know why a project vanished from their expected workload rather than silently losing it with no trace |

---

## 4. Flow continuity check

- **Into this module:** approved submissions from Module 6; accepted
  judges from Module 2's invitation flow.
- **Out of this module:** every assignment row/list item leads into
  Module 8's scoring interface — the single most important hand-off in
  the whole judging pipeline, noted here explicitly since Module 8 is
  next and needs to open exactly where this leaves off.
