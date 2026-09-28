# Stage Spec: Voting

Status: **Design locked, not yet implemented.**
Depends on Module 1 (Auth, `emailVerifiedAt`), Module 2/User (`bannedAt`
by email), Module 3 (Event timeline), Module 7/8/9/10 (judge rankings,
for shortlist seeding). Most of this module's substance was decided
across many earlier messages (`DECISIONS.md` D41–D50) — this doc
consolidates that into one buildable spec and resolves two gaps that
only became visible once Module 10 (Results & Rankings) existed. If
code and this doc disagree, update this doc first.

---

## 1. Scope of this stage

- Eligibility modes, single-choice ballot, account-age gating.
- Self-hosted CAPTCHA/proof-of-work and IP-based abuse flagging.
- Shortlist curation and its reveal timing relative to judge results.
- Vote tallying, result hiding during voting, and post-publish
  visibility (aggregate only, never per-voter).
- Voting rounds: minor in-place corrections vs. full, zero-carryover
  restarts.
- The voting-results publish flow, reusing Module 10's pattern rather
  than inventing a new one.

Explicitly **not** in this stage: comments on gallery submissions
(a separate, smaller module).

---

## 2. Eligibility mode

Organizer-chosen, once, at the event level (not re-configurable per
round — a policy choice, not something expected to change mid-event):

- **`PARTICIPANTS_ONLY`** — only users with an `EventMembership` role
  `PARTICIPANT` on this event can vote.
- **`VERIFIED_PLATFORM_USERS`** — any user with `emailVerifiedAt` set
  can vote, participant or not.

**Always authenticated — no anonymous/open-link voting mode.** This was
narrowed during design from an earlier three-tier proposal
(open-link/email-gated/authenticated) down to these two, once the user
specified verified-only voting as the actual requirement (D43).

**Account-age gate, both modes:** `User.createdAt < event.eventStartsAt`
(D44) — anchored specifically to `eventStartsAt`, not
`registrationOpensAt` or `votingOpensAt`, to block accounts created
purely to farm a specific vote after the event's real timeline is
already underway. This check is against the fixed event timeline field,
not round-specific — unaffected by which voting round is currently
active.

---

## 3. Single-choice ballot

**One user, one pick, per voting round** (D42). No quadratic voting, no
multi-project approval — confirmed and locked. Quadratic voting was
explicitly evaluated and rejected for this purpose: it solves a
different problem (stopping a few real people from dominating via
concentrated influence) than the one this platform actually needs
solved (Sybil/multi-account resistance) — see D41. Bradley-Terry
pairwise mode (a separate bonus-challenge module) is unaffected by this;
that's a judge-side mechanism, not public voting.

**Uniqueness constraint:** one `Vote` row per `(votingRoundId, userId)`
— a user cannot vote twice in the same round, and voting again isn't
possible without a full round restart (Section 7).

---

## 4. Shortlist

- **Auto-suggested, organizer-adjustable** (D50): organizer sees every
  `APPROVED` submission ranked by the selected `NormalizationRun`'s
  `finalScore` (same run Module 10 used, or a freshly chosen one), sets
  a target range (e.g. "top 4–8"), the system pre-checks the top N as a
  suggestion, and the organizer freely adds/removes any submission
  before finalizing.
- **Locked once finalized for round 1** — becomes the ballot's
  candidate list, immutable except through Section 6's minor-correction
  or Section 7's full-restart mechanisms.
- **Reveal timing — resolved:** the shortlist becomes publicly visible
  the moment judge-decided results are published (i.e.
  `PublishedResultVersion.status: LIVE` exists for this event — reusing
  Module 10's exact visibility gate, not a separate timestamp check).
  This matches the original design intent ("announced at the same
  time" as judge winners) precisely, now expressed in terms of Module
  10's real publish mechanism rather than a raw timestamp, since
  publish is an explicit action that may lag `resultsAnnounceAt` under
  `MANUAL` mode.
- **Voting itself remains gated separately by `votingOpensAt`/
  `votingClosesAt`** — there can be a real gap between "shortlist is
  public knowledge" and "voting is actually open," which is expected
  and fine.

---

## 5. Anti-abuse

### 5.1 Self-hosted CAPTCHA / proof-of-work (D45)

- **Invisible proof-of-work on every vote submission**, always —
  a small computational puzzle the browser solves before the vote
  request is accepted. Imperceptible to a real human, but multiplies
  the cost of casting many fake votes since each burns real CPU time.
- **Visible image CAPTCHA, adaptive only** — surfaces only when a
  vote's abuse-signal score (Section 5.2) is already elevated. Most
  legitimate voters never see it.
- **No third-party CAPTCHA service** (no Google/hCaptcha) — required by
  the platform's own no-hosted-dependency rule, not just preference.

### 5.2 IP-based multi-account flagging (D47)

When a vote is cast, the system checks how many distinct verified
accounts have already voted in this round from the same `ipHash`.
Crossing a configurable threshold **flags** the vote (and implicated
accounts) for admin review — **never an automatic block or ban.**
Consistent with the "audit trail over automation" principle used
throughout this platform (Module 6's verification pipeline, Module 7's
reliability notes).

### 5.3 Admin review and banning (D48)

- Flagged votes/accounts appear in an admin-reviewable queue with the
  evidence (shared IP, timestamps, targets).
- Admin can ban an account **by email**, which also blocks
  **re-registration with that same email** — checked at signup, not
  just at login.

---

## 6. Minor in-place corrections — never affect cast votes

Cosmetic fixes only (a typo in a shortlisted project's displayed name,
a wrong-project swap correction) — **zero effect on votes already
cast, and zero effect on the vote count.** Every correction writes an
`AuditLog` entry (what changed, old/new value, who, when) — visible,
never silent. This is the lighter-weight alternative to Section 7's
full restart, for problems that don't actually compromise the integrity
of votes already recorded.

---

## 7. Full round restart — zero carryover, unlimited, fully audited

- **Window:** only actionable between `resultsAnnounceAt` and
  `eventClosedAt` (D49).
- Current `VotingRound.status → DEACTIVATED` — never deleted. Its votes
  remain permanently attached for audit but are fully excluded from any
  live tally or final result from that point forward.
- A new `VotingRound` (`roundNumber + 1`) starts **completely from
  scratch** — blank shortlist (not pre-populated from the dead round),
  organizer rebuilds it via the same ranked-list panel.
- **Eligibility and the one-vote constraint reset fully** —
  `(votingRoundId, userId)` uniqueness means every prior voter,
  including those who voted in a now-dead round, gets exactly one fresh
  vote in the new round.
- **No limit on number of restarts.** No warning threshold, fully
  organizer discretion.
- **Every restart requires a mandatory written reason** (non-empty,
  enforced at the API level) and is fully audit-logged — who
  deactivated which round, when, why, who created the replacement, and
  its finalized shortlist.

---

## 8. Results: hidden during voting, aggregate-only after publish

- **During an active round:** no participant, public visitor, or
  candidate submission's team can see vote counts or percentages at
  all — organizer/admin only.
- **After the voting-results publish action** (Section 9): the public
  sees **percentage and total vote count per submission** — never who
  voted for what. The per-voter breakdown (`Vote.userId` ↔
  `submissionId`) is never exposed publicly, at any stage, published or
  not — organizer/admin-only, via the audit-capable view.

---

## 9. Voting-results publish flow — reuses Module 10's pattern

Per Module 10's own note that this module "should reuse this module's
draft/publish/correction pattern rather than inventing a new one," this
follows the same shape, lighter-weight given voting has no scoring
pipeline to select a run from:

- A `VotingResultVersion` is the voting equivalent of
  `PublishedResultVersion` — `status: LIVE | SUPERSEDED |
  UNPUBLISHED`, never edited in place, only superseded.
- Tallying happens directly from `Vote` rows for the current (or a
  specified, if reviewing a past deactivated round for audit purposes)
  `VotingRound` — no separate computation/normalization step, since raw
  vote counts are the entire input.
- **Tie-break for the audience-choice winner, resolved directly by
  Claude rather than asked back:** tied vote counts **share** the win —
  no arbitrary tiebreaker (submission ID, timestamp, etc.), consistent
  with the "share rather than invent an arbitrary tiebreaker" philosophy
  already established for judge-prize ties (D132, D140).
- Visibility gated the same way as Module 10: participants see nothing
  until a `VotingResultVersion` reaches `status: LIVE`, independent of
  `EventPhase` reaching `VOTING_WINNER_ANNOUNCED`.
- Post-publish correction (disqualify a winner, adjust which submission
  is credited) follows the identical mandatory-reason,
  new-version-per-correction, fully-audited pattern as Module 10,
  Section 7 — not re-derived here in full detail; same rules apply.

---

## 10. Data model

### `VotingRound`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId`, `roundNumber` | | |
| `status` | enum: `ACTIVE \| SUPERSEDED \| DEACTIVATED` | |
| `votingOpensAt`, `votingClosesAt`, `votingWinnerAnnounceAt` | datetime | Round 1 initializes from the event's original timeline fields; a restart round gets fresh organizer-set values at creation time |
| `deactivatedAt`, `deactivatedByUserId`, `deactivationReason` | | `deactivationReason` mandatory, non-empty |
| `createdByUserId`, `createdAt` | | |

### `ShortlistEntry`

| Field | Type | Notes |
|---|---|---|
| `id`, `votingRoundId`, `submissionId` | | |
| `addedByUserId`, `isAutoSuggested` | | Provenance only — no behavioral difference downstream |

### `Vote`

| Field | Type | Notes |
|---|---|---|
| `id`, `votingRoundId`, `submissionId`, `userId` | | Unique on `(votingRoundId, userId)` — single-choice, one per round |
| `ipHash` | string | Always recorded, regardless of eligibility mode, for abuse review |
| `createdAt` | | |

### `VoteAbuseFlag`

| Field | Type | Notes |
|---|---|---|
| `id`, `votingRoundId`, `ipHash` | | |
| `implicatedUserIds` | string[] | Accounts sharing the flagged IP pattern |
| `status` | enum: `PENDING \| REVIEWED_CLEARED \| REVIEWED_BANNED` | |
| `reviewedByUserId`, `reviewedAt` | | |

### `VotingResultVersion`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId`, `votingRoundId`, `versionNumber` | | |
| `status` | enum: `LIVE \| SUPERSEDED \| UNPUBLISHED` | |
| `correctionReason`, `unpublishReason` | text, nullable | Required when applicable, same pattern as Module 10 |

### `VotingResultEntry`

| Field | Type | Notes |
|---|---|---|
| `id`, `votingResultVersionId`, `submissionId` | | |
| `voteCount`, `votePercentage` | int, float | |
| `isSharedWin` | boolean | True if resolved via the vote-count tie-share (Section 9) |
| `isDisqualified` | boolean | Post-publish correction only |

### `User` — CAPTCHA/PoW challenge state

Not a Postgres table — short-lived proof-of-work and image-CAPTCHA
challenges are stored in **Redis** with a short TTL, matching the
pattern already established for other ephemeral tokens in this
platform's infrastructure (`ARCHITECTURE.md` §2). No new Postgres
schema needed for this piece.

---

## 11. What I'm testing for this module

- A user below the account-age gate (`createdAt >= eventStartsAt`)
  cannot cast a vote, regardless of eligibility mode.
- A `PARTICIPANTS_ONLY` event rejects a vote from a verified but
  non-participant user; `VERIFIED_PLATFORM_USERS` accepts it.
- A second vote attempt by the same user in the same round is rejected
  — the unique `(votingRoundId, userId)` constraint holds.
- The shortlist becomes visible exactly when
  `PublishedResultVersion.status: LIVE` exists — not before, and not
  gated by `votingOpensAt` separately.
- A vote cast before `votingOpensAt` or after `votingClosesAt` for the
  active round is rejected, server time only.
- Minor corrections (Section 6) never alter `Vote` rows or counts —
  verified by making a correction and confirming the tally is
  byte-for-byte unchanged.
- A full restart (Section 7): the old round's votes are excluded from
  the new round's tally entirely; a user who voted in the dead round can
  vote again in the new one; the new round's shortlist starts empty, not
  pre-populated.
- Restart is rejected outside the `[resultsAnnounceAt, eventClosedAt]`
  window; rejected without a non-empty `deactivationReason`.
- During an active round, no tally/percentage endpoint returns any
  number to a non-organizer/admin caller.
- After publish, the public sees percentage/count only — no endpoint,
  export, or admin-only-intended field ever leaks per-voter data to a
  participant-facing response.
- A tied vote count at the top produces a shared-win result
  (`isSharedWin: true` on both entries), not an arbitrary tiebreak.
- IP-flagged votes never auto-block; they appear in the admin queue and
  the vote itself still counts unless/until an admin acts on it.
- A banned email cannot be used to create a new account, verified by
  attempting signup with a previously-banned address.

---

## 12. Open questions

None blocking. Two resolutions made directly by Claude rather than
re-confirmed line-by-line with the user, both flagged inline above:

1. **Shortlist reveal tied to Module 10's publish gate**
   (`PublishedResultVersion: LIVE`), not a raw timestamp — the more
   precise reading of "announced at the same time" now that Module 10's
   real publish mechanism exists.
2. **Vote-count ties share the win**, consistent with the established
   share-rather-than-arbitrarily-tiebreak philosophy from Modules 10
   (D132, D140).
