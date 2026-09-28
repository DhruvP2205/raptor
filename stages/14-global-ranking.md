# Stage Spec: Global Ranking

Status: **Design locked, not yet implemented.**
Depends on Module 1 (Auth, `User.email`/`emailVerifiedAt`), Module 10
(Results & Rankings — `RankResultEntry`, `SpecialAwardResultEntry`),
Module 11 (Voting — `VotingResultEntry`). Inspired by a real reference
implementation (Hackathon Raptors' own `rank.raptors.dev`), whose public
JSON feed was inspected directly during design — see `DECISIONS.md` for
what was adopted, adapted, or deliberately not replicated. If code and
this doc disagree, update this doc first.

---

## 1. Scope of this stage

- A platform-wide, cross-event leaderboard aggregating points earned
  from published results.
- An admin-configurable points table (not a hardcoded constant).
- Which award kinds count toward points in this version, and which are
  deliberately deferred alongside the (shelved) Write-up module.
- The global tie-break cascade — distinct from any single event's
  tie-break cascades (Modules 10/11).
- Identity linking across a person's history on this platform: automatic
  email matching now, with anything unmatched pointed to a plain
  "contact an admin" note (no claim/linking tooling built yet).
- The cached, paginated, snapshot-based read architecture — this view
  must never recompute a full cross-event aggregate on every request.

Explicitly **not** in this stage: the Write-up module itself (shelved),
historical/pre-platform event backfill (that's the separate Import/
Export module's responsibility — this module only needs to *display*
whatever that module produces, once linked to a real account).

---

## 2. What counts toward points, in this version

| Source | Counts? | Points (default) |
|---|---|---|
| Podium — 1st (`RankResultEntry.rank = 1`) | Yes | 10 |
| Podium — 2nd | Yes | 6 |
| Podium — 3rd | Yes | 4 |
| Special award (`SpecialAwardResultEntry`, Module 10/8) | Yes | 2 |
| Audience-choice voting win (`VotingResultEntry`, Module 11) | Yes | 2 |
| Write-up placement ("side quest") | No — deferred with the Write-up module | — |
| Honourable mention | No — deferred alongside Write-up; the one example seen in the reference data was itself write-up-specific | — |

**Shared/tied positions all receive the same points** — e.g. two
submissions dense-ranked at 2nd (Module 10, Section 3) both earn the
full 2nd-place point value, not a split. This falls out naturally from
reusing `RankResultEntry.rank` directly rather than inventing a separate
ranking concept for this module.

**Only published results count.** A `RankResultEntry`/
`SpecialAwardResultEntry` only contributes once its
`PublishedResultVersion` reaches `status: LIVE` (Module 10); a
`VotingResultEntry` only contributes once its `VotingResultVersion`
reaches `status: LIVE` (Module 11). An event whose results were never
published contributes nothing — matching the reference implementation's
own stated behavior ("N further events published no results and are not
on the board").

**Disqualification and prize reallocation follow the exact rule already
locked in Module 10** — a removed/disqualified entry simply disappears
from points; nothing above it is re-ranked, nothing is reallocated. No
new policy needed here; this module inherits it directly.

---

## 3. Points table — admin-configurable, platform-wide

`GlobalPointsConfig` — one row per award kind, editable by admin at any
time (not per-event, not per-organizer — one table governs the whole
platform instance):

| `awardKind` | Default points |
|---|---|
| `PODIUM_FIRST` | 10 |
| `PODIUM_SECOND` | 6 |
| `PODIUM_THIRD` | 4 |
| `SPECIAL_AWARD` | 2 |
| `AUDIENCE_CHOICE` | 2 |

A points-table edit does **not** retroactively rewrite historical
snapshots (Section 6) — it takes effect on the *next* recompute, same
principle as every other "don't silently mutate a past, real record"
rule in this platform.

---

## 4. Tie-break cascade — adopted directly from the reference
implementation

For the global leaderboard specifically (distinct from any single
event's own tie-break rules):

1. Higher total points wins outright.
2. Still tied -> more 1st-place finishes wins.
3. Still tied -> more 2nd-place finishes wins.
4. Still tied -> more 3rd-place finishes wins.
5. Still tied -> more events entered wins.
6. Still tied -> whoever's `first_event`/`first_date` on this platform is
   earliest wins.
7. **Still tied after all of that -> dense-ranked shared position**, same
   "share rather than invent an arbitrary tiebreaker" philosophy already
   used throughout (Module 10, D132/D140) — a true, complete tie gets a
   shared rank with a visible marker (`=`), never a coin-flip ordering.

---

## 5. Identity linking

### 5.1 Email matching — automatic, no review

If an imported historical record (via the separate Import/Export
module) carries an email that exactly matches an existing, verified
`User.email`, it links automatically. **Safe with zero self-assertion
risk** — this isn't a claim a user types; it's their own already-verified
account happening to match a record that was itself associated with
that same email at the time.

### 5.2 Everything else — a plain note, no feature built yet

For any historical record that doesn't auto-match by email (a changed
email address, a different email used at the time, etc.), the profile
simply displays a short line: **"Don't see one of your past projects?
Contact an admin to have it linked to your account."** No in-app claim
flow, no self-service search-and-claim screen, no admin-side tooling to
action the request — this is intentionally just informational text for
now.

**This was a real design walk-back, not the original plan** — earlier
drafts of this module explored both a full Discord OAuth-based linking
flow and a generic self-service "claim a record" screen with
corroboration checks. Both were dropped once it became clear that
automatic email matching already covers the primary case, and building
either alternative added real cost (a new OAuth integration and
secret, or a new claim/corroboration subsystem) to correctly handle
what turned out to be a narrow remaining slice. The plain "contact
admin" note covers that slice honestly, with zero new code, until
there's a real, demonstrated need to build something more automated —
at which point the actual admin-side tooling (a queue, a claim review
screen, whatever shape it takes) is deferred to a future module, not
designed here.

---

## 6. Snapshot-based read architecture — cached and paginated, never
computed live per request

**The leaderboard is never computed fresh on a page load.** A
`GlobalRankingSnapshot` is generated by a background job (reusing the
`worker` container already in this platform's architecture,
`ARCHITECTURE.md` Section 4) and every read serves from the latest
snapshot, cached, paginated.

- **Recompute triggers:** automatically whenever a relevant result goes
  `LIVE` (a `PublishedResultVersion` or `VotingResultVersion`
  transition, Modules 10/11), **plus** a manual "recompute now" admin
  action for other cases that should reflect immediately rather than
  waiting for the next event's results.
- **Pagination:** the leaderboard API is paginated (page/limit query
  params), never returns the full person list in one response — this
  matters at real scale (the reference implementation already tracks
  100+ people; a growing platform instance easily exceeds that).
- **Per-person drill-down** (the "click any row to see every award
  behind the number" interaction) is a separate, on-demand query keyed
  by `userId` against the current snapshot — not embedded in the
  paginated list response, keeping that response small.
- **Caching:** the current snapshot's paginated pages are cached in
  Redis, invalidated on the next recompute — same infrastructure already
  used for certificate rendering (Module 12) and CAPTCHA state (Module
  11), no new piece of infra introduced.

---

## 7. Data model

### `GlobalPointsConfig`

| Field | Type | Notes |
|---|---|---|
| `awardKind` | enum: `PODIUM_FIRST \| PODIUM_SECOND \| PODIUM_THIRD \| SPECIAL_AWARD \| AUDIENCE_CHOICE` | Unique |
| `points` | int | Admin-editable |
| `updatedByUserId`, `updatedAt` | | |

### `GlobalRankingSnapshot`

| Field | Type | Notes |
|---|---|---|
| `id`, `generatedAt` | | |
| `isCurrent` | boolean | Exactly one snapshot is current at a time; prior ones retained for audit/history, never deleted |
| `triggeredByUserId`, `triggerReason` | fk, text, nullable | Null for automatic result-publish triggers; set for a manual admin recompute |

### `GlobalRankingEntry` — one per person per snapshot

| Field | Type | Notes |
|---|---|---|
| `id`, `snapshotId`, `userId` | | |
| `points`, `prizeUsdTotal` | int | `prizeUsdTotal` shown in full per team member, never split by team size |
| `eventsCount`, `awardsCount` | int | |
| `firstsCount`, `secondsCount`, `thirdsCount` | int | Feeds the tie-break cascade (Section 4) |
| `firstEventId`, `firstEventDate` | | Also feeds the tie-break cascade |
| `rank`, `isTied` | int, boolean | Dense ranking, shared positions marked |

### `GlobalRankingAwardDetail` — the drill-down, one per award per
snapshot entry

| Field | Type | Notes |
|---|---|---|
| `id`, `globalRankingEntryId` | | |
| `eventId`, `submissionId` | | |
| `awardKind` | enum, matches `GlobalPointsConfig.awardKind` | |
| `label`, `teamName`, `projectName` | string | |
| `finalScore`, `prizeUsd`, `pointsAwarded` | | |

---

## 8. What I'm testing for this module

- A `RankResultEntry` / `SpecialAwardResultEntry` / `VotingResultEntry`
  only contributes points once its version reaches `LIVE` — verified by
  confirming a draft/unpublished result contributes zero points to any
  snapshot.
- Editing `GlobalPointsConfig` does not alter already-generated
  snapshots — only the next recompute reflects the new values.
- Two dense-ranked submissions tied at 2nd both receive full
  `PODIUM_SECOND` points, not a split.
- The full tie-break cascade resolves correctly through all six levels
  before falling to a shared position, tested with a fixture
  constructed to tie at each successive level.
- An imported historical record with a verified-matching email links
  automatically, with no review step.
- A historical record that does **not** match any account's email
  contributes nothing until manually linked by an admin through a
  future, not-yet-built process — no in-app claim endpoint exists to
  test in this stage, only the static "contact an admin" text on the
  profile.
- The leaderboard endpoint is paginated — requesting page 1 never
  returns the full person list regardless of platform size.
- A recompute (automatic or manual) creates a new `GlobalRankingSnapshot`
  and flips `isCurrent`; the previous snapshot remains queryable, not
  deleted.
- Disqualifying a submission after its results were already counted in
  a snapshot does not retroactively re-rank other entries in *that*
  snapshot — it's reflected only from the next recompute onward, same
  "corrections produce a new version, never mutate history" principle
  used in Module 10.

---

## 9. Open questions

None blocking. Two items explicitly shelved by the user rather than
deferred as an oversight:

1. **The Write-up module** and its associated "side quest" /
   "honourable mention" award kinds — confirmed absent from the
   Dogfood brief itself, kept aside for a possible future discussion.
   `GlobalPointsConfig`/`GlobalRankingAwardDetail`'s `awardKind` enum is
   structured so adding those kinds later is additive, not a redesign.
2. **Any identity-linking mechanism beyond automatic email matching**
   (Discord OAuth, a self-service claim-and-corroborate screen, admin
   review tooling) — explored in depth during design and deliberately
   walked back once it became clear email matching already covers the
   primary case and every alternative added real cost for a narrow
   remaining slice. A plain "contact an admin" note covers that slice
   for now. Revisit only once there's a demonstrated real need, not
   speculatively.
