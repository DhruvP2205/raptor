# Frontend Design: Module 5 — Submission Management

Status: **Design locked, not yet implemented.**
Backend reference: `stages/05-submission-management.md`.

---

## 1. Screens

1. **Submission form** — draft/edit/submit, solo or team.
2. **Public gallery** — the T1 requirement, confirmed public (no login)
   in the module map.
3. **Submission detail (public)** — what a gallery card opens.

---

## 2. Submission form

### Structure
Fields exactly matching the backend's fixed set: title, markdown
description, repo URL, demo video URL, live URL, track selection
(shown as single-select, multi-select, or omitted entirely depending
on the event's `trackAttachmentMode` — the form's shape literally
changes per event, not a fixed layout). A visible advisory note on the
repo URL field, matching backend Module 6's requirement: "Repository
must be public for judging — private repos require manual verification
and may be disqualified."

Two actions, both **Button** variants but visually distinct in
prominence: **Save draft** (secondary) and **Submit** (primary,
opens a standard confirmation Modal — not destructive, but genuinely a
deliberate moment, matching backend's explicit "never a single,
unconfirmed click" requirement).

### States
| State | Behavior |
|---|---|
| Draft, editing | Autosave-on-blur per field, or an explicit "Save draft" — **either works, but whichever is chosen, failed autosave must be visibly flagged**, not silently lost. Recommendation: explicit Save draft button, not silent autosave, so failure has an obvious place to surface (a failed silent autosave is one of the easiest ways to lose someone's work without them noticing) |
| Submit clicked, required fields incomplete | Confirmation modal doesn't open at all — inline errors on the missing fields instead, focus moved to the first one |
| Submit clicked, all valid | Confirmation modal opens, listing what's about to happen: "This finalizes your submission. You can still edit it by un-submitting, right up until the deadline." — sets accurate expectations rather than implying finality that isn't real |
| Submitted (`everSubmitted: true`, `isDraft: false`) | Form becomes read-only with a persistent **Unsubmit** action at the top — not a separate screen, the same form, just locked with an unlock path |
| Unsubmitted | Form editable again, `everSubmitted` stays true internally (Section 3 of the design doc doesn't need to show this — it's backend bookkeeping) but the *team roster lock* (Module 4) is unaffected — worth restating in this doc's own words since it's a genuinely confusing pair of facts otherwise: unsubmitting reopens the content, never the roster |
| Deadline passed (`now() > submissionsCloseAt`) | Entire form becomes permanently read-only, no Save/Submit/Unsubmit actions anywhere — with a clear banner: "Submissions closed on {date}." |
| Save/Submit — server error | Reused error block, inline near the action buttons, not a full-page takeover (the person's typed content must stay visible and intact) |
| Save/Submit — network failure mid-save | **Never clear the form.** The exact same principle from the events-list doc's "search field stays intact on failure" applies here with much higher stakes — losing someone's submission text to a network blip would be a serious trust failure |

---

## 3. Public gallery

### Structure
Grid of submission cards (thumbnail-free, per backend D27 — no image
fields in this version), each showing title, team/solo name, track
badge, tech-agnostic (no tech tags field exists per backend either).
Search + track filter toolbar, same visual pattern as the events list
toolbar (`DESIGN-SYSTEM.md` component reuse, not a new pattern).

### States
Mirrors the events-list states doc almost exactly — same taxonomy
(loading skeleton, empty, error, stale), reused rather than
re-specified in full here. Two gallery-specific additions:

| State | Behavior |
|---|---|
| Empty — no submissions yet | "No submissions yet." — no call-to-action button here (unlike the events-list empty state) since browsing the gallery isn't the moment to prompt someone to submit; that prompt belongs on event detail instead |
| A submission's underlying event later reverts a draft (rare, but Module 13's comment-visibility precedent already established this can happen) | The gallery listing itself **does** disappear when `isDraft` flips back to true — different from Comments' rule (visible comments persist), because the gallery is a live listing of *current* public submissions, not a historical record of something once said |

---

## 4. Submission detail (public)

### Structure
Full submission content, links (repo/demo/live — each opens in a new
tab, clearly marked), comments section (Module 13, embedded here per
that module's doc), and — once results are published (Module 10) — the
project's score/rank/awards, if any.

### States
| State | Behavior |
|---|---|
| Draft submission, viewed by someone other than the team | Not reachable — matches the "no access at all" organizer visibility rule from backend Module 5, extended here to mean the public route itself 404s rather than exists-but-forbidden |
| Verification status visible to organizer/admin only | An organizer/admin viewing this same public page additionally sees a verification-status panel (approved/pending/disqualified) that a normal visitor never does — same visibility split established in the events-list states doc (Section 9), reapplied here |

---

## 5. Flow continuity check

- **Into this module:** solo path from event detail directly (Module
  3); team path from the team panel (Module 4).
- **Out of this module:** gallery cards → submission detail;
  submission detail → comments (Module 13, embedded) and, once
  published, results (Module 10).
- **Confirms the solo/team fork flagged in Module 4's doc** — both
  paths converge on the same submission form here, differing only in
  how they arrived, not in the form itself.
