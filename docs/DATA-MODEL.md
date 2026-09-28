# DATA-MODEL.md

The schema, table by table, and why each field exists. This is the
human-readable narrative version of `apps/api/prisma/schema.prisma`.

**Status note:** the schema described below reflects every decision
locked through Module 5 (Submission Management) plus the account-model
changes from Module 2. The `schema.prisma` file currently in the repo
predates several of these decisions (it still has thumbnail/image
fields, tech tags, a two-role-per-account model, etc. from an earlier
draft) and **must be rewritten to match this document before
implementation starts** — this document is authoritative; the Prisma
file is not yet caught up to it. Certificates and voting are discussed
extensively in `DECISIONS.md` but don't have a finalized stage doc yet,
so their tables are sketched here as forward-looking and may still
shift.

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
| `bannedAt` / `bannedReason` / `bannedByUserId` | nullable | Banning is by account, but signup also checks banned *emails* so a ban blocks re-registration too |
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
| `userAgent`, `ipHash` | nullable | For a future "your active sessions" view |
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

| Field | Type | Notes |
|---|---|---|
| `id`, `slug` (unique) | | Slug editable only while `status = DRAFT` (D17) |
| `name`, `description` | markdown string | Sanitized on every render (D18) |
| `posterUrl`, `thumbnailUrl` | nullable | Local-disk-served, re-encoded on upload (D19) |
| `status` | enum: `DRAFT \| PUBLISHED \| ARCHIVED \| DELETED` | Manual, actor-controlled (D15) |
| `trackAttachmentMode` | enum: `NONE \| SINGLE \| MULTIPLE` | Drives the submission form's track field (D29) |
| `minTeamSize` — **removed** | — | No such field; a team can be admin-only (D25) |
| `maxTeamSize` | int | Organizer-configurable, admin counts toward the total |
| Timeline fields (all `timestamptz`, UTC) | | `registrationOpensAt`, `registrationClosesAt`, `eventStartsAt`, `submissionsOpenAt`, `submissionsCloseAt`, `eventEndsAt`, `resultsAnnounceAt`, `votingOpensAt`, `votingClosesAt`, `votingWinnerAnnounceAt`, `eventClosedAt` |
| *(computed, not stored)* `phase` | enum | Derived from `now()` vs. the timeline fields on every read (D15) |

**Validation, enforced on every create and every edit:**
```
registrationOpensAt < registrationClosesAt <= eventStartsAt
  < submissionsOpenAt < submissionsCloseAt <= eventEndsAt
  < resultsAnnounceAt < votingOpensAt < votingClosesAt
  < votingWinnerAnnounceAt
```

### `Track`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `name` | string | Unique per event, not globally |
| `description` | markdown | |

### `Prize`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `trackId` | nullable | |
| `name`, `rank` | | |
| `decidedBy` | enum: `JUDGES \| PUBLIC_VOTE` | The two prize tracks are computed by entirely different queries and revealed at different times (`resultsAnnounceAt` vs. `votingWinnerAnnounceAt`) |

---

## 4. Teams

### `Team`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | A team belongs to exactly one event |
| `name` | string, **immutable after creation** | Unique per event (D21) |
| `adminUserId` | fk → User | Fixed, non-transferable (D22) — no `ownerId`-style field that implies transferability |
| `joinLinkPrefix` | string | Derived once from the slugified name at creation; never regenerated since the name never changes |
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

Append-only. Every privileged or destructive action across every module
writes here — role assignment, invitation actions, `siteAdmin` bypasses
(D14), voting round resets with their mandatory reason, results
publication. Never a bare `DELETE` anywhere in the schema without a
corresponding audit entry for context.

---

## 9. Import / export paths (brief requirement, tracked here as they're
decided)

- Event/Track/Prize descriptions are stored as markdown — directly
  exportable as plain text with no lossy HTML-to-text conversion needed.
- CSV export at every pipeline stage is a stated brief requirement;
  concrete field mappings will be added here once the export module is
  designed.
- Bulk import/export (T4) not yet designed.
