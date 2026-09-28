# Design Review & Audit

Status: **Self-review of everything produced in this pass** — 14 module
docs, `DESIGN-SYSTEM.md`, `design-tokens.css`, and the flow trace.
Findings are graded by severity. Nothing here has been fixed yet —
this is the audit, deliberately kept separate from the fix, so you can
see the actual list before anything changes.

---

## Critical — structural gaps (block real implementation)

### Finding 1: No judge-facing view of event detail
`02-roles-and-membership.md` says accepting an invitation redirects
"into the event, judge view." `03-event-management.md`'s event detail
doc only specifies anonymous/participant states. A judge who accepts
an invitation has nowhere designed to land. **This needs a fourth
viewer-state added to Module 3's event detail doc**: what a judge sees
(event info + a direct link into "My assigned projects," presumably),
parallel to the existing not-registered/registered/on-team states.

### Finding 2: No unified organizer admin shell — the biggest gap in this pass
Seven separate docs (M2, M6, M7, M8, M9, M10, M11, M12) each say their
organizer tool lives "in the event's admin section" or "alongside
[other module]" — but that section was never actually designed as a
real navigable structure. There's no doc specifying: what the
organizer's nav looks like, what order these eight tools appear in,
whether it's a sidebar, tabs, or something else, or how an organizer
moves between "verification queue" and "assignment board" without
re-navigating from scratch each time.

This is the difference between 14 correct individual screens and an
actual usable product — an organizer running a real event touches
eight of these tools in sequence over the course of days, and right
now there's no designed connective tissue between them. **This should
be the very next thing built**, likely as `docs/design/15-organizer-
shell.md`, before any of the eight referencing docs can be considered
truly complete.

---

## High — real inconsistencies against backend behavior

### Finding 3: Team "Kick member" reason requirement is likely wrong
`04-team-management.md` says Kick routes through the destructive
Modal "matching Delete's pattern," then separately carves out Delete
as the one exception with `requireReason: false` — implying Kick
*does* require a reason. Checking against the backend doc's actual
text: Module 4's backend spec doesn't require a reason for kicking a
member any more than it does for deleting the team — both are the
team admin's own prerogative over their own team, with no backend
validation demanding written justification for either. **Kick should
match Delete's treatment: confirmation required, reason not.** This
is a real bug in the current doc, not a style choice — as written, the
frontend would demand something the backend never asks for.

### Finding 4: Voting shortlist public-visibility was decided unilaterally
`11-voting.md` opens by resolving the module map's flagged open
question ("is shortlist viewing public?") — but that resolution was
made by me, in the doc, without it coming back to you first. It's a
reasonable reading (consistent with everything else public on this
platform), but it's a real product decision, not an implementation
detail, and it was written as if already settled. **Flagging this
explicitly rather than letting "I decided it while writing the doc"
quietly stand as the answer.**

---

## Medium — documented but worth a second look

### Finding 5: Certificate download's "disabled, not hidden" exception
`12-certificates.md` deliberately breaks this design system's own
established rule (hide actions the viewer can't take, don't show them
disabled) for exactly one case — the certificate download button. The
reasoning given (seeing a disabled download confirms the certificate
is real, which is different information than "an action exists") is
defensible, but it's the only exception to a rule stated as absolute
everywhere else, including in `DESIGN-SYSTEM.md` itself indirectly via
the events-list precedent. Worth a deliberate yes/no rather than
inheriting it by default because it was reasoned through once at
2am-adjacent speed.

### Finding 6: Open Graph tags introduced without being asked for
`03-event-management.md`'s event detail doc adds a line about Open
Graph meta tags for link-preview purposes, framed as "performance-
adjacent, not SEO-adjacent" to stay consistent with the earlier
explicit decision that search-engine indexing isn't a priority. This
is a small, genuinely low-cost addition, but it's still scope that
wasn't requested — noted here rather than silently included.

---

## Consistency checks that passed (stated so the "clean" list isn't just implicit)

- **Destructive-action/mandatory-reason pattern**, checked across every
  module that uses it: Module 6 disqualify ✓ reason required, Module
  10 disqualify/reorder/override ✓ reason required, Module 11 restart
  round ✓ reason required (minor correction ✓ correctly *not* routed
  through the heavy pattern), Module 7 judge transfer ✓ reason
  required (feeds the permanent reliability note), Module 13 comment
  moderation ✓ reason required, Module 13 self-delete ✓ correctly no
  reason. Only Finding 3 (Kick) breaks this otherwise-consistent
  picture.
- **Public/private boundary**, checked against the module map's table
  for all 14 modules: every "public: yes" and "public: no" call in
  the individual module docs matches what the map declared, with the
  one flagged exception being Finding 4 (a genuinely new decision, not
  a contradiction of an existing one).
- **No stray references to dropped features**: grepped the intent of
  every doc for Discord/OAuth login and password-reset — neither
  appears anywhere outside Module 1's explicit "this doesn't exist
  yet" section, confirming the earlier walk-backs (backend D156–D158)
  didn't quietly leak back in anywhere on the frontend side.
- **Draft/publish/correction pattern reused, not reinvented**, between
  Module 10 (judge results) and Module 11 (voting results) — Module
  11 explicitly says "identical, just for vote tallies" rather than
  respecifying it, avoiding the two implementations silently drifting
  apart the way `CLAUDE.md`'s shared-implementation rule warns against.
- **Accessibility baseline** (`DESIGN-SYSTEM.md` Section 10) — no
  module doc introduces a component that contradicts it (no
  placeholder-as-label patterns, no color-only status signals beyond
  what's already paired with text labels, no motion that ignores
  `prefers-reduced-motion`).
- **State taxonomy** (loading/success/empty/error/stale, established
  in the events-list states doc) — every module doc that has async
  data reuses this vocabulary rather than inventing new state names
  per screen.

---

## Recommended next actions, in order

1. Fix Finding 3 (Kick reason requirement) — small, one-paragraph
   correction to `04-team-management.md`.
2. Get an explicit answer on Finding 4 (voting shortlist visibility)
   — confirm or override before treating `11-voting.md` as locked.
3. Build the organizer admin shell (Finding 2) — this is the real next
   design doc, not a small fix, and it's the thing that turns 14
   correct screens into one coherent product.
4. Add the judge viewer-state to Module 3's event detail doc
   (Finding 1) — small addition, but blocks Persona 3's flow until
   done.
5. Decide Finding 5 and 6 explicitly (both low-stakes, both just need
   a yes/no rather than staying implicit).
