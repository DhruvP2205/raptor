# Screen Spec: Events List — States, Errors & Edge Cases

Status: **Design locked, not yet implemented.**
Companion to `events-list-screen.md` (structure/layout) — that doc
defines what the screen looks like when everything is working. This
doc defines everything else: what it looks like while loading, when it
fails, when there's nothing to show, and every edge case in between. A
screen isn't actually specified until this part exists too — most of
what makes an interface feel unfinished is exactly what's missing here.

---

## 1. State taxonomy

Every piece of async data on this screen (event list, stat strip,
timeline view) moves through the same five states. Naming them once
here means every component below just says which of these five it's
in, rather than re-describing loading/error handling from scratch each
time.

| State | Meaning |
|---|---|
| **Loading** | First request in flight, nothing to show yet |
| **Success** | Data loaded, rendering normally |
| **Empty** | Request succeeded, there's genuinely nothing to show |
| **Error** | Request failed |
| **Stale** | Previously-loaded data is being shown while a background refresh is in flight (not a spinner-blocking state — the old data stays visible and interactive) |

---

## 2. Page-level states

### 2.1 Loading (first visit)

Skeleton, not a spinner — a spinner tells you something's happening;
a skeleton tells you *what shape* is coming, which is less jarring
when it resolves.

- Stat strip: four skeleton blocks, same dimensions as the real
  numbers, subtle shimmer.
- Toolbar: renders immediately (it doesn't depend on the event data),
  but search/filter controls are disabled until the first load
  resolves — prevents someone filtering a list that hasn't arrived
  yet.
- Table: 5 skeleton rows (matching default page size), each with
  shimmer blocks in place of name, phase bar, and the other columns.
- No layout shift when real data arrives — skeleton dimensions match
  real content dimensions exactly.

### 2.2 Success

Covered in full by `events-list-screen.md`. Nothing to add here beyond
confirming: this is the only state where the toolbar controls are
fully interactive.

### 2.3 Empty — genuinely zero events on the platform

**This is a real, expected first-run state**, not an edge case to
handle as an afterthought — a fresh self-hosted instance
(`docker compose up`) starts with zero events before anyone creates
one. Distinguishing this from "filtered to zero results" (2.4) matters
— they need different messaging and different calls to action.

- Stat strip is hidden entirely (four zeros in a row is noise, not
  information).
- Table area replaced with a centered empty-state block:
  - Short line: "No events yet."
  - One supporting line: "Events you create will show up here."
  - If the viewer has organizer/admin permission: a **Create event**
    button, same styling as the toolbar's version.
  - If the viewer does not have that permission: no button — just the
    two lines. Never show a call-to-action for an action the viewer
    can't take.

### 2.4 Empty — search/filter returned zero results

Different empty state from 2.3 — the platform has events, this
specific query just doesn't match any of them.

- Stat strip **stays visible** (it reflects the whole platform, not
  the filtered view — hiding it here would be inconsistent with 2.3
  and would also hide genuinely useful context).
- Table area: "No events match your search." with a **Clear filters**
  action (resets search text and all filter/sort controls to default
  in one click) — never leave someone stuck looking at an empty list
  with no obvious way back.

### 2.5 Error — the events list itself failed to load

A full-width inline error block replaces the table area (not a modal,
not a full-page takeover — the toolbar and stat strip, if they loaded
successfully, stay visible and usable).

- Icon + short heading: "Couldn't load events."
- One line naming what's known, not a generic apology: e.g. "The
  server didn't respond in time." or "You're offline." (see the error
  copy catalog, Section 7, for exact strings per failure type).
- **Retry** button — re-issues the same request. Does not reload the
  whole page.
- If retried and it fails again: same block, same message — no
  incrementing "tried 3 times" counter, no escalating language. The
  retry button always behaves the same way.

### 2.6 Partial failure — stat strip fails, list succeeds (or vice
versa)

These are **independent requests** and must degrade independently —
one failing must never block the other from rendering.

- Stat strip failed, list succeeded: stat strip area shows a single
  muted inline line — "Stats unavailable right now" — no retry button
  needed here specifically (it's low-stakes information; a page
  refresh naturally retries it, and cluttering this with its own retry
  control isn't worth it for four numbers).
- List failed, stat strip succeeded: stat strip renders normally above
  the Section 2.5 error block — someone still gets *some* information
  even though the primary content failed.

### 2.7 Session expired mid-browse (401)

Distinct from a generic error — this means the viewer's session ended
while they were looking at the page, not that anything is broken.

- Any request returning 401 triggers a **non-destructive** redirect to
  sign-in, preserving the current URL (including active filters/search)
  as a return path, so signing back in lands them exactly where they
  were, not back at a default view.
- Do not show this as an "error" block — errors imply something's
  wrong with the system; this is just "please sign in again," which
  deserves its own tone (see Section 7).

### 2.8 Rate limited (429)

- Same visual treatment as Section 2.5's error block, but the message
  is specific: "Too many requests — try again in a moment." No retry
  button that immediately re-fires the request (that would just
  re-trigger the rate limit) — instead, a disabled-looking retry that
  becomes active again after a short countdown (a plain few-second
  timer is enough; no need for anything fancier).

### 2.9 Offline (browser-detected)

- A persistent, dismissible banner at the very top of the page
  (above the header), not tied to any specific request — appears the
  moment the browser's own online/offline detection fires, independent
  of whether a request happens to be in flight.
- "You're offline. Showing the last loaded events." — the existing
  list stays visible and interactive (this is the **Stale** state from
  Section 1), rather than being cleared out from under the viewer.
- Disappears automatically when connectivity returns; does **not**
  auto-retry a failed request on reconnect without the viewer's
  awareness — instead surfaces a small "Back online — refresh?" prompt,
  since silently swapping data under someone while they're mid-read is
  worse than asking.

### 2.10 Stale data (background revalidation)

**Decision, made directly rather than asked back:** this screen
revalidates on window focus (switching back to the tab) and on an
explicit refresh action, but does **not** poll continuously or use a
websocket for live updates. A list screen where data might be a few
minutes old is an acceptable tradeoff against the real cost of
persistent-connection infrastructure for what is fundamentally a
browse-and-click-through screen, not a live collaboration surface.
Revisit only if real usage shows people keeping this tab open for
extended periods and needing true live updates (voting/judging
countdown screens are a more legitimate candidate for that than this
one).

- While a background revalidation is in flight: no skeleton, no
  spinner replacing content — the existing list stays fully visible
  and interactive. A small, unobtrusive indicator (e.g. a subtle dot
  near the stat strip) signals a refresh is happening, for anyone who
  looks for it, but it's not something the design asks anyone to
  notice.
- If the background revalidation fails: **silently keep showing the
  last good data** — do not surface an error for a background refresh
  the viewer never asked for. Only a viewer-initiated action (an
  explicit retry, a page reload) surfaces failure states.

---

## 3. Toolbar & control states

### 3.1 Search

| State | Behavior |
|---|---|
| Idle | Placeholder text visible, no query |
| Typing | Debounced — request fires 300ms after the last keystroke, not on every character |
| Searching | Small spinner replaces the search icon inside the field itself — no separate loading indicator elsewhere on the page |
| Results found | Table/cards update, stat strip unchanged (it's platform-wide, not query-scoped) |
| No results | Section 2.4's empty state |
| Search request failed | Section 2.5's error block, **scoped to the table area only** — the search field itself stays intact and editable (never clear what someone typed because the request that used it failed) |

### 3.2 Status filter / Sort

- Both apply immediately on change (no separate "Apply" button — this
  is a filter, not a form).
- Combine with an active search query using AND logic, not OR — stated
  explicitly because "3 filters combine how?" is a common silent bug
  source.
- An unusual but valid combination that yields zero rows uses the same
  2.4 empty state, same "Clear filters" recovery action.

### 3.3 View toggle (List / Timeline)

- Switching to Timeline while the underlying event data is still
  Section 2.1's loading state: Timeline shows its own skeleton (a
  blank date axis with skeleton bars), not a spinner.
- If the already-loaded List data is reused for Timeline (no new
  request needed, same data just rendered differently): no loading
  state at all, instant switch.
- Timeline-specific empty state (Section 6.3) is different from the
  List's empty states — see that section.

### 3.4 Density toggle

- Persisted client-side (a local preference, not synced to the
  account) so it survives a page reload — not something that needs
  backend storage or a new `User` field; this is UI preference, not
  platform data.
- No loading/error state — it's a pure client-side rendering switch.

---

## 4. Row-level states & edge cases

### 4.1 Interaction states (every row)

Default → **Hover** (background shift + left accent bar, per the
already-built visual treatment) → **Focus** (keyboard navigation —
visible focus ring, same accent color as hover, never invisible; this
is a hard accessibility requirement, not optional polish) →
**Expanded** (Section 4.2) → **Active/pressed** (brief visual feedback
on click/Enter, same tactile treatment as buttons elsewhere in this
system).

### 4.2 Expansion

- If the expanded content requires no additional request (everything
  needed was already in the list payload): expands instantly, no
  loading state.
- If the expanded content (verification breakdown, full timeline
  detail) requires a separate request: a skeleton fills the expanding
  area during the brief load, matching the shape of the real content
  that will replace it — same principle as Section 2.1, just scoped to
  one row instead of the whole page.
- If that request fails: an inline error **within the expanded area
  only** — "Couldn't load full details" + Retry — the row stays
  expanded, the rest of the page is unaffected.
- Collapsing a row never re-fetches on next expansion within the same
  page session — cache the result once loaded.

### 4.3 Edge cases in row content

| Scenario | Treatment |
|---|---|
| Event name long enough to threaten layout | Truncate with an ellipsis; full name available via a native `title` tooltip on hover and via the expanded row — never silently cut off with no way to see the rest |
| Zero tracks | "No tracks" in place of "0 tracks" — a bare zero reads as a possible bug; words read as a real, intentional state |
| Zero prizes | Same treatment: "No prizes" |
| Judging closed but results not yet published (Module 10's draft/publish gap) | "Ends" column shows "Results pending" instead of a stale or misleading date — this is a real, valid platform state (an organizer's draft not yet published), not an error, and should never be presented as if something's wrong |
| An event whose verification breakdown shows a high disqualification count | No special alarm styling — disqualification is a normal part of the pipeline (Module 6), not an error state for this screen. Numbers shown plainly in the expanded view, same neutral styling as everything else there |
| An event stuck at a phase far longer than typical (e.g. `JUDGING` for weeks past when judging usually closes) | **Not specially detected or flagged by this screen.** Surfacing "this seems stuck" requires knowing what's *normal* for a given event, which this list has no way to judge — flagged here explicitly as something this screen deliberately does not attempt, rather than silently absent |

---

## 5. Pagination states

| State | Behavior |
|---|---|
| More pages available | "Next" enabled |
| Loading next page | "Next" button shows an inline spinner in place of its label, stays disabled until the request resolves |
| Next page request fails | Button returns to its normal enabled state, plus a small inline message next to the pagination controls: "Couldn't load more — try again." No full-page error for a pagination failure; the already-visible rows are unaffected |
| Last page reached | "Next" disabled, no message needed — an inert, greyed control communicates this on its own |
| Total results fit on one page | Pagination controls hidden entirely — showing "Previous/Next" controls that can never do anything is clutter, not information |

---

## 6. Timeline view — specific states

### 6.1 Loading / Error
Covered in 3.3 — same underlying request/error model as the list, just
a different visual shape while loading.

### 6.2 Empty — no events in the visible date range
Different from the List view's empty states — this can happen even
when the platform has plenty of events, if they all fall outside
whatever date window the timeline is currently showing.
- Message: "No events in this time range." + a control to jump to the
  nearest window that does have events (e.g. "Jump to next event" /
  "Jump to today") — never leave someone looking at a blank timeline
  with no way to navigate to actual content.

### 6.3 Today-marker edge cases
- All events entirely in the future: today's marker line renders at
  the far left edge of the visible range, not off-screen.
- All events entirely in the past: today's marker renders at the far
  right edge. Both cases keep the marker visible rather than clipped —
  someone should always be able to see "today" relative to what they're
  looking at, even if every event is on one side of it.

---

## 7. Error copy catalog

Per the writing principles already established for this project:
explain what happened, name it specifically, never apologize, never
use vague language. Exact strings, so implementation doesn't improvise
different wording per error site.

| Situation | Heading | Body |
|---|---|---|
| Generic network failure | Couldn't load events | Check your connection and try again. |
| Server error (5xx) | Couldn't load events | The server didn't respond. Try again in a moment. |
| Timeout | Couldn't load events | That took too long. Try again. |
| Rate limited (429) | Too many requests | Try again in a few seconds. |
| Session expired (401) | *(no error block — redirect to sign-in, see 2.7)* | — |
| Offline | You're offline | Showing the last loaded events. |
| Reconnected after offline | Back online | *(prompt, not an error)* Refresh to see the latest. |
| Search request failed | Search didn't complete | Try again. |
| Pagination request failed | *(inline, not a block)* | Couldn't load more — try again. |
| Expanded-row detail failed | Couldn't load full details | *(inline within the row, with Retry)* |
| Empty — no events on platform | No events yet | Events you create will show up here. |
| Empty — filtered to zero | No events match your search | *(with Clear filters action)* |
| Timeline — empty range | No events in this time range | *(with a jump-to-nearest-events action)* |

---

## 8. Accessibility states

- **Focus rings are never removed** — every interactive element
  (rows, buttons, toggles, links) has a visible focus indicator, same
  accent color used for hover states, meeting standard contrast
  requirements against both light backgrounds and the dark timeline
  view.
- **Filter/search result changes are announced** via an `aria-live`
  polite region (e.g. "8 events found") — a sighted user sees the list
  change; a screen reader user needs the equivalent told to them
  without it interrupting whatever they're currently doing.
- **The phase-progress bar's segments have text alternatives** — the
  visual bar is decorative-plus-informative, but the adjacent text
  label (already specified in the structure doc) is what a screen
  reader actually announces; the bar itself is marked so assistive
  tech doesn't try to read six meaningless segment names in sequence.
- **`prefers-reduced-motion` is respected everywhere** — already
  established for the hover/entrance animations in the structure doc;
  restated here because it also covers the new states in this doc (the
  stat strip's stale-refresh indicator, skeleton shimmer, expand/
  collapse transitions all collapse to near-instant under that setting).

---

## 9. Permission-based rendering

| Viewer | "Create event" button | Everything else |
|---|---|---|
| Not signed in | Hidden — "Sign in" shown instead | Full read access to public event list |
| Signed in, participant account | Hidden | Same as above |
| Signed in, judge account | Hidden — judges don't organize events (Module 2's account-type exclusivity) | Same as above |
| Signed in, organizer/admin | Shown | Same as above, plus organizer-only data in the expanded row (verification breakdown) — participant/judge/anonymous viewers see the same expanded content **except** that breakdown, which is organizer/admin-only per Module 6's existing visibility rules |

This screen never renders a disabled or greyed-out "Create event"
button as a way of showing "you could do this if you had permission" —
the action is either available or not present at all. A visibly
disabled control implies something the viewer could unlock (finish a
form, verify an email); not having organizer permission isn't that
kind of state, so hiding is more honest than disabling.

---

## 10. What ties this back to the backend

Every error/state in this doc maps to something the backend stage docs
already define — nothing here invents a new failure mode:

- 401 handling → Module 1's session model
- Permission-based rendering → Module 2's account-type/role model
- "Results pending" edge case → Module 10's draft/publish gap
- Verification breakdown visibility → Module 6's organizer/admin-only
  data
- Rate limiting copy → the same Redis-backed rate-limiting
  infrastructure already used for uploads/voting (`ARCHITECTURE.md`)
