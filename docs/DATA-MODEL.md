# DATA-MODEL.md

The schema, table by table, and why each field exists. This is the
human-readable narrative version of `apps/api/prisma/schema.prisma`.

**Status note:** the schema described below is the cumulative target —
every decision locked through Module 5 (Submission Management).
`apps/api/prisma/schema.prisma` is built up **incrementally, stage by
stage**, matching each stage doc's own declared scope. **Modules 1, 2,
3, and 4 are implemented** (`User`, `Session`, `EventMembership`,
`AuditLog`, the full `Event` table including `maxTeamSize`, `Track`,
`Prize`, `Team`, `TeamMembership`). `Event` started as a deliberately
minimal anchor in Module 2 (D59) and Module 3 grew it additively to the
full shape below; Module 4 added `maxTeamSize` the same way (D75).
`trackAttachmentMode` (Module 5) is still deliberately absent, along
with `eventClosedAt` (voting, no locked stage doc yet). `Submission`
exists in the live schema only as a minimal anchor — `id`, `teamId`,
`everSubmitted`, `createdAt` (D75) — Module 5 is expected to extend it
additively to the full shape below, not redefine it. If the live schema
and a field documented here disagree **and the owning module has
already been implemented**, that's a bug, with the narrower exception
of `Submission`'s still-anchor-only fields noted above. Certificates and
voting are discussed extensively in `DECISIONS.md` but don't have a
finalized stage doc yet, so their tables are sketched here as
forward-looking and may still shift.

---

## 1. Identity

### `User`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `email` | string, unique | |
| `passwordHash` | string | argon2 |
| `displayName` | string | |
| `accountType` | enum: `PARTICIPANT \| JUDGE \| ORGANIZER` | Set once at creation, **never edited afterward** (Decision D9, D10) |
| `siteAdmin` | boolean | Orthogonal flag, separate from `accountType` |
| `mustResetPassword` | boolean | True for admin-created staff accounts until first password change |
| `emailVerifiedAt` | datetime, nullable | Only meaningful/required for `PARTICIPANT` accounts; drives voting eligibility later |
| `verificationTokenHash` / `verificationTokenExpiresAt` | string unique, nullable / datetime, nullable | Module 1. Hashed, never raw (D54). **Not cleared on successful verification** — `emailVerifiedAt` alone gates single-use/idempotent-replay behavior; overwritten (invalidating the previous token) on signup and on every resend. |
| `bannedAt` / `bannedReason` | nullable | Module 1. Checked at signup to reject a banned email outright. |
| `bannedByUserId` | nullable | **Deferred (D55)** — not yet in the Prisma schema; no ban-issuing endpoint exists in any locked stage doc yet, only the signup-time check above, which doesn't need it. Arrives with whichever module designs the actual ban action. |
| `createdAt`, `updatedAt` | datetime | `createdAt` is the account-age gate input for voting eligibility (D44) |

**Why `accountType` lives directly on `User` rather than being inferred
from membership history:** it must be knowable even before any
`EventMembership` exists (e.g. immediately after an admin creates a
judge account, before any invitation has happened).

### `Session`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | fk → User | |
| `tokenHash` | string, unique | Raw token is **never** stored — only its hash (D3) |
| `userAgent`, `ipHash` | nullable | For a future "your active sessions" view. `ipHash` is HMAC-keyed with `APP_SECRET` (D58), not a plain hash — an IP address is too low-entropy for an unkeyed hash to actually be one-way. `null` if `APP_SECRET` isn't configured, rather than a hash with no key. |
| `expiresAt`, `revokedAt` | datetime | Revocation is instant — deleting/marking a row invalidates it immediately |

---

## 2. Roles & Event Membership

### `EventMembership`

The single table every authorization guard checks. No global role field
is ever consulted for event-scoped actions.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | fk → User | |
| `eventId` | fk → Event | |
| `role` | enum: `PARTICIPANT \| JUDGE \| ORGANIZER` | Must match the user's `accountType` — a `PARTICIPANT`-track account can never hold a `JUDGE`/`ORGANIZER` membership row, enforced at the application layer |
| `trackIds` | string[] | Empty = all tracks (judge track-scoping) |
| `invitationStatus` | enum: `ACCEPTED \| PENDING \| DECLINED \| EXPIRED` | `ACCEPTED` immediately for organizer rows (D12); starts `PENDING` for judge rows |
| `invitedByUserId` | fk → User, nullable | |
| `invitedAt`, `respondedAt` | datetime, nullable | |
| **No `respondByAt` field** | — | Deadline is always computed live as `event.eventStartsAt` (D13) — never a stored snapshot |
| Invitation token fields | hashed, single-use | Same pattern as `Session`/email-verification tokens |

---

## 3. Events

### `Event`

**Implemented (Module 3).** `trackAttachmentMode` (Module 4) and
`maxTeamSize` (Module 5) are **not** in the Prisma schema yet — they
belong to the modules that actually consume them, same additive-growth
principle as `Event` itself (D59). `eventClosedAt` is also absent — it's
only used by voting-round-restart logic, which has no locked stage doc
yet. `phase` adds a synthetic `NOT_STARTED` value (D69) for a PUBLISHED
event sitting before `registrationOpensAt`, not named in the stage
doc's own phase list but required by its explicit "early hype, before
registration opens" supported use case (Section 8).

| Field | Type | Notes |
|---|---|---|
| `id`, `slug` (unique) | | Slug editable only while `status = DRAFT` (D17). Auto-generated from `name` if not given (D68). |
| `name`, `description` | markdown string, nullable | Sanitized on every render (D18), through `MarkdownService` — the same function for preview and production |
| `posterUrl`, `thumbnailUrl` | nullable | Local-disk-served, re-encoded on upload (D19, D71 — always re-encoded to JPEG regardless of input format) |
| `status` | enum: `DRAFT \| PUBLISHED \| ARCHIVED \| DELETED` | Manual, actor-controlled (D15). `DELETED` reachable from DRAFT or PUBLISHED, not ARCHIVED (D70). |
| ~~`trackAttachmentMode`~~ | — | **Not yet implemented** — Module 5's field, not Module 3's |
| ~~`minTeamSize`~~ | — | No such field; a team can be admin-only (D25) |
| `maxTeamSize` | int, default 4 | **Implemented (Module 4, D75).** Admin counts toward the total (D25) |
| Timeline fields (all `timestamptz`, UTC) | required at creation | `registrationOpensAt`, `registrationClosesAt`, `eventStartsAt`, `submissionsOpenAt`, `submissionsCloseAt`, `eventEndsAt`, `resultsAnnounceAt`, `votingOpensAt`, `votingClosesAt`, `votingWinnerAnnounceAt`. (`eventClosedAt` not yet implemented — voting's field, no locked stage doc.) |
| *(computed, not stored)* `phase` | `EventPhase \| null` | Derived from `now()` vs. the timeline fields on every read (D15); `null` for non-PUBLISHED, `NOT_STARTED` for PUBLISHED-but-pre-registration (D69) |

**Validation, enforced on every create and every edit** — see
`apps/api/src/events/utils/event-timeline.ts`:
```
registrationOpensAt < registrationClosesAt <= eventStartsAt
  < submissionsOpenAt < submissionsCloseAt <= eventEndsAt
  < resultsAnnounceAt < votingOpensAt < votingClosesAt
  < votingWinnerAnnounceAt
```
PUBLISHED adds two more rules per field: immutable once its own
boundary has passed, and never movable earlier than its current value
while still pending.

### `Track`

Implemented (Module 3). No delete — removal semantics are explicitly
unresolved in the stage doc (D74).

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `name` | string | Unique per event, not globally (`@@unique([eventId, name])`) |
| `description` | markdown, nullable | Same sanitized-render pattern as `Event.description` |

### `Prize`

Implemented (Module 3). No delete, same reasoning as `Track` (D74).

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `trackId` | nullable | Must belong to the same event — cross-event references rejected at the application layer |
| `name`, `rank` | | |
| `decidedBy` | enum: `JUDGES \| PUBLIC_VOTE` | The two prize tracks are computed by entirely different queries and revealed at different times (`resultsAnnounceAt` vs. `votingWinnerAnnounceAt`) |

---

## 4. Teams

**Implemented (Module 4).**

### `Team`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | A team belongs to exactly one event |
| `name` | string, **immutable after creation** | Unique per event (D21) |
| `adminUserId` | fk → User | Fixed, non-transferable (D22) — no `ownerId`-style field that implies transferability |
| `joinLinkPrefix` | string | `slugify(name)` alone, no added literal constant (D76) — derived once at creation, never regenerated since the name never changes |
| `joinLinkSuffix` | string, 6-digit | The actual rotating credential — changed on regenerate (D23), old value invalidated immediately |
| `createdAt` | | |

### `TeamMembership`

| Field | Type | Notes |
|---|---|---|
| `id`, `teamId`, `userId` | | |
| `joinedAt` | | |

No `isOwner` flag — admin status lives on `Team.adminUserId`, not as a
per-membership boolean, since it's a property of the team, not something
multiple members could hold simultaneously.

---

## 5. Submissions

**Narrative shape below is the Module 5 target. The live schema has
only a minimal anchor today** (`id`, `teamId`, `everSubmitted`,
`createdAt`) **— built ahead of schedule in Module 4 because the team
roster lock (D26) needs `everSubmitted` to read (D75).** Every other
field below (`submissionType`, `soloUserId`, `title`, `description`,
etc.) does not exist in the live schema yet; Module 5 adds them
additively.

### `Submission`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `submissionType` | enum: `SOLO \| TEAM` | |
| `teamId` | fk → Team, nullable | Populated only when `submissionType = TEAM` |
| `soloUserId` | fk → User, nullable | Populated only when `submissionType = SOLO` — exactly one of `teamId`/`soloUserId` is set, enforced at the application layer, never both, never neither (D28) |
| `title` | string | Required to `submit` |
| `description` | markdown | Required to `submit`; sanitized identically to Event/Track descriptions |
| `repoUrl`, `demoVideoUrl`, `liveUrl` | string, nullable | Validated for well-formedness only, not reachability |
| `trackIds` | string[] | Shape works for both `SINGLE` (constrained to length 1 at validation) and `MULTIPLE` modes |
| `isDraft` | boolean | The only flag distinguishing in-progress from finalized (D30) — toggled freely by `submit`/`unsubmit` |
| `everSubmitted` | boolean | **Permanent once true.** Set on first successful `submit`, never reset by `unsubmit` (D32). This, not `isDraft`, is what Module 4's team-roster lock (D26) checks. |
| `submittedAt` | datetime, nullable | Always the **most recent** submit timestamp — overwritten on every resubmit (D31) |

**Removed from an earlier draft:** `thumbnailUrl`, `SubmissionImage`
(gallery images), `techTags` (D27) — deliberately descoped for the
current stage; may be reintroduced additively in a later module.

### `RubricCriterion` — placeholder, not yet designed

Referenced in earlier drafts for organizer-defined custom questions and
weighted scoring criteria. Not part of the confirmed Module 5 field set
(no custom questions were included in this stage's fixed field list) —
will be properly specified once judging (Module 7+) or a
custom-questions module is designed.

---

## 6. Certificates (forward-looking — not yet a finalized stage doc)

Sketched here per the extensive discussion in `DECISIONS.md` D34-D40;
treat as directional, not locked, until a proper stage doc exists.

### `Certificate`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Unguessable, non-sequential by construction (D38) |
| `eventId`, `userId` | | |
| `role` | string | e.g. "participant", "judge", "winner" |
| `payloadJson` | json | The facts a signature is computed over — **never a rendered image** (D34) |
| `signature` | string | Ed25519 over `payloadJson` |
| `publicKeyId` | string | |
| `templateId`, `templateVersion` | fk, int | Snapshotted at issue time — a template edit bumps version and never retroactively changes an already-issued certificate's rendering basis |
| `issuedAt` | datetime | |

### `CertificateTemplate`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `svgMarkup` | text | **Sanitized on upload** (D36) — script tags, `on*` attributes, `foreignObject`, external references stripped via a real XML DOM parser |
| `version` | int | Bumped on every edit |

Rendering is never cached as a second source of truth — cache entries
(Redis, keyed `certificate:{id}:{templateVersion}:{format}`, per D37)
are disposable and fully reconstructable from `payloadJson` + template at
any time.

---

## 7. Voting (forward-looking — not yet a finalized stage doc)

Sketched per D41-D50; directional only.

### `VotingRound`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId`, `roundNumber` | | |
| `status` | enum: `ACTIVE \| SUPERSEDED \| DEACTIVATED` | |
| `deactivatedAt`, `deactivatedByUserId`, `deactivationReason` | | `deactivationReason` is **mandatory text**, not optional, on every restart (D49) |

### `Vote`

| Field | Type | Notes |
|---|---|---|
| `id`, `votingRoundId` | fk | One-vote constraint is scoped per round, not per event — a restart gives everyone a fresh vote (D49) |
| `submissionId`, `userId` | | Single-choice: exactly one submission per user per round (D42) — no `weight` field, since quadratic voting was dropped for public voting |
| `ipHash` | string | Always recorded regardless of access mode, for abuse review |

No public-facing field ever exposes who voted for what — only aggregate
percentage/count are surfaced post-publication (D46).

---

## 8. Audit

### `AuditLog`

**Implemented (Module 2):** `id`, `actorUserId` (fk → User),
`action` (string), `metadataJson` (json), `createdAt`. Append-only —
`AuditService.record()` is the only write path, and nothing ever
updates or deletes a row. Currently written by: `SITE_ADMIN_BYPASS`
(every `EventRoleGuard` bypass), `STAFF_ACCOUNT_CREATED`,
`ORGANIZER_ADDED`, `JUDGE_INVITED`, `JUDGE_INVITATION_RESENT`,
`JUDGE_INVITATION_ACCEPTED`/`_DECLINED`. Every privileged or destructive
action across every future module writes here too — role assignment,
invitation actions, voting round resets with their mandatory reason,
results publication. Never a bare `DELETE` anywhere in the schema
without a corresponding audit entry for context.

---

## 9. Import / export paths (brief requirement, tracked here as they're
decided)

- Event/Track/Prize descriptions are stored as markdown — directly
  exportable as plain text with no lossy HTML-to-text conversion needed.
- CSV export at every pipeline stage is a stated brief requirement;
  concrete field mappings will be added here once the export module is
  designed.
- Bulk import/export (T4) not yet designed.
