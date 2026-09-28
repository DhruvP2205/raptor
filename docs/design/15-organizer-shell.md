# Frontend Design: Module 15 — Organizer Admin Shell

Status: **Design locked, not yet implemented.**
This is the connective tissue seven existing module docs (02, 06, 07,
08, 09, 10, 11, 12) already assumed existed and referenced by name
without ever specifying — flagged as Finding 2 in `design-review-
audit.md`. This doc closes that gap. It does not redesign any of
those eight tools' actual content; it defines the shell they all live
inside, plus one genuinely new screen (Overview) that didn't exist in
any of them.

References `DESIGN-SYSTEM.md` throughout. No new backend capability
required — this is purely a navigation/aggregation layer over data
every referenced module already exposes.

---

## 1. Scope

1. **The shell itself** — persistent nav, event switcher, admin-bypass
   banner, entry/exit points.
2. **Overview** — a new dashboard, aggregating status from all ten
   tools into one landing page.
3. **Mobile structure** — full responsive treatment, same rigor as the
   public events list.
4. **A flagged follow-up**, not fully executed here: several of the
   eight existing tool docs have dense tables (Verification queue,
   Assignment board, Results list, Voting shortlist) that were
   designed before "full mobile card treatment" was confirmed as this
   shell's bar. Section 7 names exactly which docs need that retrofit
   pass, rather than silently assuming they already have it.

---

## 2. Desktop structure

```
┌─────────────────────────────────────────────────┐
│ [Raptor mark]  Signal Season ▾   [Judging]        │  ← shell header
├──────────────┬────────────────────────────────────┤
│ Overview      │                                    │
│ Settings       │                                    │
│ Tracks & prizes │                                    │
│ Judges           │                                    │
│ Rubric            │        (selected tool renders      │
│ Submissions         │         here)                      │
│ Verification          │                                    │
│ Assignment               │                                    │
│ Progress                    │                                    │
│ Normalization                  │                                    │
│ Results                            │                                    │
│ Voting                                │                                    │
│ Certificates                              │                                    │
└──────────────┴────────────────────────────────────┘
```

**Flat list, confirmed** — no section headers/grouping. Order still
follows the pipeline sequence (setup-shaped items first, wrap-up-shaped
items last), since that's still the natural order an organizer
encounters these tools in over the life of an event, even without a
visual divider announcing it.

**13 items, not 10 — corrected post-audit (D164, D165).** The original
draft of this doc undercounted the sidebar: it omitted **Settings**
(the event edit form — name/description/timeline/poster/publish/
archive/delete — which the new Overview page displaces from the
`/manage` landing route and needs its own slot) and **Tracks &
prizes** (Module 3) entirely, and its "Submissions" card conflated
Module 5's finalized-submissions list with Module 6's verification
queue, which are two separate existing pages with different data.
Both gaps were caught before implementation and confirmed explicitly
rather than guessed: **Settings and Tracks & prizes get their own
sidebar items** (setup-shaped, placed right after Overview), and
**Submissions (Module 5) and Verification (Module 6) stay as two
distinct items**, matching the interim `ManageNav` component that was
already stitching these pages together ad hoc — exactly the
un-designed connective tissue this doc exists to replace.

**Shell header, three elements:**
- Event name + a **▾ event switcher** — click to open a small dropdown
  listing every other event this organizer has access to, so they can
  jump without leaving the shell or returning to the public events
  list first.
- Current **phase badge** — reuses the exact `PhaseProgressBar`/badge
  component already built for the public events list, same visual
  language, so an organizer sees the same phase indicator here as
  everywhere else on the platform.
- A plain **"View public page"** link, always present — the one
  guaranteed way back to the event's actual public detail page,
  distinct from the sidebar's "Overview" (which is this shell's own
  landing page, not the public one).

**Admin-bypass banner** — appears only when the current viewer is a
`siteAdmin` accessing an event they don't hold an `ORGANIZER`
membership on. Full-width, `status-danger`-adjacent but not alarming
(this is a legitimate, expected capability, not an error) — amber
background, not red: **"You're viewing this as a site admin, not as an
organizer of this event. This is logged."** Present on every screen in
the shell for the duration of that session, not just on entry — an
admin scrolling through several tools should never lose track of the
fact that every action here is being audited under D62's bypass rule.

---

## 3. Overview (new)

### Structure

A grid of status cards, one per tool, each showing that tool's single
most relevant number/state and linking directly into it. Not a generic
dashboard — every card's content is intentionally specific:

| Card | Shows |
|---|---|
| Tracks & prizes | "3 tracks · 2 prizes" or "Not configured yet" |
| Judges | "6 accepted · 1 pending · 0 declined" |
| Rubric | "4 scoring criteria · 2 bonus tracks" or "Not configured yet" |
| Submissions | "42 finalized" or "None yet" — Module 5's plain count, distinct from Verification's decision breakdown below |
| Verification | "78 approved · 5 pending review · 3 disqualified" — `status-live` styling if any are pending, since that's the one state actually asking for attention |
| Assignment | "86/86 submissions assigned · 3 reviews each" or "12 unassigned" (flagged if non-zero) |
| Progress | "68% complete · 4 judges not started" — links to Module 8's progress dashboard |
| Normalization | "Last run 2 hours ago" or "Not yet run — judging still open" |
| Results | "Draft in progress" / "Published" / "Not started" |
| Voting | "Round 1 open · closes in 2 days" or "Not started" |
| Certificates | "Enabled — 42 issued" or "Not enabled yet" |

**Settings has no Overview card.** Unlike the other twelve tools, it
isn't a pipeline stage with a status to summarize — the one thing worth
surfacing from it (published vs. draft) is already the phase badge in
the shell header. Giving it a card would mean inventing filler content
against this doc's own explicit "never a filler message" rule below.

**A "Next recommended action" banner** sits above the card grid,
computed from the event's current phase — not a separate manual
config, just a read of the same phase data already driving the badge
in the header:

- Phase `JUDGING_CLOSED`, no normalization run yet → *"Judging has
  closed. Run normalization to start building results."* → links to
  Normalization.
- Phase `RESULTS_ANNOUNCED` reached but no `PublishedResultVersion` at
  `LIVE` → *"Results are drafted but not published yet."* → links to
  Results.
- No pending action for the current phase → banner simply doesn't
  render — never a filler "everything's fine!" message with nothing
  useful in it.

### States

| State | Behavior |
|---|---|
| Loading | Skeleton grid, same shimmer pattern as every other module's loading state |
| A tool has never been touched (e.g. Rubric never configured) | Its card shows a neutral "Not configured yet" state, not an error — many of these are genuinely optional-until-needed |
| One tool's status fails to load | That single card shows an inline "Couldn't load" with its own retry — never blocks the rest of the grid, same independent-failure principle as the events-list stat strip |

---

## 4. Mobile structure

**Full responsive redesign, confirmed — same rigor as the public
events list, not a lighter pass.**

- **Sidebar collapses to a hamburger drawer**, same slide-open pattern
  and icon-swap animation already built for the public nav.
- **Shell header** stays visible (event name, phase badge, event
  switcher) — these fit in the mobile header bar the same way the
  public nav's brand mark does; only the 10-item tool list moves into
  the drawer.
- **Overview's card grid** stacks to a single column — no new pattern
  needed, this is the same responsive grid behavior already used for
  the public stat strip.
- **Admin-bypass banner** stays full-width and visible on mobile,
  never collapsed or hidden to save space — this is exactly the kind
  of thing that shouldn't get sacrificed for screen real estate.

---

## 5. Entry and exit

- **Entry**: from the public event detail page (Module 3), an
  organizer or admin sees a **"Manage event"** button, visually
  distinct from participant-facing actions (registration, submission
  links) — clicking it enters this shell at Overview.
- **Exit**: the shell header's "View public page" link (Section 2) is
  the primary way back. The event switcher is a lateral move (into a
  *different* event's shell), not an exit.

---

## 6. What I'm testing for this module

- The admin-bypass banner appears for a `siteAdmin` viewing an event
  they don't organize, and does **not** appear for that same event's
  actual organizer, nor for an admin viewing an event they *do*
  organize (bypass banner reflects the bypass specifically, not just
  "is this an admin").
- Every sidebar item is reachable regardless of the event's current
  phase — none are hidden or disabled by phase, confirming the
  "always reachable, let the screen show its own empty state"
  principle carries through into this shell correctly.
- Overview's "next recommended action" banner correctly disappears
  when there's nothing phase-appropriate to recommend, rather than
  always showing something.
- The event switcher only lists events the current viewer actually
  has `ORGANIZER` membership on (or, for a `siteAdmin`, every event —
  consistent with the bypass already being logged when they select
  one they don't organize).
- One card's failed load on Overview doesn't block the rest of the
  grid from rendering.
- On mobile, the hamburger drawer contains the full flat 13-item list
  (Section 2), correctly ordered, with no items silently dropped.

---

## 7. Follow-up required — mobile retrofit on existing tool docs

**Confirmed bar for this shell: full card-based mobile treatment,
same as the public events list.** The following existing module docs
were written before that bar was set this explicitly and describe
dense tables without specifying a mobile-card equivalent. Each needs a
short addendum (not a rewrite) adding that treatment, the same way
the events list itself went through a dedicated responsive pass after
its first version:

- `06-submission-verification.md` — the verification queue table
- `07-judge-assignment.md` — the assignment board's two-pane layout
  (genuinely the hardest of these to adapt — a drag-and-drop-capable
  two-pane view has no obvious single-column mobile equivalent, and
  deserves its own short design pass rather than a quick patch)
- `10-results-and-rankings.md` — the results/draft list
- `11-voting.md` — the shortlist curation list

Not flagged (already row-based/simple enough to degrade reasonably, or
already explicitly designed with mobile in mind): `02` (judge
dashboard — small table), `08` (progress dashboard — already a simple
per-judge list), `09` (normalization comparison — a power-user table
that's acceptable to scroll horizontally on the rare occasion someone
checks it from a phone, consistent with the "internal tooling" framing
this whole shell already carries in spirit even though its own bar
ended up being the full treatment), `12` (certificate template upload
— a single form, not a table).

---

## 8. Open questions

None blocking. Section 7's list is the one real piece of follow-up
work this doc creates rather than resolves — recommend tackling
`07-judge-assignment.md`'s mobile pass first, since it's the one
without an obvious answer, before the other three (which are
straightforward table→card conversions matching the already-proven
pattern).
