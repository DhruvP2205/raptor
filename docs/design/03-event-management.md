# Frontend Design: Module 3 — Event Management

Status: **Design locked, not yet implemented.**
Events list already built and approved
(`events-list-screen.md` + `events-list-states-and-errors.md`) — this
doc covers the two remaining screens: event detail and create/edit.
Backend reference: `stages/03-event-management.md`.

---

## 1. Screens

1. **Event detail (public)** — what "View" on the events list opens.
2. **Create/edit event (organizer)** — the form behind "Create event."

---

## 2. Event detail (public)

### Structure
Header: event name, `PhaseProgressBar` (from `events-list-screen.md`
Section 3.4 — same component, reused here at larger size), poster
image if set. Below: markdown-rendered description (sanitized, same
render path used for preview and production per backend D18 — this
frontend doc doesn't reimplement that, just consumes its output).
Tabs or sections (device-dependent — tabs on desktop, stacked
accordion sections on mobile): **Overview**, **Tracks & Prizes**,
**Gallery** (public submissions, Module 5), **Results** (once
published, Module 10), **Leaderboard entry** (once voting/results
exist, Modules 10/11).

A persistent action area, content depending on phase and the viewer's
relationship to the event:
- Not registered, registration open: "Register" button.
- Registered, no team: "Create or join a team" prompt.
- On a team, submissions open: "Go to your submission" link.
- Anonymous visitor: "Sign in to register" (no dead "Register" button
  that then demands login — be upfront about the requirement).
- **Judge account: "You're judging this event."** — added here per
  `docs/design/design-review-audit.md` Finding 1: this doc originally
  never defined a judge-facing state at all, even though Module 2's own
  doc says accepting an invitation "redirects into the event, judge
  view." Same optimistic-display precedent already used for the
  Organizer case below (shown for any account of that type, not
  gated on a real membership check the frontend has no cheap way to
  make yet — the destination page is what actually enforces access) —
  not a new pattern, just applied consistently to the account type this
  doc had missed. Doesn't yet link to "My assigned projects" (Module 7
  isn't written), so it's informational only for now: a short note that
  assigned submissions will appear once judging opens.

### States
| State | Behavior |
|---|---|
| Loading | Skeleton matching the header + description shape |
| Loaded, `DRAFT` status, viewer lacks access | 404-equivalent — a draft event is invisible to anyone without organizer/admin membership on it (backend rule), so this isn't a "permission denied" message, it's presented as not existing at all — revealing "a draft exists but you can't see it" is itself a information leak |
| Loaded, `PUBLISHED` | Full detail as above |
| Loaded, `ARCHIVED` | Same layout, plus a small persistent note: "This event has concluded." Registration/team/submission actions are all absent — archived means done |
| Error — failed to load | Reused error block (`events-list-states-and-errors.md` 2.5 pattern) |
| Poster image fails to load | Falls back to a plain colored header band with the event name — never a broken-image icon |

### Flow
Enters from: events list "View" link, a shared/bookmarked direct URL,
or (once built) a search engine/social share — this is one of the
handful of genuinely public pages worth a moment's thought on shareable
link behavior even though true SEO isn't a priority (confirmed earlier)
— a decent Open Graph title/description costs nothing and matters for
link previews in chat apps, which is a performance-adjacent, not
SEO-adjacent, concern. Exits to: registration flow, team flow (Module
4), submission flow (Module 5), gallery (Module 5), results (Module 10).

---

## 3. Create/edit event (organizer)

### Structure
A long form, broken into sections rather than one continuous scroll —
matches the backend's own grouping: **Basics** (name, slug, poster,
markdown description), **Timeline** (every timestamp field from
`Event`, in the exact sequence the backend validates —
`registrationOpensAt` through `eventClosedAt`, including the
`judgingClosesAt` field added in Module 8), **Tracks & Prizes**,
**Bonus tracks & special awards** (Module 8's `RubricCriterion` kinds),
**Team & submission settings** (`maxTeamSize`, `trackAttachmentMode`),
**Comments toggle** (Module 13).

**Timeline section is the one place this form needs real, live
validation feedback** — the backend enforces a strict chronological
order (`registrationOpensAt < registrationClosesAt <= eventStartsAt <
...`), and an organizer filling in ten timestamp fields benefits from
knowing *immediately* which pair is wrong, not after a failed submit.
Each date field validates against its neighbors on blur, with the
specific pair named in the error — matching the backend's own "reject
with a specific error naming which pair is out of order" behavior
(`03-event-management.md` Section 3.3), not a generic "invalid dates."

### States
| State | Behavior |
|---|---|
| Create mode, empty | All fields editable, no restrictions (`DRAFT` status — full edit freedom per backend) |
| Edit mode, `DRAFT` | Same — full freedom |
| Edit mode, `PUBLISHED` | **Phase-aware editing** (backend Section 3.2) — fields whose phase has already passed are shown as read-only with a small note explaining why ("Registration has already closed and can't be changed"), not just silently disabled with no explanation |
| Slug field, edit mode, `PUBLISHED` | Always read-only once published — shown as plain text, not even a disabled input, since it can genuinely never change again |
| Bonus track total exceeds the guardrail threshold (backend D84 — soft warning) | On attempting to publish/save: a standard Modal (not destructive) surfaces the warning text and requires an explicit "Publish anyway" acknowledgment — matching the backend's audit-logged override, the UI must not silently let this through without the person seeing the warning |
| Submitting | Save button loading state |
| Success (create) | Redirect to the new event's detail page, still `DRAFT` — with a visible "Publish" action now available there |
| Success (edit) | Toast: "Event updated." Stays on the form |
| Error — validation (any field) | Inline, scrolled/focused to the first invalid field |
| Error — server/network | Reused error block |

### Flow
Enters from: "Create event" (events list) or "Edit" (event detail,
organizer view only). Exits to: event detail (Section 2), either
freshly created or freshly edited.

---

## 4. Flow continuity check

- **Ties to Module 2:** the judge invitation dashboard
  (`02-roles-and-membership.md` Section 3) is reached from this event
  detail page's organizer view — noting that hand-off explicitly now
  that both docs exist.
- **Ties forward to Modules 4/5/10/11:** every "exits to" above names a
  module not yet written in this pass — recorded here so those docs,
  when written, confirm the entry point matches what's promised here
  rather than assuming a different one.
- **No dead end:** every phase of an event (draft, published-active,
  archived) has a defined detail-page presentation — nothing falls
  through to an undefined state.
