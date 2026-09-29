# Raptor — Frontend Design (Mega Document)

Status: **Design reference, consolidating and superseding scattered
prior work.** One document, every page, one component library referenced
by name throughout rather than re-described per page. Where a page
already has a detailed states/errors doc elsewhere (the events list,
and Modules 01–15's design docs), this document gives the complete
layout/responsive spec and points there for the exhaustive state list,
rather than duplicating it.

**Correction made while writing this:** an earlier home-page
exploration used a navy/indigo/fuchsia gradient hero. That's dropped
here — it's exactly the purple-leaning, gradient-heavy look ruled out
below. This document returns to the plain gray-and-blue direction
that was already explicitly approved earlier in this project, and
stays there.

---

## PART 1 — Design Foundations

### 1.1 Philosophy

Enterprise-plain, not designed-agency-distinctive. Reads like software
a large, established company built — GitHub/Atlassian territory — not
a template. Performance over SEO: fast and snappy matters, search
indexing doesn't. Every table has a genuine mobile restructuring, not
a horizontal scrollbar bolted on. Motion is purposeful — feedback or a
real state change, never decoration.

### 1.2 Color — plain, no gradients, no purple/violet family anywhere

| Token | Hex | Use |
|---|---|---|
| `gray-900` | `#111827` | Primary text |
| `gray-600` | `#4B5563` | Secondary text |
| `gray-500` | `#6B7280` | Muted/meta text |
| `gray-400` | `#9CA3AF` | Placeholder, disabled |
| `gray-200` | `#E5E7EB` | Borders |
| `gray-100` | `#F3F4F6` | Hover fill |
| `gray-50` | `#F9FAFB` | Page background |
| `white` | `#FFFFFF` | Card/surface background |
| `blue-700` | `#1D4ED8` | Primary button (gradient base), active nav text |
| `blue-600` | `#2563EB` | Links, primary button (gradient top) |
| `blue-50` | `#EFF6FF` | Active nav background, selected fill |
| `amber-700`/`amber-50`/`amber-200` | `#B45309`/`#FFFBEB`/`#FDE68A` | Live/active status |
| `green-700`/`green-50`/`green-200` | `#15803D`/`#F0FDF4`/`#BBF7D0` | Success/complete status |
| `red-700`/`red-600`/`red-50`/`red-200` | `#B91C1C`/`#DC2626`/`#FEF2F2`/`#FECACA` | Destructive actions, error status |

**Rule: no purple, violet, indigo, or fuchsia anywhere in this
system.** One accent (blue) for actions, three status families
(amber/green/red) for state — nothing else. Color never carries
information alone; every status pairs with a text label.

### 1.3 Typography — system fonts, no custom typeface

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             Helvetica, Arial, sans-serif;
/* data/scores only: */
font-family: ui-monospace, Consolas, monospace;
```

Zero webfont downloads — a genuine performance decision, not a style
default. No display/serif typeface anywhere, no more than two weights
(400, 500) outside headings (600).

| Token | Size | Line-height | Weight |
|---|---|---|---|
| `display` | 22px (20px mobile) | 28px | 600 |
| `heading` | 16px | 22px | 600 |
| `body` | 14px | 20px | 400 |
| `body-medium` | 14px | 20px | 500 |
| `small` | 13px | 18px | 400 |
| `micro` | 12px | 16px | 500 |

### 1.4 Spacing, radius, elevation

Standard 4px-increment scale. Page max-width 1200px, 24px padding
(16px mobile). Border radius 6px default, full for pills/badges.
Four elevation levels: flat (cards), raised (dropdowns), overlay
(modals), toast — see `DESIGN-SYSTEM.md` §5 for exact shadow values.

### 1.5 Motion

140–160ms for hover/interaction, 120ms for press feedback, 320ms
staggered entrance on first load only. `prefers-reduced-motion`
collapses all of it to near-zero, globally, no exceptions.

### 1.6 Responsive rule — the one that matters most

**Every data table has a genuine card-based mobile layout below the
`md` breakpoint — never horizontal scroll as the only adaptation.**
Nav collapses to a hamburger drawer. Touch targets grow from 32px to
36px minimum on mobile. This is stated once, here, and referenced by
every page below rather than re-justified per page.

---

## PART 2 — Component Library

Referenced by name throughout Part 3. Each is one shared
implementation, used everywhere it applies — never redefined per page.

| Component | Contract | Responsive behavior |
|---|---|---|
| **Nav (public)** | Logo, links, sign-in/create-event actions | Hamburger drawer below `md` |
| **Nav (organizer shell)** | Event switcher, phase badge, flat 10-item sidebar, admin-bypass banner | Sidebar → hamburger drawer below `md`; banner stays full-width always |
| **Button** | `variant: primary\|secondary\|ghost\|danger`, `size`, `disabled`, `loading` | 32px → 36px height on mobile |
| **Input / Select / Textarea** | `disabled`, `error` states with `status-danger` border/ring | Same height bump on mobile |
| **Badge** | `status: live\|success\|neutral\|danger`, pulses only when `live` | Unchanged across breakpoints |
| **Table → Card** | Table ≥ `md`; stacked cards < `md`, same data, same actions | This *is* the responsive contract |
| **Modal** | `variant: standard\|destructive`; destructive requires a typed reason, confirm button disabled until non-empty | Full-width sheet-style on mobile |
| **Toast** | Success-only; errors are always inline, never toast | Bottom-anchored, same on all sizes |
| **Avatar** | Initials + deterministic color from `User.id`; sizes small/default/large | Unchanged |
| **Skeleton** | Matches the shape of real incoming content | Unchanged |
| **Empty state** | Heading + one line + action only if the viewer has permission for it | Unchanged |
| **Stat strip** | 4 numbers in a row, count-up on scroll-into-view | Wraps to 2×2 grid on mobile |
| **Phase progress bar** | 6-segment lifecycle indicator, reused on event cards, event detail, and the timeline view | Full-width on mobile cards |

**Destructive-action rule, stated once:** every consequential action
(disqualify, ban, restart a round, delete) routes through the
destructive Modal with a mandatory typed reason — except a person's
own low-stakes self-actions (leave a team, delete your own comment),
which need no modal at all. This single rule governs every "delete/
disqualify/remove" button on every page below; it is not repeated per
page.

---

## PART 3 — Complete Site Map

| # | Path (illustrative) | Auth | Page |
|---|---|---|---|
| 1 | `/` | Public | Home |
| 2 | `/events` | Public | Events list |
| 3 | `/events/:slug` | Public (+ viewer-state variants) | Event detail |
| 4 | `/events/:slug/gallery` | Public | Submission gallery |
| 5 | `/submissions/:id` | Public | Submission detail |
| 6 | `/events/:slug/results` | Public once published | Results / leaderboard |
| 7 | `/events/:slug/vote` | Public view, gated action | Voting shortlist / ballot |
| 8 | `/certificates/:id` | Public | Certificate view |
| 9 | `/users/:id` | Public | Profile (certificates + ranking) |
| 10 | `/leaderboard` | Public | Global Ranking |
| 11 | `/signup` | Pre-auth | Sign up |
| 12 | `/login` | Pre-auth | Log in |
| 13 | `/verify-email` | Pre-auth | Verify email (pending + landing) |
| 14 | `/set-password` | Forced, staff first login | Set password |
| 15 | `/events/:slug/team` | Auth | Create/join team |
| 16 | `/teams/:id` | Auth | Team panel |
| 17 | `/events/:slug/submit` | Auth | Submission form |
| 18 | `/judge/assignments` | Judge | My assigned projects |
| 19 | `/judge/assignments/:id/score` | Judge | Scoring interface |
| 20 | `/invitations/:token` | Judge (pre/post-accept) | Invitation accept/decline |
| 21 | `/organize/:slug` | Organizer | Shell: Overview |
| 22 | `/organize/:slug/judges` | Organizer | Judge invitations |
| 23 | `/organize/:slug/rubric` | Organizer | Rubric builder |
| 24 | `/organize/:slug/submissions` | Organizer | Verification queue |
| 25 | `/organize/:slug/assignment` | Organizer | Assignment board |
| 26 | `/organize/:slug/progress` | Organizer | Judging progress |
| 27 | `/organize/:slug/normalization` | Organizer | Normalization run/compare |
| 28 | `/organize/:slug/results` | Organizer | Draft/publish/correct |
| 29 | `/organize/:slug/voting` | Organizer | Shortlist + round management |
| 30 | `/organize/:slug/certificates` | Organizer | Template + enable |
| 31 | `/organize/:slug/audit-log` | Organizer/admin | Audit log |
| 32 | `/organize/:slug/edit` | Organizer | Event create/edit form |
| 33 | `/admin/staff/new` | Admin | Create staff account |
| 34 | `/admin/*` exports | Admin | All-events, Global Ranking, audit log, user directory CSV |

---

## PART 4 — Page Specs

Each page: layout (by component name from Part 2), what's specific to
it, and where the exhaustive state/error list already lives if it does.

### 4.1 Public pages

**Home (#1).** Stat strip → upcoming events (Table→Card, horizontal
scroll row) → recent events (Table→Card grid) → global-ranking
teaser. No hero banner, no marketing copy — a direct, functional
landing screen per the earlier "no showcase" correction. Category
filter pills above the event grids.

**Events list (#2).** Full spec already locked: `events-list-screen.md`
+ `events-list-states-and-errors.md`. Toolbar (search/filter/sort/
density), Table→Card, Overview-style stat strip, phase-progress bar
per row replacing a plain badge.

**Event detail (#3).** Four viewer states — anonymous, registered
participant, judge, organizer — each swapping only the action area;
layout otherwise shared. Full state list: `03-event-management.md`.

**Gallery (#4) / Submission detail (#5).** Same Table→Card list
pattern as Events. Comments embedded on detail (`13-comments.md`).
Full spec: `05-submission-management.md`.

**Results (#6).** Dense-ranked list, tied positions visually grouped
(not independently numbered) on both table and card layouts — this
grouping is the one thing that needed real thought in the mobile
conversion. Full spec: `10-results-and-rankings.md`.

**Voting (#7).** Card grid identical to the gallery's, Vote button
only for eligible signed-in viewers. Full spec: `11-voting.md`.

**Certificate view (#8) / Profile (#9).** Certificate renders full-
width; profile combines certificate gallery + ranking drill-down on
one page (per Module 14's note that these are "public facts about one
person" and shouldn't be split across two routes). Full spec:
`12-certificates.md`, `14-global-ranking.md`.

**Global Ranking (#10).** Table→Card leaderboard, dense ranking,
paginated, served from a cached snapshot never computed live. Full
spec: `14-global-ranking.md`.

### 4.2 Auth pages (#11–14)

Centered, minimal layout — no main nav, just the mark linking back to
Events. Full spec, including the shared form conventions every other
module references: `01-auth.md`.

### 4.3 Participant pages (#15–17)

**Team (#15/#16).** Create-or-join is two equal-weight options.
Team panel: Avatar row, admin-only actions (Kick, Regenerate,
Delete — none require a reason, per Module 4's correction). Full
spec: `04-team-management.md`.

**Submission form (#17).** Fields vary by event's track-attachment
mode — the form's shape genuinely changes per event. Read-only +
Unsubmit once submitted. Full spec: `05-submission-management.md`.

### 4.4 Judge pages (#18–20)

**Assignments (#18) / Scoring (#19).** List → detail. Scoring is the
single most complex screen in the platform: slider + number input
pair per criterion, bonus tracks visually lighter-weight, special-
award toggles, mandatory feedback textarea. Stays fully editable
after first submit (unlimited resubmission) until `judgingClosesAt`,
then locks. Full spec: `08-rubric-and-scoring.md`.

**Invitation (#20).** Accept/decline, idempotent on a stale link. Full
spec: `02-roles-and-membership.md`.

### 4.5 Organizer shell (#21–32)

One persistent shell (Nav: organizer shell variant) wrapping eleven
tools plus a new Overview dashboard. Flat sidebar, no grouping. Full
shell spec: `15-organizer-shell.md`; each tool's own content spec is
its numbered module (`02`, `06`–`12`). Mobile retrofits for the four
dense-table tools (Verification, Assignment, Results, Voting) are
recorded in each module's own doc, with Assignment's two-pane-to-
single-column conversion being the one genuinely hard case.

**Audit log (#31)** is new since the shell was first designed
(`stages/24-closeout.md`, Group B1) — same Table→Card pattern,
date-range filter, `(unavailable)` fallback for unresolvable entries
matching Module 18's CSV export convention exactly.

**Event edit (#32).** Long form, sectioned (Basics/Timeline/Tracks/
Team settings), phase-aware field locking on a published event. Full
spec: `03-event-management.md`.

### 4.6 Admin (#33–34)

**Create staff account (#33).** Two-step confirm, temp password shown
exactly once. Full spec: `02-roles-and-membership.md`.

**Exports (#34).** Not standalone pages — action buttons inside the
relevant admin/organizer screens, hitting the CSV routes directly.
Full spec: `18-csv-export.md`.

---

## PART 5 — What this document deliberately does not re-specify

Every exhaustive state/error list, every backend field mapping, every
test list already written in Modules 01–24 and the events-list docs.
This document is the layout/responsive/component reference; those
remain the source of truth for behavior. If this document and any of
those disagree on a component's visual contract, this document wins;
if they disagree on backend behavior or state handling, the module
doc wins.
