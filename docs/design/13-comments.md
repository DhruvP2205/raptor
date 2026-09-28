# Frontend Design: Module 13 — Comments

Status: **Design locked, not yet implemented.**
Backend reference: `stages/13-comments.md`. No standalone screen —
embedded in Module 5's submission detail page, confirmed in the
module map.

---

## 1. Structure

A flat list beneath the submission's main content (Module 5, Section
4). Each comment: `Avatar` + name + timestamp (+ "(edited)" indicator
if applicable) + body text. A composer at the top of the list (or
bottom — bottom is more conventional for a chronological comment
thread where newest is most relevant) with a `Textarea` and a **Post**
button, shown only to eligible users (Section 2).

Each comment the viewer authored gets a small **Delete** action (no
confirmation modal — backend confirms self-deletion needs no reason,
matching Module 4's team-leave precedent for low-stakes self-actions).
Organizer/admin viewing any comment sees a **Remove** action instead
(routes through the destructive Modal, reason required — moderation,
not self-deletion).

---

## 2. States

| State | Behavior |
|---|---|
| Not signed in / no verified email | Composer replaced by a line: "Sign in with a verified email to comment." — comments themselves remain fully visible (viewing never requires auth, per the module map) |
| Eligible | Composer active |
| `Event.commentsEnabled: false` | Composer absent entirely (not just for this viewer — nobody can post), existing comments still shown, with a small note: "Comments are closed for this event." |
| Posting | Post button loading state, `Textarea` stays populated until success (never clear content speculatively before confirmation) |
| Posted successfully | New comment appears immediately at the appropriate end of the list, composer clears |
| Post fails (rate limited or server error) | Inline error under the composer, content preserved — same "never lose what someone typed" principle from Module 5's submission form |
| Self-delete confirmed | Comment disappears from the list immediately, no toast needed (low-stakes, immediate visual feedback is enough) |
| Moderation remove confirmed | Same immediate disappearance, but this was a Modal-gated action so there's already been a deliberate confirmation step before it happened |
| Editing own comment | Inline — the comment's body becomes an editable `Textarea` in place, Save/Cancel replace the normal comment actions. No time limit (backend confirmed) |
| A comment whose submission later reverts to draft (Module 5's documented edge case) | **Comment stays visible** — this was the explicit rule established when Module 5's doc was written (backend D112) and is restated here as the module that actually implements it: existing comments persist through a draft-reversion; only *new* comment creation is gated by current visibility |

---

## 3. Flow continuity check

- **Into this module:** lives entirely inside Module 5's submission
  detail page — no separate entry point.
- **Confirms Module 5's forward reference** to this doc, and Module
  5's already-stated rule about comment persistence through a draft
  reversion — both now consistent across the two docs rather than
  asserted in one and assumed in the other.
