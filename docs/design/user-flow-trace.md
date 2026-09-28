# User Flow Trace

Status: **Verification pass, not new design.** Walks four personas
through every module design doc in sequence, confirming each "Flow
continuity check" section's promised hand-off is actually honored by
the doc on the other end. Gaps found here feed directly into
`design-review-audit.md`.

---

## Persona 1: Anonymous visitor (never signs in)

```
Events list (M3, public)
  → Event detail (M3, public)
    → Public gallery (M5, public)
      → Submission detail (M3, public)
        → Comments — read-only (M13, public)
    → Results page, if published (M10, public)
    → Voting shortlist — view only, per this pass's decision (M11, public)
    → Certificate view, if they have a direct link (M12, public)
Global leaderboard (M14, public)
  → Person profile — ranking + certificate gallery (M14, public)
```
**No gaps.** Every node above is confirmed public in the module map
and reachable without an account. This is the one persona whose full
journey was cross-checked cleanly on the first pass.

---

## Persona 2: Participant

```
Sign up (M1) → Verify email pending (M1) → click email link →
Verify landing (M1) → Log in (M1)
  → Events list → Event detail (M3) → Register
    → Create/Join team (M4) — OR — solo, skip straight to submission
      → Submission form (M5): draft → submit
        [backend-only: Verification (M6), Judging (M7/M8) — no participant UI]
      → Results page (M10), once published — sees own score/rank
      → Voting (M11), if eligible — casts a vote
      → Certificate gallery (M12), once enabled — retrieves certificate
      → May appear on Global Leaderboard (M14), if any award earned
```
**No gaps.** Every arrow above has a defined source screen and
destination screen across the docs already written.

---

## Persona 3: Judge

```
Admin creates judge account (M2) — no self-signup, confirmed
  → Judge logs in with temp credentials (M1) → forced Set Password (M1)
    → [GAP — see below] → accepts an event invitation (M2, Section 4)
      → [GAP — see below] "My assigned projects" (M7, Section 3)
        → Scoring interface (M8), per assignment, until judgingClosesAt
      → Certificate gallery (M12), once enabled, role: JUDGE
```

**Gap found:** after Set Password, a judge has no events yet — where
do they land? And after accepting an invitation (M2), M2's own doc
says "redirect into the event, judge view" — but **M3's event detail
doc never defines what a judge sees there**, only anonymous/
participant states. There's no documented path from "just accepted an
invitation" to "My assigned projects" (M7). This is a real, structural
gap — flagged in the audit as Finding 1.

---

## Persona 4: Organizer

```
Admin creates organizer account (M2) → Set Password (M1) → full access
  → Create event (M3)
  → Invite judges (M2, Section 3)
  → Build rubric (M8, Section 2)
    [participants register/team/submit in parallel — M3/M4/M5]
  → Verification queue (M6) — reviews flagged submissions
  → Assignment board (M7) — assigns judges
  → Judging progress dashboard (M8, Section 3) — monitors
  → Normalization (M9) — runs once judgingClosesAt passes
  → Draft results (M10) → Publish
  → Shortlist curation (M11) → manage voting round
  → Voting results (M11) → Publish
  → Upload certificate template (M12) → Enable certificates (M12)
```

**Gap found:** every one of M2/M6/M7/M8/M9/M10/M11/M12's organizer
tools is described as living "in the event's admin section" or "the
same area as [other module]" — but **no doc actually designs that
admin section as a real, navigable shell.** It's referenced by name
across seven different module docs and never once specified. This is
the single largest structural gap in this whole design pass — flagged
as Finding 2 in the audit, and it's a bigger miss than Finding 1.

---

## Bootstrap persona: the very first admin

```
docker compose up, seeded instance
  → siteAdmin provisioned outside normal app flow (backend, no UI)
    → logs in with seeded credentials (M1, standard login — no special screen)
      → creates the first organizer/judge accounts (M2)
```
**No gap** — correctly, by design. There is no in-app "create a site
admin" screen anywhere in these docs, matching the backend's explicit
rule that this is a bootstrap/seed concern, not a feature. Confirmed
consistent, not missing.

---

## Screen-by-screen entry/exit table

Every screen across all 14 docs, checked for a defined way in and a
defined way out. Only listing the ones that raised a question during
this pass — everything not listed here was confirmed clean.

| Screen | Entry defined? | Exit defined? | Note |
|---|---|---|---|
| M7 "My assigned projects" | **No** — no nav item, no link from anywhere a judge would actually be | Yes → M8 | Part of Finding 1/2 |
| M3 Event detail, judge's view | **Not designed at all** | — | Finding 1 |
| Organizer event-admin shell | **Not designed at all** — referenced by 7 modules, defined by none | — | Finding 2 |
| M12 Certificate download, unauthorized viewer | Yes | Yes (disabled-with-explanation) | Deliberate, documented exception to the hide-don't-disable rule — flagged for confirmation, not a bug |
