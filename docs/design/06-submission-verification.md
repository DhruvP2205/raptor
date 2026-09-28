# Frontend Design: Module 6 — Submission Verification

Status: **Design locked, not yet implemented.**
Backend reference: `stages/06-submission-verification.md`. No
participant-facing screen — confirmed in the module map.

---

## 1. Screen

**Organizer/admin: Verification review queue.**

### Structure
Table (reusing the events-list table pattern): submission title, team,
`checkStatus` Badge (`VERIFIED`=success, `SUSPICIOUS`=live/amber,
`REJECTED`/`PRIVATE`/`NON_GITHUB`/`ERROR`=danger, `NOT_RUN`=neutral),
`finalDecision` Badge (`APPROVED`=success, `DISQUALIFIED`=danger,
`PENDING_REVIEW`=live/amber). Filter by either status field. Bulk
selection checkboxes + a filtered/full/targeted **Re-run** action,
matching the backend's exact three re-run scopes (D64).

Row click opens an inline expansion (same pattern as the events list's
row-expansion) showing: `firstCommitAt`/`lastCommitAt`, commit counts,
and the **full `outsideWindowCommits` list** — this detail matters
enough (it's the actual evidence an organizer is judging by) that it's
never truncated or summarized away.

**Manual decision action**, inside the expanded row: `Approve` (Button
primary) or `Disqualify` (Button danger → destructive Modal, reason
**required**, matching backend exactly — this is the real, load-bearing
use of the mandatory-reason modal pattern this whole design system was
built around).

### States
| State | Behavior |
|---|---|
| No submissions yet eligible | Empty state: "No submissions to verify yet." |
| Loaded | Table as above |
| Triggering a run (full/filtered/targeted) | The affected rows show a `NOT_RUN`→in-progress transition (small inline spinner in the checkStatus cell), rest of the table stays interactive — this can be a slow, multi-submission GitHub-API-backed job (backend Module 6, the `worker` container), so the UI must not block on it |
| Run completes | Rows update in place (their badges change), a toast summarizes: "12 checked — 9 verified, 2 suspicious, 1 error." |
| Re-run attempted on a submission with an existing manual `finalDecision` | Per backend Section 7's noted implementation detail (re-running shouldn't silently overwrite a manual decision) — this UI surfaces a warning banner on that row after the re-run: "Automated check re-run — your manual decision is unchanged." Never silently reverts an organizer's prior call |
| GitHub token pool exhausted (backend Section 5, invalid/rate-limited tokens) | A persistent banner at the top of this screen specifically (not a generic site-wide alert): "GitHub verification is degraded — no valid tokens available. Contact an admin." — this is exactly the kind of infrastructure problem that should be visible to the person whose job depends on it, not buried in a backend log only an admin happens to check |
| Approve/Disqualify confirmed | Row's `finalDecision` badge updates immediately, no page reload |
| Disqualify attempted with empty reason | Confirm button in the modal stays disabled — matches the `Textarea`/Modal contract already specified in `DESIGN-SYSTEM.md` 7.6 |

---

## 2. Flow continuity check

- **Into this module:** organizer-only nav item on the event (parallel
  to Module 2's judge invitation dashboard — both are event-scoped
  organizer tools reached from the same area of event detail, Module
  3).
- **Out of this module:** an `APPROVED` submission becomes eligible for
  Module 7 (Judge Assignment) — the connection point Module 7's doc
  needs to open with.
- **Confirms Module 5's note**: the verification-status panel mentioned
  in the submission detail page (organizer/admin-only view) surfaces
  the same `checkStatus`/`finalDecision` data this queue manages —
  same data, two different views for two different moments (bulk
  triage here, single-submission context there).
