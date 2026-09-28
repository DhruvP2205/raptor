# Frontend Design: Module 14 — Global Ranking

Status: **Design locked, not yet implemented.**
Backend reference: `stages/14-global-ranking.md`. Fully public,
confirmed in the module map — modeled on the real reference site
inspected during backend design (`rank.raptors.dev`).

---

## 1. Screens

1. **Public: Leaderboard.**
2. **Public: Person drill-down** (also serves as the general user
   profile shell — picking up Module 12's flagged note that
   certificate gallery and ranking drill-down should share one
   profile page rather than being separate routes).

---

## 2. Leaderboard

### Structure
Paginated table: rank (dense ranking, shared positions rendered the
same way as Module 10's results page — reused pattern, not
reinvented), person name/`Avatar`, points, a compact breakdown
(firsts/seconds/thirds as small counts, not full sentences), events
count. Row click → Section 3.

Toolbar: search by name, no filters beyond that (the reference site's
own toolbar is minimal — matching it rather than over-building).

### States
| State | Behavior |
|---|---|
| Loading | Skeleton rows, matching the events-list loading pattern exactly (same component, different data shape) |
| Loaded | Table as above, served from the current `GlobalRankingSnapshot` (never computed live — worth restating here since it directly affects what "loading" even means: this is loading a **cached, paginated** snapshot, backend D159, not running a cross-event aggregate on request) |
| No snapshot exists yet (fresh instance, zero published results anywhere) | Empty state: "No results yet — check back once events start publishing." |
| Search — no matches | Standard empty-with-clear-filters pattern, reused from the events list |
| Pagination | Same states as the events list doc (loading next page, failure, last page) — identical pattern, not re-specified |
| A genuinely tied position (all tiebreak levels exhausted, backend D153) | Shared rank marker, same visual treatment as Module 10's tied results |

---

## 3. Person drill-down / profile

### Structure
Header: `Avatar` (large), name, summary stats (points, events,
firsts/seconds/thirds) — same numbers as the leaderboard row, just
expanded. Below: the award-by-award breakdown (every
`GlobalRankingAwardDetail` entry — event, project, placement, points),
and — per Module 12's note — the person's **certificate gallery**
embedded on this same page rather than a separate route, since both
are "public facts about this person" and a visitor arriving from one
context (the leaderboard) shouldn't need to know a different URL
pattern exists for the other.

### States
| State | Behavior |
|---|---|
| Loaded | Award list + certificate gallery both shown |
| Person has ranking data but zero certificates (or vice versa) | Each section handles its own empty state independently — "No certificates yet" doesn't block the award list from rendering, and vice versa |
| Person not found (bad ID in URL) | Plain 404 |
| Person has zero global-ranking data at all (never won anything, but does have an account/certificates) | Profile still renders — award section shows "No awards yet" rather than the whole page failing; this is a real, normal state for the majority of platform users, not an edge case to treat as broken |

---

## 4. Flow continuity check

- **Into this module:** entries populate once Module 10/11 results
  publish (backend D159's recompute trigger); certificate data via
  Module 12.
- **This closes the full module sequence** — every module from 1
  through 14 now has a design doc, and every "flow continuity check"
  section across all fourteen either confirms a hand-off already
  promised by an earlier doc, or flags one for a later doc to pick up.
  The full-platform flow trace (next deliverable) verifies none of
  those flagged hand-offs were dropped.
