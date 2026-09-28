# Stage Spec: Team Management

Status: **Design locked, not yet implemented.**
Depends on Module 1 (Auth), Module 2 (Roles & Membership), and Module 3
(Event Management) already existing. If code and this doc disagree,
update this doc first.

---

## 1. Scope of this stage

- Event registration as a solo action, fully decoupled from team
  formation.
- Team creation, the join-link format and regeneration mechanics.
- Joining, being kicked, and the single-team-per-event constraint.
- Team admin's fixed, non-transferable authority.
- Team deletion and its cascade onto drafted submissions.

Explicitly **not** in this stage: the submission content model itself
(Module 5) — this stage only covers team membership and the boundary
condition of *when* membership changes stop being allowed (i.e. at final
submission), not what a submission actually contains.

---

## 2. Registration is solo, always

`POST /events/:id/register` (Module 3/2 territory, referenced here for
context) creates an `EventMembership` with role `PARTICIPANT` and nothing
else. **No team is created, joined, or implied at registration time.**
Every participant starts unattached; team formation is a fully separate,
later, optional step initiated from the event page.

---

## 3. Team creation

- Any registered (`PARTICIPANT`) member of an event can create a team for
  that event: `POST /events/:id/teams` — name only.
- **Team name is immutable once set.** No rename, under any
  circumstance, by anyone, ever. This is a deliberate simplification: it
  removes an entire class of question (does the join link's name-derived
  portion need to update on rename? do other participants/organizers get
  confused if a team's identity shifts mid-event?) by making the question
  moot.
- **Team name uniqueness is scoped per event**, not global — two
  different events can each have a team called the same thing.
- The creator becomes that team's **admin** — a fixed, singular,
  non-transferable role (Section 6), not a generic "owner" flag with
  transfer semantics.
- **A team is always associated with exactly one event.** No
  cross-event teams, no team existing independently of an event.

---

## 4. Join link

### 4.1 Format

```
team-{slugified-team-name}-{6-digit-random}
```

Example: team name `Team Xmass` → `team-xmass-482913`.

- The name-derived prefix is generated once, at team creation, from the
  (immutable) team name — and since the name can never change, this
  prefix never needs to be regenerated or reconciled later.
- The 6-digit suffix is the actual join credential.

### 4.2 Regeneration

- Team admin can regenerate the link at any time before final
  submission (`POST /teams/:id/regenerate-link`).
- **Only the 6-digit suffix changes on regeneration.** The name-derived
  prefix stays exactly as it was — consistent and predictable, since it's
  derived from an immutable name.
- Regenerating invalidates the previous suffix immediately — the old
  link stops working the moment a new one is issued (same
  invalidate-old-issue-new pattern used for every other token in this
  platform: email verification, sessions, judge invitations).

### 4.3 Join-code security posture

- Not treated as a high-security secret (worst case if leaked: an
  unintended person joins a team the admin didn't expect — recoverable by
  kicking them and regenerating). Format favors shareability over
  brute-force resistance.
- Still rate-limited on the join endpoint itself, to prevent automated
  guessing of the 6-digit suffix space, even though the consequence of a
  successful guess is low-severity.

---

## 5. Joining a team

`POST /teams/join` with the link/code. Requirements, all checked
server-side:

1. Caller must already hold an active `PARTICIPANT` `EventMembership` for
   *that specific event* — a team's join link only works for someone
   already registered for the event that team belongs to.
2. Team must not already be at `event.maxTeamSize` (admin counts toward
   this total — e.g. `maxTeamSize: 4` means 1 admin + up to 3 additional
   members, not 4 additional members on top of the admin).
3. **Caller must not already be a member of any other team for this same
   event.** Being on teams across *different* events is unrestricted.

**Second-team-join attempt, exact behavior:** hard deny, no auto-swap,
no silent leave-and-rejoin. The response is a specific, user-facing
message instructing them to leave their current team first before they
can join a different one for the same event. This is a deliberate
UX/safety choice — an automatic swap could abandon a team without any of
its other members noticing.

---

## 6. Team admin — fixed, non-transferable, and how it actually ends

**Team admin status is permanent for the lifetime of the team.** There is
no ownership-transfer mechanism anywhere in this module. This is the
central design decision of this stage, and it's what eliminates an entire
category of edge case (orphaned teams, mid-leave ownership handoff races,
"who inherits control" logic) by construction rather than by handling it
carefully.

**Concretely, this means:**

- The admin **cannot leave the team** while any other members remain.
  There is no "leave" action available to the admin at all unless the
  team is already down to just themselves.
- To exit, the admin must first **kick every other member**
  (`DELETE /teams/:id/members/:userId`, admin-only), one at a time or in
  bulk, until the team consists of only the admin. At that point, the
  admin has two options:
  - **Regenerate the join link and start re-inviting** (the team
    persists, still with the same admin, just currently solo), or
  - **Delete the team outright** (`DELETE /teams/:id`) — see Section 7.
- **A team is therefore never, at any point in its lifecycle, without an
  admin.** The only way the admin's relationship to the team ends is by
  destroying the team itself. There is no intermediate state where the
  system needs to decide who becomes the new admin.

**All membership changes — add via join link, kick, regenerate link,
delete — are permitted only until the team's submission has been
finalized for the first time. Once a team has submitted at least once,
the roster locks permanently** — even if the team later unsubmits to keep
editing content, membership changes do not reopen. This is keyed off a
dedicated `Submission.everSubmitted` flag (Section 7 of
`05-submission-management.md`), not the live `isDraft` flag, precisely
because `isDraft` can flip back to `true` on unsubmit while the roster
must stay frozen regardless. This matches the same principle used for
certificates and judging elsewhere — team composition at *first*
submission is what everything downstream (scoring, certificates, records)
is anchored to, and a team cannot un-lock its roster by cycling back to
draft after the fact.

---

## 7. Team deletion

- Admin-only action, permitted only **before the team's submission has
  ever been finalized** (i.e. `Submission.everSubmitted` is still
  `false`) — same permanent-lock condition as membership changes in
  Section 6, not merely "currently in draft."
- **Deleting a team cascades: any drafted or in-progress submission
  belonging to that team is deleted along with it.** This is treated as a
  deliberate, real, destructive action — not a soft-archive, not
  recoverable. The admin should be shown a clear confirmation step before
  this executes, given the data loss involved (consistent with the
  confirmation-step pattern already used for the irreversible
  staff-account role assignment in Module 2).

---

## 8. Member permissions on the submission itself

- **Every team member — admin or not — can update the team's drafted
  submission.** This is a collaborative document by design; editing
  rights are not restricted to the admin.
- Admin-exclusive actions are strictly the membership-management ones
  from Section 6 (kick, regenerate link, delete team) — nothing about
  submission content is admin-gated.

---

## 9. What I'm testing for this module

- Registering for an event never creates or implies any team membership.
- A team's name cannot be changed via any code path, including direct
  API manipulation, after creation.
- Regenerating a join link changes only the 6-digit suffix; the
  name-derived prefix is byte-for-byte identical before and after.
- The previous join link stops working immediately after regeneration.
- Joining a team the caller isn't registered for the underlying event of
  is rejected.
- Joining a team already at `maxTeamSize` (admin + members counted
  together) is rejected.
- Attempting to join a second team for the same event is rejected with
  the specific "leave your current team first" message — no silent
  swap occurs, and the caller's original team membership is unchanged
  after the failed attempt.
- An admin attempting to leave while other members remain is rejected;
  the same admin succeeds in leaving only after the team is reduced to
  just themselves via kicks, and even then "leaving" in that state is
  really "delete the team" or "stay solo," not a generic leave action.
- Deleting a team removes its drafted/submitted content in the same
  transaction — no orphaned submission survives a deleted team.
- Any membership-management action (join, kick, regenerate, delete)
  attempted after the team's submission has **ever** been finalized once
  is rejected — including a test that unsubmits, confirms membership
  actions are *still* rejected, then resubmits, confirming the lock never
  reopens once tripped.
- Every team member, not just the admin, can successfully edit the
  team's draft submission before final submission.

---

## 10. Open questions

None outstanding for this stage. The rename/link-drift question raised
during design is resolved by team names being permanently immutable,
which removes the need for the question to be answered at all. The
roster-lock-vs-unsubmit interaction, previously open, is resolved in
Section 6 — locked permanently on first submission, keyed off
`Submission.everSubmitted`, independent of later unsubmit cycles. See
`05-submission-management.md` Section 7 for that field's definition.
