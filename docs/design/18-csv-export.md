# Stage Spec: CSV Export

Status: **Implemented and live-verified.** Two schema-checked
corrections applied after implementation (Sections 4 and 13, below —
a nonexistent `TeamMembership.isAdmin` field and an assumed-structured
`AuditLog` that's actually free-form JSON). Also surfaced and fixed a
real Module 16 bug in the process — see that module's own corrected
Section 3 entry. All 8 organizer exports and 4 admin exports verified
against a live, fixture-seeded portal; role/event isolation confirmed
on both tiers; 457/457 tests passing platform-wide.
Backend, continuing the sequence after the auth-header bootstrap
(Module 17). Satisfies two separate things at once: the brief's stated
T2 requirement ("CSV export at every stage") and one of the seven
mechanical checks (`run.py`'s `csv_export` check, T2). If code and
this doc disagree, update this doc first.

**Revision note:** the first version of this doc picked four exports
without systematically checking what every other module actually
produces, and treated "organizer" and "admin" as the same scope. Both
were real gaps — an organizer only ever sees *their* event; an admin
can see everything, including data that spans or sits entirely outside
any single event (the global leaderboard, the audit log, every event
at once). This version surveys all seventeen other modules for what's
genuinely exportable and splits scope into two real tiers rather than
one flat list.

---

## 1. Scope — two tiers, not one

**Organizer tier** — scoped to one event the caller organizes,
`EventRoleGuard`, same as every other organizer tool in this
platform. Eight exports (Sections 3–10).

**Admin tier** — `siteAdmin` only, platform-wide or cross-event data
that doesn't belong to any single organizer's view. Four exports
(Sections 11–14). Every admin-tier export call writes an `AuditLog`
entry — the same "power exists, but it's never invisible" rule
already governing every other `siteAdmin` bypass in this platform
(`ARCHITECTURE.md` §6), applied here because platform-wide exports are
exactly the kind of action worth a permanent record of who pulled what,
and when.

All exports: one GET route each, `Content-Type: text/csv`, a full
dump every time — no pagination, for the same reason given in the
first version of this doc (an export is a one-shot download, not a
browsable list).

---

## 2. Which export the checker points at, and why

**Submissions** (Section 6), unchanged from the first version — the
spec page's own framing reads most naturally as the judging-adjacent
export an organizer would reach for first, even though `run.py`'s
actual assertion (Section 16) would be satisfied by any export in
either tier.

---

## Organizer tier — scoped to one event

## 3. Registrations

One row per registered participant.

| Column | Source |
|---|---|
| Name | `User.displayName` |
| Email | `User.email` |
| Registered At | `EventMembership.createdAt` |
| Team | `Team.name`, or the literal string `"Not yet on a team"` |

## 4. Teams

One row per team.

| Column | Source |
|---|---|
| Team Name | `Team.name` |
| Admin Name / Email | **Corrected — checked against the real schema, not assumed.** This doc originally named a nonexistent `TeamMembership.isAdmin` field. The real source is `Team.adminUserId`, a direct reference on the team itself, not a flag on the membership row. |
| Member Count | Count of `TeamMembership` rows |
| Member Emails | Semicolon-joined inside one CSV-quoted field |
| Has Submission | `Submission.everSubmitted` |
| Created At | `Team.createdAt` |

## 5. Judges and assignment load (new)

Surveying Module 7 turned up a real gap: nothing let an organizer
export who's judging what, or how balanced the load actually is,
outside of looking at the live assignment board screen by screen.

One row per judge.

| Column | Source |
|---|---|
| Judge Name / Email | `User.displayName` / `email` |
| Assigned | Count of `JudgeAssignment` rows for this event |
| Completed | Count where `status: COMPLETED` |
| Limit | `EventMembership.projectLimitOverride`, or the event-wide `maxProjectsPerJudge` if no override |
| Reliability Note | The judge's `JudgeReliabilityNote`, if any exists (Module 7) — organizer-visible already on the live board, so exporting it isn't a new disclosure |

## 6. Submissions

One row per submission. (The checker's target — Section 2.)

| Column | Source |
|---|---|
| Title | `Submission.title` |
| Team | `Team.name` |
| Track | `Track.name`, or blank |
| Repo / Demo / Live URL | `Submission.repoUrl` / `demoVideoUrl` / `liveUrl`, blank if unset — a genuine absence stays a blank cell here, unlike Module 16's fixture-import placeholders |
| Status | `Draft` / `Submitted` |
| Submitted At | `Submission.submittedAt` |
| Verification Check / Decision | `SubmissionVerification.checkStatus` / `finalDecision` |

## 7. Scores

One row per submission, current state regardless of publish status —
an organizer needs to see in-progress judging before it's ready to
publish, so this is never gated the way the public results page is.

| Column | Source |
|---|---|
| Title / Team / Track | As above |
| Average Raw Score | Current `averageRawTotal`, `COMPLETED` assignments only |
| Normalized Score | Most recent `NormalizedScore.finalScore`, blank if no run yet |
| Rank | **Gated** — present only once `PublishedResultVersion` is `LIVE`; a draft rank can still shift, so it stays blank until it's actually final, unlike every other column here |
| Reviews Completed / Assigned | e.g. `"4/5"` |
| Special Award Nominations | Semicolon-joined, or blank |

## 8. Normalization comparison (new)

Distinct from Section 7's snapshot — this is the raw-vs-normalized-vs-
rank-movement comparison Module 9 already computes internally for its
own review screen, exported here rather than only ever viewable one
run at a time in the UI. **This export doubles as a real, concrete
piece of evidence for the Normalization Proof bonus challenge** — the
brief asks to show the raw scores, the normalized scores, and the
resulting ranking change, and that's exactly this table's shape.

One row per submission, per normalization run (an organizer exporting
this after several runs gets the full history, not just the latest).

| Column | Source |
|---|---|
| Run Timestamp | `NormalizationRun.createdAt` |
| Title / Team | As above |
| Average Raw Score | This run's input |
| Normalized `finalScore` | This run's output |
| Rank (raw order) / Rank (normalized order) | Computed at export time from both score columns — the "movement" the bonus challenge asks to demonstrate |

## 9. Voting results (new)

Only meaningful once a voting round has actually closed — Module 11's
own rule (vote tallies hidden until then) applies here identically;
this export isn't a backdoor around that gate, it simply has nothing
to show before the gate opens.

One row per shortlisted submission, per round.

| Column | Source |
|---|---|
| Round | Which voting round this belongs to |
| Title / Team | As above |
| Vote Count | From the closed round's tally |
| Percentage | Vote count over total votes cast that round |
| Won | Boolean, including a shared-win case rendered as `true` for every tied winner — never an arbitrary single "winner" where the platform's own rule says the position is shared |

## 10. Certificates issued (new)

One row per certificate, not per person — Module 12 already allows
multiple certificate rows per person per event (participant + winner,
say), and collapsing that back to one row per person would lose real
information a real export shouldn't hide.

| Column | Source |
|---|---|
| Recipient Name | `User.displayName` at issuance |
| Role | `PARTICIPANT` / `JUDGE` / `WINNER` / `SPECIAL_AWARD_WINNER` |
| Issued At | Certificate creation timestamp |
| Certificate ID | For cross-reference against the public certificate-view page |

---

## Admin tier — platform-wide or cross-event

## 11. All events (new)

One row per event on the platform, regardless of which organizer runs
it — genuinely cross-event, which is exactly why this can't live in
the organizer tier at all; no single organizer has visibility into
events they don't run, by design (`EventRoleGuard`), and this export
correctly doesn't try to route around that for anyone but an admin.

| Column | Source |
|---|---|
| Event Name / Slug | `Event.name` / `slug` |
| Status / Phase | `Event.status`, computed `EventPhase` at export time |
| Organizer(s) | Names of every `EventMembership` with `role: ORGANIZER` |
| Registrations / Teams / Submissions | Counts |
| Created At | `Event.createdAt` |

## 12. Global Ranking (new)

The full platform leaderboard (Module 14) as a CSV — genuinely
platform-wide already by that module's own design, not scoped to any
event at all, so it was never going to fit the organizer tier
regardless of how the other exports were organized.

One row per person on the leaderboard.

| Column | Source |
|---|---|
| Rank | `GlobalRankingEntry.rank`, ties rendered identically to how the public leaderboard shows a shared position |
| Name | `User.displayName` |
| Points / Firsts / Seconds / Thirds / Events | `GlobalRankingEntry` fields |

## 13. Audit log (new)

For dispute review and general accountability — the single export in
this whole module most directly tied to why `AuditLog` exists at all
(`ARCHITECTURE.md` §6's "the power exists, but it's never invisible"
principle only actually holds if the log can be gotten *out* when
someone needs to review it, not just accumulated invisibly forever).

One row per audit entry, filterable by date range via query params on
the same route (the one export in this module where a full,
unfiltered dump could plausibly be enormous on a long-running
instance — a filter here is a genuine necessity, not a convenience).

| Column | Source |
|---|---|
| Timestamp | `AuditLog.createdAt` |
| Actor | The acting `User`'s name/email, from `actorUserId` |
| Action | `AuditLog.action` |
| Target | **Corrected — checked against the real schema, not assumed.** This doc originally implied `AuditLog` has dedicated structured columns for target/reason — it doesn't; the table only has `actorUserId`, `action`, and a free-form `metadataJson`. This column is a best-effort key extraction from that JSON (e.g. `metadataJson.eventId` or `.submissionId`, whichever key happens to be present for that action type), not a guaranteed structured read — flagged as such in the export itself (a literal `"(unavailable)"` cell) when no recognizable key exists in a given entry's metadata, rather than silently leaving a blank that reads as "nothing happened here." |
| Reason | Same best-effort extraction, from whichever `metadataJson` key holds the mandatory-reason text for that action type, with the same `"(unavailable)"` fallback |

**Verified, and worth noting the direction of this one explicitly: the
doc was right, the first implementation pass hadn't caught up to it
yet.** The initial build returned an empty string for unresolvable
entries instead of the literal `"(unavailable)"` fallback specified
above — fixed to match the doc rather than the doc being changed to
match the code, the reverse of how the last few corrections in this
project went. Confirmed live against real audit-log entries: actions
with no resolvable metadata key (`STAFF_ACCOUNT_CREATED`,
`GITHUB_TOKEN_ADDED`) now correctly show `(unavailable)` in both
columns; actions that do have one (`SUBMISSION_SUBMITTED`) still
resolve normally.

## 14. Platform user directory (new, and the one export here that
needed real caution before deciding to include it at all)

Every `User` on the platform, one row each — considered carefully
before including, since this is meaningfully more sensitive than any
single event's participant list: it's every email address the
platform has ever collected, in one file, exportable by a single
request. **Included, but admin-only with no exception, and every call
logged with the same weight as any other admin bypass** — an admin
already has this data's equivalent via direct database access on a
self-hosted instance, so this export doesn't grant new access, it
just makes existing access more convenient, and that convenience is
exactly why the audit trail on it matters more than usual, not less.

| Column | Source |
|---|---|
| Name / Email | `User.displayName` / `email` |
| Account Type | `PARTICIPANT` / `JUDGE` / `ORGANIZER` / etc. |
| Created At | `User.createdAt` |
| Email Verified | Boolean |

---

## 15. Format details, the same across every export in both tiers

- RFC 4180-style quoting via a standard CSV library, never hand-rolled
  string joining.
- UTF-8, header row on every export, every time.
- Streamed rather than fully buffered in memory before sending.

---

## 16. What I'm testing for this module

- Every organizer-tier route, called as that event's organizer,
  returns `200` with a real CSV; called as a judge, participant, or
  an organizer of a *different* event, is refused — the last case
  specifically, since "wrong event" is a distinct failure mode from
  "wrong role" and both need their own test, matching the isolation-
  testing discipline already established across every other module.
- Every admin-tier route is refused for anyone who isn't `siteAdmin`,
  including an event's own organizer — organizing an event grants no
  access to platform-wide data, ever.
- Every admin-tier call writes exactly one `AuditLog` entry.
- The Scores export's Rank column is blank pre-publish, populated the
  moment results go `LIVE`.
- The Normalization Comparison export, run against an event with
  multiple normalization runs, returns one row set per run, not just
  the latest — the full history, not a snapshot.
- The Voting Results export returns nothing (an empty, header-only
  CSV) for a round that hasn't closed yet, and correctly marks every
  tied winner as `true` rather than picking one arbitrarily.
- The Certificates export returns multiple rows for a person who
  holds more than one certificate for the same event.
- The `csv_export` route named in `.dogfood.toml` (Submissions,
  Section 2) satisfies `run.py`'s actual assertion precisely: `200`
  and a comma on the first line.
- Calling any organizer-tier export on a brand-new event with zero
  data yet returns a valid, header-only CSV, not an error.

---

## 17. Open questions

None blocking. One thing worth a second look once real usage exists:
whether Section 13's audit-log export needs pagination after all,
given it's the one export here without a natural upper bound the way
a single event's data has — the date-range filter is the current
answer, but a very long-running instance might eventually want more.
