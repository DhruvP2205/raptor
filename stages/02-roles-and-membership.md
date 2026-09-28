# Stage Spec: Roles & Membership

Status: **Design locked, not yet implemented.**
This document is the source of truth for building Module 2 (Roles &
Membership). It depends on Module 1 (Auth & Email) already existing —
sessions and password/verification mechanics are not re-specified here,
only referenced. If code and this doc ever disagree, update this doc first,
then fix the code.

---

## 1. Scope of this stage

- The account-type model: participant vs. staff (judge/organizer), and why
  they're mutually exclusive at the account level, not just per-event.
- Admin-driven creation of staff accounts (judge/organizer), including the
  forced first-login password reset.
- Event-level attachment of staff to a specific event: organizer (direct,
  no acceptance step) vs. judge (invite → accept/decline/expire, with a
  hard deadline).
- The authorization guard architecture that every later module's
  role-isolation depends on.
- `siteAdmin` bypass behavior and its audit requirements.

Explicitly **not** in this stage: track-scoping mechanics for judges beyond
the data field existing (revisit when building judge assignment, Module 7);
event creation/timeline logic itself (Module 3).

---

## 2. Account model

### 2.1 Two account tracks, decided at creation, permanent

Every `User` belongs to exactly one of two tracks, decided the moment the
account is created, **never changed afterward**:

- **Participant track** — self-service signup via `POST /auth/signup`
  (Module 1's flow, unchanged). A normal user never selects a role; every
  self-signed-up account is a participant, full stop. This is the only
  account type a person can create for themselves.
- **Staff track** — created exclusively by an admin (`siteAdmin` user),
  never self-service, never via public signup. At creation, admin assigns
  **exactly one** of `JUDGE` or `ORGANIZER` as the account's permanent
  role.

### 2.2 JUDGE and ORGANIZER are mutually exclusive, platform-wide, permanently

- A single account can never hold both roles, ever, anywhere on the
  platform — not per-event, not globally, not at different times.
- If one real person needs to both organize and judge (even on different
  events), that requires **two separate accounts with two separate
  emails**. This is a deliberate identity-level rule, not a per-event
  authorization check — it prevents an organizer from ever having judge
  access "just this once," and vice versa, without a completely separate
  identity existing for it.
- **This assignment is permanent from account creation.** Admin cannot
  later edit an existing staff account to flip it from JUDGE to ORGANIZER
  or back. Correcting a mistaken role assignment requires deleting the
  account and creating a new one (which also means: get the confirmation
  step below right, since this isn't reversible).
- **Staff accounts can never also be participant accounts.** A judge or
  organizer cannot register for an event as a participant using the same
  account. (Whether they could theoretically participate using a
  *separate* participant-track account with a different email is not
  restricted — the platform has no way to link "this is the same real
  person" across accounts, and isn't expected to.)

### 2.3 Admin-driven staff account creation

Flow, `POST /admin/staff-accounts` (siteAdmin only):

1. Admin enters: name, email, temporary password, and selects role
   (`JUDGE` or `ORGANIZER`) — a single-select, not a checklist, since
   holding both is disallowed by definition.
2. **Before the account is actually created, admin must confirm the
   choice explicitly** (a distinct confirmation step in the UI/API flow —
   e.g. a second `POST /admin/staff-accounts/confirm` call, or a
   confirmation flag on the same request after a review screen). This
   exists specifically because the role assignment is permanent and
   irreversible — the confirmation step is the one safety net against a
   fat-fingered role selection, since there is no "edit it later" escape
   hatch by design.
3. On confirmed creation: `User` row created with the account track set,
   role set, `mustResetPassword: true`, and the temp password hashed
   (argon2, same as any password — never stored in a more recoverable
   form just because it's "temporary").
4. Admin shares the email + temporary password to that person through
   whatever channel they choose (out of scope for the platform itself to
   deliver this — no email is sent by the system for account creation
   itself, only the credentials exist for admin to hand off manually).
5. **First login:** the temporary password authenticates once, but the
   session is immediately restricted — the only action available is
   `POST /auth/set-password`. No other route is reachable until a new
   password is set. Once set, `mustResetPassword` flips to `false` and the
   account behaves like any other from then on.

### 2.4 `siteAdmin`

- A flag on `User`, not a track — orthogonal to participant/judge/organizer
  in principle, though in practice a siteAdmin account should probably
  never also be a participant/judge/organizer account (same reasoning as
  2.2 — keep identities single-purpose). Not enforcing this as a hard
  constraint in code for this stage, but noting it as an operational
  expectation.
- `siteAdmin` accounts are provisioned outside the normal app flow
  entirely (e.g. a bootstrap seed/CLI step at first deploy) — there is no
  in-app "create a site admin" button, since that would be a privilege
  escalation surface with no legitimate normal-operation use case.

---

## 3. Event-level attachment: the organizer/judge asymmetry

Having a JUDGE or ORGANIZER **account** does not, by itself, grant any
access to any specific event. Attachment to an event is a separate step,
and it works differently for each role — deliberately.

### 3.1 Organizers: direct, immediate, no acceptance step

- The user who creates an event (`POST /events`) automatically becomes
  that event's first organizer — an `EventMembership` row is created for
  them with role `ORGANIZER`, active immediately.
- An existing organizer can add **another** organizer-track account to
  their event directly — no invitation, no accept/decline, no deadline.
  The membership is active the moment it's created.
- Rationale for the asymmetry with judges (Section 3.2): organizer
  accounts are already fully vetted by admin at the account-creation
  step (2.3), including the mandatory confirmation gate. There's no
  additional consent step needed at the event level — being made an
  organizer-track account already implies trust to organize whatever
  they're assigned to.

### 3.2 Judges: invitation, with acceptance, decline, and expiry

A judge-track account existing on the platform grants **zero** access to
any event until a specific invitation for that event is accepted.

**Two ways an invitation gets created — same underlying record either way:**

1. **Direct add** — an admin or organizer who already knows a specific
   judge account (by email/search) attaches them to the event. This
   immediately fires a confirmation email to that judge, but the
   membership starts in `PENDING`, not active.
2. **Shareable joining link** — admin/organizer generates an
   event-specific invitation link and distributes it through whatever
   channel they like (email, chat, wherever). Anyone who already has a
   judge-track account and clicks it lands on an accept/decline screen for
   that specific event. This is **not** a signup mechanism — a person
   with no account cannot use this link to create one; they'd need an
   admin-created judge account first, through the normal path in 2.3.

**Invitation lifecycle**, modeled as fields on `EventMembership` rather
than a separate table (see Section 5):

- `invitationStatus`: `PENDING → ACCEPTED | DECLINED | EXPIRED`
- **Deadline: `event.eventStartsAt`.** A judge must accept or decline
  before the event actually starts. An invitation still `PENDING` at that
  timestamp automatically transitions to `EXPIRED` — this is a real,
  enforced state transition (checked server-side against the timestamp,
  same principle as every other deadline in this platform), not just a
  UI label.
- `EXPIRED` and `DECLINED` are tracked as **distinct** states from each
  other and from `PENDING` — an organizer needs to be able to tell "never
  responded" apart from "actively said no," since it changes whether
  re-inviting the same person is likely to work.
- **Only `ACCEPTED` rows grant any access** — assignment, scoring, or any
  judge-facing route for that event checks `invitationStatus: ACCEPTED`
  specifically, not merely "a membership row exists." A `PENDING` row must
  grant zero access even though it technically exists in the table.

**Organizer/admin-facing invitation dashboard**, per event:

- Full list of every invited judge with current status (`PENDING`,
  `ACCEPTED`, `DECLINED`, `EXPIRED`).
- **Resend** action available on `PENDING`, `DECLINED`, and `EXPIRED` rows
  — issues a fresh single-use hashed token (same pattern as email
  verification/session tokens — never store or transmit a reusable raw
  token), invalidates any prior outstanding token for that invitation, and
  resets the response clock implicitly (still bounded by the same
  `eventStartsAt` deadline — resending doesn't extend the deadline itself,
  it just gives the judge a fresh link to respond with before that same
  deadline).
- No resend action on `ACCEPTED` rows (nothing to resend).

---

## 4. Guard architecture (applies to every module after this one)

- A NestJS guard resolves the `eventId` from the request path, looks up
  the current session's `User`, and checks their `EventMembership` row(s)
  for **that specific event only** — never a global role flag.
- Route handlers declare their requirement declaratively, e.g.
  `@RequireEventRole(EventRole.ORGANIZER)` — the guard runs before the
  handler body executes. A request that fails never reaches business
  logic.
- **This is the only authorization path.** There is no separate "trust the
  frontend already checked" shortcut anywhere — every privileged route is
  protected at this layer regardless of which client or method (UI,
  direct API call, curl) the request came from.
- For judge-gated routes specifically, the guard checks not just role
  presence but `invitationStatus: ACCEPTED` — a `PENDING` judge
  membership must fail the same guard a non-member would fail.

### 4.1 `siteAdmin` bypass

- `siteAdmin: true` bypasses the per-event `EventMembership` check
  entirely — necessary for genuine platform-operator needs (fixing a
  stuck event, resolving a dispute, etc.).
- **Every bypass writes an `AuditLog` entry** explicitly noting a
  site-admin override occurred: which admin, which route, which event,
  when. The power exists because it's operationally necessary, but it is
  never silent.

---

## 5. Data model changes implied by this stage

- `User`: add account-track distinction. Simplest implementation: keep
  the existing `EventRole` enum for the *event-level* role a membership
  row carries, and represent the *account-level* track as a field directly
  on `User` (e.g. `accountType: PARTICIPANT | JUDGE | ORGANIZER`, set once
  at creation, never edited) — rather than inferring it from membership
  history, since account type must be knowable even before any
  `EventMembership` row exists for that user (e.g. right after an admin
  creates a judge account, before they're invited to anything).
  - Add `mustResetPassword: Boolean` for the forced first-login flow.
- `EventMembership`: extend with invitation lifecycle fields —
  `invitationStatus`, `invitedByUserId`, `invitedAt`, `respondedAt`, plus
  the hashed single-use token fields for the accept/decline link itself.
  **No `respondByAt` snapshot field.** Resolved in
  `03-event-management.md` Section 4: the invitation deadline is always
  computed live as `event.eventStartsAt` at check time, so an organizer
  editing the event's start date after invitations go out automatically
  moves the effective deadline for every still-`PENDING` invitation. An
  invitation already `EXPIRED`/`ACCEPTED`/`DECLINED` is unaffected by
  later edits, since that's a state transition that already happened.
- No separate `JudgeInvitation` table — folded into `EventMembership`
  directly, per the reasoning in Section 3.2, to avoid two tables
  representing the same relationship at different lifecycle stages.

---

## 6. What I'm testing for this module

- A participant-track account can never be granted JUDGE or ORGANIZER via
  any code path, including direct API manipulation attempts.
- Attempting to create a staff account with both roles, or to later edit
  an existing staff account's role, is rejected at the API level, not just
  hidden in the UI.
- The admin confirmation step is required before a staff account is
  actually persisted — a request that skips confirmation does not create
  the account.
- First login with a temp password can reach `set-password` and nothing
  else; every other route returns a specific "must reset password first"
  error, not a generic 403.
- Organizer added to an event has immediate, active access with no
  intermediate state.
- Judge added to an event starts `PENDING` and has **zero** access until
  `ACCEPTED` — verified by attempting a judge-only action while `PENDING`
  and confirming it's rejected identically to a non-member.
- An invitation not responded to by `eventStartsAt` transitions to
  `EXPIRED` automatically (tested by manipulating fixture timestamps, same
  approach as Module 3's event-timeline tests).
- Resend correctly invalidates the prior token and issues a new one; the
  old token no longer works after resend.
- `siteAdmin` bypass is logged every single time it's exercised, with
  enough metadata to answer "who did what, on which event, when" from the
  audit log alone.

---

## 7. Open questions

None outstanding. The snapshot-vs-live question previously listed here is
resolved — see Section 5's note and `03-event-management.md` Section 4.
