# Screen Spec: Events List

Status: **Design locked, not yet implemented.**
This is the frontend equivalent of a backend stage doc — the structure
and interaction model are decided here, in writing, before any
component gets built. If implementation and this doc disagree, update
this doc first, then fix the code.

---

## 1. The actual problem

An `Event` (per `DATA-MODEL.md`) carries a lot more than "name and
status": registration window, event window, submission window,
verification results, judging window, results state, voting window
(potentially across multiple rounds), tracks, prizes, team/participant
counts, judge counts, certificate availability. A flat table with a
handful of columns can show maybe six of these at once — everything
else either gets cut or forces horizontal scrolling, which we already
ruled out for mobile and shouldn't quietly reintroduce for desktop
either.

The real design problem isn't "make a table" — it's **how much of an
event's actual state should be visible without a click, and how does
someone get to the rest without leaving the list.**

---

## 2. Options considered

### A. Wider table, more columns
Add columns for judge count, verification status, voting round, etc.
**Rejected** — this is the same problem restated, just delayed. Past
~6 columns a table stops being scannable and starts being a horizontal
scroll problem again, which defeats the point of the earlier mobile
work.

### B. Master–detail split (list left, full detail panel right)
Common in mail/ticketing tools (Gmail, Linear's issue view). Selecting
a row shows everything about that event in a persistent side panel,
no navigation away from the list.
**Strong option, kept as a possible future enhancement** — but it
assumes a wide viewport (doesn't help mobile at all, would need a
completely different mobile pattern), and for a *list* whose main job
is comparing many events at a glance, permanently sacrificing half the
horizontal space to one event's detail is a real cost. Better suited
to a future "my events" workspace view than the public/general list.

### C. Pure card grid (one rich card per event, no table at all)
Gives room for more per-event detail, but loses the tightest thing a
table is good at: scanning many rows at once to compare. With 12+
events, a full card grid becomes a lot of vertical scrolling to see
what a table shows in one screenful.
**Rejected as the primary view** — but this is exactly what we already
built for the mobile breakpoint, and that's the right call *there*
specifically because there's no room to compare rows side-by-side on a
phone anyway.

### D. Timeline / Gantt-style view
Each event as a horizontal bar positioned on a shared calendar axis,
segmented by phase (registration / submissions / judging / voting).
Genuinely different from every other option — and it's grounded in
something real about this platform specifically: an event's entire
identity *is* a sequence of time windows (`Event` in `DATA-MODEL.md` is
almost entirely timestamp fields). A table hides that; a timeline makes
it the whole point.
**Kept, as a secondary view an organizer can switch to** — not the
default, since most day-to-day use (finding one event, checking its
status) is better served by a scannable list. But for an organizer
running several overlapping events, seeing them laid out on a shared
timeline answers a question a table structurally can't: *"what's
happening at the same time as what?"*

### E. Enhanced table: compact phase visualization + expandable rows
Keep the table as the primary view (it's still the right tool for
scanning many events), but replace the plain text status badge with a
**compact, segmented phase-progress indicator** that shows where the
event sits across its *whole* lifecycle in one small glance — and let
a row expand in place to reveal the secondary detail (tracks, prizes,
counts) without navigating away.

**This is the one we're building.** It doesn't throw away the table's
strength (scanning many events fast), and it solves the actual stated
problem (too much to show) by using disclosure — summary always
visible, detail available on demand — rather than either cramming
everything in or hiding it behind a full page navigation.

---

## 3. Chosen structure

### 3.1 Stat strip (new — wasn't in the earlier draft)

A single-row strip above the toolbar, four numbers, no chart:

```
[ 12 events ]   [ 3 live now ]   [ 214 total submissions ]   [ 2 ending this week ]
```

Purpose: answers "what's going on right now" before someone even starts
scanning the list — a genuinely useful glance, not decoration. Numbers
only, small label beneath each, no icons/gradients/card chrome around
them — four numbers and four labels in a row, nothing else.

### 3.2 Toolbar

Same search + status filter + sort as before, plus two new controls
specifically answering "too many things to show":

- **View toggle**: `List` / `Timeline` — switches between the table
  (3.3) and the Gantt-style view (3.5). `List` is the default.
- **Density toggle**: `Comfortable` / `Compact` — comfortable is
  today's row height; compact tightens padding for someone who wants
  to see more events without scrolling. Standard pattern (Airtable,
  Notion databases, most enterprise data tools) — not novel, but
  directly useful for "too many things," so it earns its place.

Column visibility control (letting someone hide, say, the Track column
if they don't care about it) is a reasonable future addition but is
**not** in this version — the phase-progress indicator (3.4) already
absorbs most of what would have needed extra columns, which reduces
how urgent a column-picker actually is. Revisit only if real usage
shows people still want it.

### 3.3 Table (primary/default view)

Columns: **Event · Phase · Tracks/Prizes · Activity · Ends**

- **Event** — name + slug, unchanged from before.
- **Phase** — replaces the old status badge. See 3.4.
- **Tracks/Prizes** — collapses two old ideas into one cell:
  `3 tracks · 5 prizes` as plain text, no separate columns for
  something this secondary.
- **Activity** — collapses submission count, participant count, and
  judge count into one compact cluster:
  `86 submissions · 42 teams · 6 judges` — small text, one line,
  truncating gracefully if the row is narrow (compact density mode
  or a smaller viewport).
- **Ends** — the single most useful date (whichever window is
  currently active — registration close while open, judging deadline
  while judging, etc.) rather than a static "event end date" that
  stops being the relevant number once the event's moved past that
  phase.

**Row expansion**: clicking anywhere on a row *other than* the "View"
link expands it in place (chevron rotates, content slides open below
the row, existing rows shift down — no modal, no navigation). Expanded
content shows:
- Full timeline as a compact horizontal list: Registration, Event
  window, Submissions, Judging, Results, Voting — each with its actual
  date range, the current one visually emphasized.
- Verification breakdown if applicable: `78 approved · 5 pending
  review · 3 disqualified` (Module 6 data).
- A "View full event" link, same destination as the old "View" link.

This is the actual mechanism that resolves "too many things to show":
**everything has a place, but only the summary is visible by default.**

### 3.4 Phase-progress indicator (the core new idea)

A small horizontal segmented bar, six segments, each corresponding to
a macro-stage grouped from the real `EventPhase` enum
(`DATA-MODEL.md`/`03-event-management.md`):

```
Registration → Building → Submissions → Judging → Results → Voting
```

(`REGISTRATION_OPEN`/`REGISTRATION_CLOSED` → *Registration*;
`IN_PROGRESS` → *Building*; `SUBMISSIONS_OPEN`/`SUBMISSIONS_CLOSED` →
*Submissions*; `JUDGING`/`JUDGING_CLOSED` → *Judging*;
`RESULTS_ANNOUNCED` → *Results*; `VOTING_OPEN`/`VOTING_CLOSED`/
`VOTING_WINNER_ANNOUNCED` → *Voting*.)

Segments already passed: filled, muted color. Current segment: filled,
accent color, subtle pulse (reusing the "live" treatment from the
earlier pass — informative, not decorative, since it's genuinely
signaling "this is where things stand right now"). Segments not yet
reached: outline only, no fill.

A small text label sits to the right of the bar (`Judging`) so the
information isn't color-only — this is an accessibility requirement,
not a nice-to-have (color-blind users, and anyone on a low-contrast
screen, need the text).

**Why this over a plain badge:** a badge says one word. This says one
word *and* shows exactly how far through the full lifecycle the event
is, at a glance, across a whole table of events — which is precisely
the kind of information density the "too many things to show" problem
is asking for, delivered in less horizontal space than the old badge
took, not more.

### 3.5 Timeline view (secondary, toggled)

Shared horizontal date axis at the top. Each event is one row: a
thin track showing its full span (registration open → voting winner
announced), with the same six-segment coloring as 3.4 but drawn to
actual scale against the date axis instead of as a fixed-width strip.
Today's date is a vertical marker line crossing all rows.

This view is genuinely most useful to an organizer running several
events with overlapping windows — it answers "what's competing for
attention right now" in a way a list fundamentally can't. Row click
behavior matches the table (opens detail), no separate interaction
model to learn.

### 3.6 Mobile

The existing card-based mobile layout (already built) gets one
addition: the phase-progress bar (3.4) replaces the plain status badge
on each card, same visual treatment, full width. Row expansion doesn't
apply on mobile — cards already show more than a table row did, so
there's less need for a second disclosure level; tapping a card goes
straight to the full event page, same as the existing "View" link
behavior.

---

## 4. Component inventory (for whoever builds this)

- `StatStrip` — four-number summary row (3.1)
- `EventsToolbar` — search, status filter, sort, view toggle, density
  toggle (3.2)
- `PhaseProgressBar` — the six-segment indicator (3.4), used in both
  the table row, the expanded-row detail, the mobile card, and the
  timeline view (3.5) — **one component, four contexts**, not four
  separate implementations that could drift apart (same principle
  `CLAUDE.md` already states for markdown rendering — one shared
  implementation, used everywhere it's needed).
- `EventRow` — collapsed table row (3.3)
- `EventRowExpanded` — the detail panel that slides open (3.3)
- `EventCard` — existing mobile component, updated to use
  `PhaseProgressBar`
- `EventsTimelineView` — the alternate view (3.5)

## 5. Data this needs from the backend

Everything here is derivable from existing modules — nothing new
required on the backend side:
- `Event` timeline fields + computed `EventPhase` — Module 3
- Track/Prize counts — Module 3
- Submission/team/judge counts — Modules 4, 5, 7
- Verification breakdown (approved/pending/disqualified) — Module 6
- The "ends" date shown per row is **computed client-side or via a
  small API aggregation**, not a new stored field — it's just "whichever
  timeline boundary is next, given the current phase."

## 6. Open questions

None blocking for a first build. Two things worth revisiting once this
is actually in front of real users rather than decided in the abstract:

1. Whether column visibility control (mentioned and deliberately
   deferred in 3.2) turns out to be needed once people have used the
   phase-progress + expandable-row combination for a while.
2. Whether the timeline view (3.5) should become the default for
   organizer-facing contexts specifically (an organizer managing many
   events) while staying secondary for a general/public events list —
   currently it's secondary everywhere, which may be under-serving the
   organizer use case specifically.
