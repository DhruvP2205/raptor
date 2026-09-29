# Frontend Design: Home Page

Status: **Design locked.** The one page in `FRONTEND-MEGA-DOC.md`'s
34-page site map that previously had only a three-line summary
(Part 4.1) rather than a real spec. This document is that spec.
References `FRONTEND-MEGA-DOC.md` Parts 1–2 for tokens and components
throughout — nothing here redefines a color, font, or component
already defined there.

**What this supersedes:** eight prior visual explorations. Two of
them introduced things explicitly ruled out elsewhere in this
project and are not part of this spec: a navy/indigo/fuchsia gradient
hero (ruled out — no purple/violet family anywhere, per the mega
doc's color correction), and a glass-panel/blur nav treatment
(dropped for the same reason — it was built on top of the same
gradient background this spec doesn't use). What survives from that
exploration: real event data in place of placeholder content, the
category-tag pattern, and the scroll-reveal animation treatment —
all kept because they held up on their own merits, independent of
the visual direction they were originally built alongside.

---

## 1. Why this page looks the way it does

Two decisions made earlier in this project apply directly here, and
this page is the clearest single expression of both:

1. **Direct, not promotional.** No hero pitch, no marketing copy, no
   "Book a demo" framing. This is the screen someone who already
   knows what Raptor is lands on to see what's happening — closer to
   a dashboard than a landing page.
2. **Real content over placeholder content.** Every example on this
   page uses genuine event names, real category labels, and real
   platform stats rather than invented filler — established during
   the exploration phase and kept here.

---

## 2. Structure, top to bottom

### 2.1 Nav

Standard public **Nav** component (mega doc Part 2). Plain white
background, `gray-200` border, no transparency or blur effect of any
kind — this is a deliberate, stated rejection of the glass-nav
exploration, not an oversight.

### 2.2 Stat strip

**Stat strip** component, count-up animation on scroll-into-view.
Four numbers: events run, projects submitted, participants,
countries. Real platform totals, not per-event numbers.

### 2.3 Category filter

A row of filter pills above the event grids — event type plus topic
category (e.g. "Hackathon" / "AI & ML" / "Social Impact"). Functional
filtering, not decoration; clicking one filters both grids below it.

### 2.4 Upcoming events

Horizontal-scrolling row of event cards, **Table→Card** component
pattern applied at card-grid scale rather than table scale (there's
no tabular data here, just cards, but the same "genuine restructuring,
not a scroll-bar-only fix" principle governs the mobile behavior —
see Section 3). Each card: **Phase progress bar** in place of a plain
status badge, event name, dates, category tags.

### 2.5 Recent events

Same card pattern as 2.4, grid instead of horizontal scroll, includes
concluded/archived events with their final submission counts.

### 2.6 Global Ranking teaser

A compact preview of the top of the Global Ranking leaderboard (3–5
rows), linking to the full `/leaderboard` page. Reuses the dense-rank
display from that page directly — a shared row that happens to be
tied renders exactly as it would on the full leaderboard, not a
simplified version that drops the tie.

### 2.7 Footer

Plain, minimal — platform name, a few links. No newsletter signup, no
social-icon row with no real destinations behind it.

---

## 3. Responsive behavior

- **Stat strip**: 4-across desktop, wraps to 2×2 on mobile.
- **Category pills**: wrap to multiple rows on narrow screens, never
  horizontally scroll off-screen with no indication more exist.
- **Upcoming events row**: horizontal scroll is the *intended* desktop
  behavior here (not a mobile fallback) since it's a curated,
  ordered list rather than tabular data — this is the one place on
  this page horizontal scroll is correct, precisely because it's not
  standing in for a table.
- **Recent events grid**: 3 columns desktop → 2 → 1, standard
  responsive grid, no special mobile card conversion needed since it
  was never a table to begin with.
- **Global Ranking teaser**: identical row component to the full
  leaderboard page, so whatever that page's mobile behavior is,
  this teaser inherits automatically — no separate mobile spec
  needed here.

---

## 4. States

| State | Behavior |
|---|---|
| Loading | Skeleton stat strip, skeleton cards in both event sections |
| No upcoming events | Section header stays, replaced by a plain "No upcoming events right now." — never hidden entirely, since an empty section is still real information |
| No recent events (fresh instance) | Same treatment — this is a genuine first-run state on a brand-new self-hosted instance, not an error |
| Global Ranking has no data yet | Teaser section hidden entirely rather than showing an empty leaderboard preview — a leaderboard with nothing on it isn't worth a section of its own the way an empty events list is |
| Any section's data fails to load | That section shows its own inline error + retry; the rest of the page is unaffected — same independent-failure principle as everywhere else in this platform |

---

## 5. What this page deliberately does not have

- No hero image, gradient background, or illustration of any kind.
- No auto-playing video.
- No newsletter signup or generic social-icon row.
- No organizer-specific framing anywhere on this page — a visitor,
  participant, or organizer all see the identical page; the only
  difference anywhere in this platform between an organizer and a
  visitor is the presence of a "Create event" action in the nav
  itself, not a different home page underneath it.

---

## 6. What I'm testing for this page

- Stat strip numbers animate from zero on first scroll into view, and
  render instantly (no animation) under `prefers-reduced-motion`.
- An empty recent-events section on a fresh instance shows the plain
  empty-state text, not a hidden section or a loading spinner stuck
  forever.
- The Global Ranking teaser's tie rendering matches the full
  leaderboard page's exactly, for the same data.
- Category pill filtering actually filters both event sections
  simultaneously, not just one.
- On a 375px-wide viewport, the stat strip wraps to 2×2 and the
  recent-events grid drops to one column, with no page-body
  horizontal scrollbar anywhere.
