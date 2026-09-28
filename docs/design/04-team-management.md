# Frontend Design: Module 4 — Team Management

Status: **Design locked, not yet implemented.**
Backend reference: `stages/04-team-management.md`.

---

## 1. Screens

1. **Create or join team** — the prompt reached from event detail once
   registered.
2. **Team panel** — roster, invite link, admin actions.

---

## 2. Create or join team

### Structure
Two options presented side by side, equal visual weight (neither is
the "default" — both are equally valid first moves per the backend's
solo-registration model): **Create a team** (name field — immutable
once set, so the form has a plain-text confirmation line: "Team names
can't be changed later" directly under the field, not buried in help
text) and **Join a team** (paste an invite code/link).

### States
| State | Behavior |
|---|---|
| Idle | Both options available |
| Create — submitting | Loading state |
| Create — success | Redirect to Section 3 (team panel) as the new team's admin |
| Create — name already taken (scoped to this event) | Inline error under the name field |
| Join — invalid/expired code | Inline error: "That link isn't valid. Ask your team admin for a current one." — matches backend's rotating-suffix invalidation |
| Join — team already at `maxTeamSize` | Inline error naming the actual limit: "This team is full (4/4)." |
| Join — already on a different team for this event | **Hard block, matching backend exactly** — "You're already on a team for this event. Leave it first to join a different one." with a link to that existing team's panel — never a silent swap |
| Join — already has a solo submission for this event | Same hard-block pattern, solo/team-exclusivity version: "You already have a solo submission for this event." |
| Join — success | Redirect to Section 3, as a regular member |

---

## 3. Team panel

### Structure
Team name (display-only, never editable — reinforced visually, not
just at creation), invite link (copyable, with a **Regenerate** action
— admin only), member list (`Avatar` + name per member, admin visually
marked with a small badge, not a separate list).

**Admin-only actions**, each on a member row: **Kick**. Team-level
admin-only actions: **Regenerate link**, **Delete team**.

Kicking and deleting both route through the destructive confirmation
Modal (`DESIGN-SYSTEM.md` 7.6) — **both use the destructive variant
with a reason NOT required** (fixed per
`design-review-audit.md` Finding 3: an earlier draft of this paragraph
carved out only "deleting" as the reason-not-required exception,
leaving Kick on the modal's `requireReason` default of `true` — but
checking `stages/04-team-management.md` directly, the backend doesn't
require a written reason for kicking a member any more than it does
for deleting the team; both are the team admin's own prerogative over
their own team. `requireReason` is explicitly set `false` for both,
worth stating since it's the one exception in this whole design system
to "destructive = reason required," and an implementer copying the
pattern by rote could easily add a reason field that doesn't belong).
The delete modal's consequence line is specific and severe, since it's
specific and severe on the backend too: **"This permanently deletes
the team and its submission. This can't be undone."**

### States
| State | Behavior |
|---|---|
| Loaded, viewer is admin | Full actions available |
| Loaded, viewer is a regular member | No Kick/Regenerate/Delete controls at all — not disabled, absent, matching the events-list precedent for permission-based rendering |
| Loaded, viewer is neither | Redirect away — this page has no meaningful read-only public view, unlike an event or submission |
| Regenerate clicked | Loading state → toast: "Link regenerated. The old link no longer works." — explicit about the consequence, not just "done" |
| Kick confirmed | Loading state → the member disappears from the list, toast: "Removed from team." |
| Delete confirmed | Loading state → redirect to event detail, toast: "Team deleted." |
| **Roster lock active** (`everSubmitted: true`, backend D26) | Kick/Regenerate/join-via-link are all **absent**, not disabled — with one explanatory line at the top of the panel: "This team's roster is locked because a submission has been finalized." This is a real, permanent state (survives even an unsubmit, per backend D26) and the UI needs to say why, not just remove buttons with no explanation |
| Admin attempts to leave while others remain | Not a button that exists at all — "Leave team" is only ever shown to non-admin members; the admin's only paths out are Kick-everyone-then-delete or Kick-everyone-then-regenerate-and-restart, exactly matching backend Section 6's design |
| Member (non-admin) leaves | Own action, no confirmation modal needed (not consequential to anyone but themselves) — direct action with an immediate toast |

---

## 4. Flow continuity check

- **Into this module:** from Module 3's event detail "Create or join a
  team" prompt (already referenced there).
- **Out of this module:** the team panel is where the submission
  form's entry point (Module 5) lives once a team exists — noting that
  hand-off now for Module 5's doc to confirm.
- **Solo path exists in parallel** — Module 5's doc needs to account
  for a solo participant reaching the submission form directly from
  event detail, never touching this module at all. Flagging that now
  so it isn't missed when Module 5 is written.
