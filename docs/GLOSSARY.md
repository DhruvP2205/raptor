# GLOSSARY.md

Precise definitions for terms that are easy to use loosely but mean
something exact in this project. If a stage doc or code comment uses one
of these words, it means exactly this — not a close-enough synonym.

---

**Account type** (`User.accountType`)
`PARTICIPANT`, `JUDGE`, or `ORGANIZER`. Set once at account creation,
never edited afterward. Distinct from `EventMembership.role`, which is
per-event — account type is the platform-wide, permanent identity; role
is what that identity is doing on one specific event. A `JUDGE`-type
account can only ever hold `JUDGE` memberships; it can never hold an
`ORGANIZER` or `PARTICIPANT` membership on any event.

**Admin** (team context)
The fixed, non-transferable controller of a `Team`. Not the same concept
as **admin** (platform context, see `siteAdmin` below) — a team admin
has no platform-wide power, only control over their one team.

**siteAdmin**
A boolean flag on `User`, orthogonal to account type. Platform-wide
operator privilege — bypasses per-event authorization checks, with every
bypass audited. Provisioned outside normal app flow (bootstrap/seed
only), never created via an in-app button.

**Status vs. Phase** (Event)
- **Status** — manual, deliberate, actor-set. `DRAFT → PUBLISHED →
  ARCHIVED / DELETED`. Never changes on its own.
- **Phase** — fully computed from `now()` against the event's timeline
  timestamps, recalculated on every read, never stored as a column.
  Only meaningful once `status = PUBLISHED`.
These are independent axes. An event can be `PUBLISHED` and in phase
`JUDGING` simultaneously — status answers "has someone decided this is
public," phase answers "where does the clock currently say we are."

**everSubmitted** (`Submission.everSubmitted`)
A one-way, permanent flag — `false` until the first successful `submit`,
then `true` forever, regardless of any later `unsubmit`. Distinct from
`isDraft`, which toggles freely. Anything that needs to know "has this
submission ever been finalized, even once" (e.g. the team-roster lock)
checks this field, never `isDraft`.

**isDraft** (`Submission.isDraft`)
The *current* state of a submission — freely toggled by `submit`
(`false`) and `unsubmit` (`true`). Says nothing about history; a
submission can be `isDraft: true` right now while `everSubmitted: true`
forever, because it was submitted once and then pulled back for edits.

**Invitation status** (`EventMembership.invitationStatus`)
`PENDING | ACCEPTED | DECLINED | EXPIRED`. Only `ACCEPTED` grants any
access — a `PENDING` row exists in the table but behaves identically to
no row at all for every authorization check. `EXPIRED` and `DECLINED`
are deliberately distinct (never-responded vs. actively-refused), since
an organizer deciding whether to re-invite cares which one it is.

**TEST_MODE**
A single environment flag, off by default, checked at exactly one call
site (verification-email dispatch). When true: the verification token is
logged AND a real, clearly-labeled test email is still sent. Never
enabled in a real deployment. Not a general "dev mode" switch — it does
not affect any other behavior in the system, and if a second call site
ever checks this flag, that's a sign of scope creep to flag and reverse.

**Solo submission vs. team submission**
Two mutually exclusive participation modes for the same event, tracked
by `Submission.submissionType`. A user with a solo submission (draft or
finalized) for an event cannot create or join a team for that same
event, and vice versa — enforced as a hard reject, never a silent
merge/conversion.

**Roster lock** (Team Management)
The point after which a team's membership (join/kick/regenerate
link/delete) can no longer change. Keyed to `Submission.everSubmitted`
being `true` — **permanent** once tripped, not reversible by
`unsubmit`ting back to draft. Not the same as "currently in draft" —a
team can be back in draft state and still be roster-locked if it has
ever submitted before.

**Voting round**
A single, time-boxed instance of public voting for an event. An event
can have more than one over its lifetime if an earlier round is
deactivated and restarted — each round has its own shortlist, its own
votes, and its own one-vote-per-user constraint (scoped to the round, not
the event as a whole).

**Shortlist**
The specific, curated subset of submissions eligible to appear on a
voting round's ballot — not "everyone who submitted." Auto-suggested
(top N by judge rank) but freely organizer-adjustable before it's
published and locked.

**Certificate payload**
The JSON record of facts (`Certificate.payloadJson`) a certificate's
signature is computed over — recipient name, event, role, date, etc.
This, not any rendered image, is the actual stored source of truth; SVG
and PDF renderings are always regenerated from this at request time (or
served from a disposable cache keyed to it).

**Account-age gate**
The voting-eligibility rule that a user's account must have been created
before `event.eventStartsAt` to be allowed to vote. Anchored specifically
to `eventStartsAt`, not `registrationOpensAt` or `votingOpensAt` — a
deliberate choice to block accounts created purely to farm a specific
vote after the event's real timeline is already underway.

**Judge calibration profile**
A judge's platform-wide, live-updating personal scoring tendency
(`judgeCalibrationMean`, `judgeCalibrationStdDev`,
`judgeCalibrationSampleCount` on `User`) — computed across every
`COMPLETED` review that judge has *ever* done, across **all events**,
not reset per event (D122). This is deliberately different from the
per-event-scoped design most other judge-related data in this platform
uses (e.g. `EventMembership`) — calibration is treated as a stable
personal trait that follows the judge across the whole platform.

**Minimum-N (normalization)**
The threshold (3, counted platform-wide, not per-event — D123) below
which a judge's own `judgeCalibrationMean`/`StdDev` are considered
statistically unreliable. Below this threshold, that judge is
normalized against the current event's own aggregate baseline instead
of their own figures — see **event-baseline fallback** below. Distinct
from the minimum-review-count concepts elsewhere in the platform (e.g.
reviews-per-submission in Module 7) — this one specifically gates
whether a judge's *personal* statistics are trustworthy enough to use.

**Event-baseline fallback**
When a judge is below minimum-N, their z-score is computed against that
specific event's own mean/stddev (across every judge's `rawTotal` in
that event) rather than their own unreliable personal mean/stddev
(D124). This keeps every judge's contribution in the same z-score space
regardless of how much platform history they individually have, so
averaging across a mix of experienced and brand-new judges on the same
submission stays mathematically valid.

**Uniform scoring (flag)**
A judge whose `judgeCalibrationStdDev` is exactly 0 — they've given
every project across their history the identical `rawTotal`, meaning
they carry no differentiating signal. Their z-score is set to 0
(neutral) rather than excluded, and the situation is explicitly flagged
for admin/organizer visibility (D125) — never silently absorbed into
the calculation with no trace.

**Normalization run vs. live judge profile — snapshot, not a pointer**
A `NormalizationRun`'s `NormalizedJudgeScore` rows freeze each judge's
mean/stddev/sample-count exactly as they stood at the moment that run
executed (D127). This is a permanent copy, **never a live reference**
back to `User.judgeCalibration*` — because that live profile keeps
changing as the judge reviews more projects at *future* events, and a
past, already-locked event's normalization must never appear to
silently change just because time passed and the judge judged
something else later.

**Normalization lock (`resultsAnnounceAt`)**
Normalization can be triggered and re-triggered freely while
`judgingClosesAt <= now() < resultsAnnounceAt`, but is **permanently
and unconditionally locked** the instant `resultsAnnounceAt` passes —
no admin override, no exception (D126). Same category of protection as
an already-cast vote or an issued certificate: once results are real
and public, the computation behind them can't be silently redone. **Not
the same thing as whether results can be corrected after publish** —
see Post-publish correction below, which is a separate layer that
exists precisely because this lock, correctly, allows no exceptions of
its own.

**Special-award criterion / nomination**
A third `RubricCriterion` kind (`SPECIAL_AWARD`), alongside `SCORING`
and `BONUS` — added retroactively to Module 8 after a gap was caught
during Results & Rankings design (D129). A judge, while reviewing one
submission, can flag (`Score.value = 1`) whether it deserves a given
special award (Best Code, Most Unique Feature, etc.). Never part of the
`generalRaw`/`bonusRaw`/`rawTotal` scoring formula — tallied entirely
separately at results time (D130). The winner is whichever submission
accumulates the most nomination flags across every judge who reviewed
it. **Tie-break, deliberately different order from the rank-prize
cascade: nomination count → `bonusRaw` → `NormalizedScore.finalScore`
→ share (D140).** Limitation, stated plainly: a judge can only nominate
from submissions they personally reviewed, not the full event-wide pool.

**Dense ranking**
The ranking style this platform uses for rank-based prizes (D133):
after a tied position, the next distinct score takes the **next
sequential** rank number, never a skipped one. Two submissions tied for
2nd means the next submission is ranked 3rd, not 4th. Explicitly not
"Olympic"/skip-ranking, which would have made that next submission 4th.

**Rank tie-break cascade → share, never escalate**
`NormalizedScore.finalScore` → pre-normalization `averageRawTotal` →
`bonusRaw` → if still tied, **share the position and its prize
together** (D132). Unlike some other tie-handling in this platform, this
resolution is fully automatic end-to-end — there's no manual-review
escalation step for a rank tie the way there might be for, say, a
disputed vote count. **Not the same cascade order as special-award
ties** — see the entry below, which checks bonus *before* the final
score, the reverse of this one.

**`PublishedResultVersion` — versioned, never edited in place**
Every publish, and every later correction, produces a new version
(`versionNumber` increments); the previous one is marked `SUPERSEDED`,
never deleted or mutated. Only one version is ever `LIVE`
(participant-visible) at a time per event.

**Post-publish correction**
A deliberate, heavily-audited action an organizer/admin can take
*after* results are already live — disqualify a submission, manually
reorder rank, or explicitly override a displayed score (D139). Always
requires a written reason, always produces a new `PublishedResultVersion`
rather than editing the live one, always visibly marked as a correction
(never indistinguishable from an original result). **Does not reopen
normalization** — see Normalization lock above; this is a separate
override sitting on top of an already-frozen computation, not a way
around the lock.

**Results visibility gate vs. `EventPhase`**
Two independent things, easy to conflate: `EventPhase` reaching
`RESULTS_ANNOUNCED` is purely timestamp-computed (Module 3) and happens
regardless of organizer action. What participants actually *see* is
gated by whether a `PublishedResultVersion` exists at `status: LIVE`
(D138) — a phase transition alone reveals nothing. **The same pattern
applies to voting**, with `VotingResultVersion` and `EventPhase:
VOTING_WINNER_ANNOUNCED` — see the Voting round vs. shortlist entry
below for how the two publish gates (judge results and voting results)
relate to each other.

**Voting round vs. shortlist — reveal timing**
The shortlist (which submissions are eligible to appear on a voting
ballot) becomes publicly visible **the moment judge-decided results are
published** (`PublishedResultVersion.status: LIVE`, D141) — not at
`votingOpensAt`. Voting itself (actually casting a vote) is gated
separately by `votingOpensAt`/`votingClosesAt`. This means there's
normally a real gap where the shortlist is public knowledge but voting
hasn't opened yet — expected and intentional, not a bug.

**Viewing the shortlist requires no authentication at all** (D161) —
anyone, signed in or not, can see which submissions are up for
audience choice. Only *casting a vote* is gated, and only by the two
existing rules that have applied since D43/D44: the organizer's chosen
eligibility mode and the account-age cutoff. Don't conflate "can this
person vote" with "can this person see the ballot" — they're
independent questions with different (and much looser) answers on the
viewing side.

**Minor correction vs. full round restart (voting)**
Two different-weight fixes for a voting round, not to be confused:
- **Minor correction** — cosmetic only (a typo, a wrong-project swap on
  the ballot display). **Zero effect on votes already cast or the
  count.** Logged, but doesn't touch `Vote` rows at all.
- **Full restart** — deactivates the entire round
  (`VotingRound.status: DEACTIVATED`), zero vote carryover, shortlist
  rebuilt from scratch, every voter (including prior voters) gets a
  fresh vote in the new round. Requires a mandatory reason, unlimited
  uses, only actionable in the window between `resultsAnnounceAt` and
  `eventClosedAt`.

**Certificate issuance — never a searched-for, free-text claim**
A hard structural rule, not just a UI convention: there is no flow
anywhere in this platform where a person searches for a project/team
and types a name to receive a certificate. A certificate's recipient is
always resolved from the authenticated caller's own existing
participation record (`TeamMembership`, `EventMembership`,
`JudgeAssignment`), and the displayed name always comes from
`User.displayName` on that same account — never a form field. This
exists specifically because a real competing platform was found to
allow exactly that pattern, letting anyone claim anyone else's project
under a fake name. See `12-certificates.md` Section 2 and
`DECISIONS.md` D143.

**Certificate role vs. multiple certificates per event**
`Certificate.role` (`PARTICIPANT | JUDGE | WINNER |
SPECIAL_AWARD_WINNER`) is fixed per row — a person who both participated
and won holds **two separate `Certificate` rows** for the same event
(D146), not one row whose content changes depending on outcome. Don't
design code that assumes exactly one certificate per person per event.

**Self-deletion vs. moderation deletion**
A recurring pattern for any user-generated content that can be removed
by more than one kind of actor: **the content's own author** can
delete it freely, no justification needed. **Anyone else** (organizer,
admin) removing the same content is a moderation action, and
**requires a mandatory written reason**, logged to `AuditLog` (D148) —
same distinction as, e.g., a participant leaving their own team (no
reason needed) versus an organizer disqualifying a submission (reason
required). First formalized for comments (Module 13), but the
distinction generalizes to any future user-content-removal feature.

**Guard** (technical)
A NestJS authorization check that runs before a route handler executes,
resolving the relevant resource's ID from the request path and checking
the current user's scoped permission for that specific resource — never
a global role check. The only authorization mechanism in the codebase;
there is no parallel frontend-only check anywhere that substitutes for
this.

**Non-responding judge exclusion**
When computing a submission's `averageRawTotal` (see the `generalRaw` /
`bonusRaw` / `rawTotal` / `averageRawTotal` / `finalScore` entry above),
any assigned judge whose `JudgeAssignment.status` is not `COMPLETED` is
excluded entirely from both the sum and the divisor — never counted as a
zero, never counted at all. A project assigned to 3 judges where only 2
complete their review has its `rawTotal` values averaged across exactly
those 2, before the single final scale conversion — not 3 values with
one implicit zero dragging it down.

**checkStatus vs. finalDecision** (Submission Verification)
Two separate fields on `SubmissionVerification`, easy to conflate but
answering different questions:
- **`checkStatus`** — what the *automated* check found (or why it
  couldn't run): `NOT_RUN | VERIFIED | SUSPICIOUS | REJECTED | PRIVATE |
  NON_GITHUB | ERROR`. This is a machine-generated observation.
- **`finalDecision`** — what actually gates judge assignment:
  `PENDING_REVIEW | APPROVED | DISQUALIFIED`. Only `VERIFIED` maps
  automatically to `APPROVED`; every other `checkStatus` requires an
  explicit human decision to resolve. A submission can have
  `checkStatus: REJECTED` and still not be `DISQUALIFIED` — the strong
  automated signal alone never excludes a team from judging without a
  human confirming it.

**Hashed vs. encrypted** (secret storage)
Two different treatments for sensitive values in this system, chosen
based on whether the plaintext ever needs to be read back:
- **Hashed** (one-way, compare-only) — sessions, email-verification
  tokens, invitation tokens. The system only ever needs to check "does
  this match," never "what was the original value."
- **Encrypted** (reversible, AES-256-GCM) — GitHub tokens only, as of
  this writing. The system must retrieve the actual plaintext to place
  an API call with it. This is a deliberate, narrow exception to the
  hash-everything default, not a general-purpose alternative pattern —
  don't reach for reversible encryption for a new secret without a
  specific, documented reason the plaintext must be recoverable.

**Judge reliability note** (`JudgeReliabilityNote`)
A written remark attached to a judge's **`User` profile** (not to any
one event) after a no-show or transferred assignment. Platform-wide,
visible to any organizer/admin considering that judge for a *future*
event — never visible to the judge themselves, never visible to any
participant. Distinct from an event-scoped audit-log entry precisely
because its purpose is to travel with the judge across events, not stay
local to the incident.

**Assignment transfer vs. assignment completion lock**
A `JudgeAssignment` can be manually transferred to a different judge
only while it is still `PENDING`/`IN_PROGRESS` (no score submitted yet).
The instant a score is actually submitted, that specific assignment
becomes permanently locked to the judge who submitted it — no transfer,
by anyone, ever, after that point. "Reassignable" and "completed" are
mutually exclusive states, never both true at once.

**Resubmit — two different meanings depending on context**
- **Submission resubmit** (Module 5): a participant/team unsubmits (back
  to draft) and submits again. `everSubmitted` stays permanently `true`
  regardless; `submittedAt` updates to the latest submission.
- **Score resubmit** (Module 8): a judge calls `submit-review` again on
  an already-`COMPLETED` assignment, any number of times, up until
  `judgingClosesAt`. Unlike a submission resubmit, there is no separate
  "unlock" step — a completed assignment is directly re-submittable by
  its own judge. Each resubmit appends a new `ScoreRevision` snapshot;
  none are ever overwritten or deleted.
Both are governed by very different rules (team-roster locking vs.
judge-content editability) — don't assume one module's resubmit
semantics apply to the other.

**Scoring criterion vs. bonus track**
Two kinds of `RubricCriterion`, distinguished by `kind`:
- **`SCORING`** — required, weighted (`weightPercent`, summing to
  exactly 100 across an event), judge input **0–100 per criterion**
  (D81). These are what "the rubric" usually refers to.
- **`BONUS`** — optional, flat point value (`maxPoints`, e.g. +5, +10,
  no sum constraint), scored 0 to `maxPoints`. An event can have zero
  bonus tracks.

**Judge input scale vs. display/winning scale — never the same number**
Two completely independent scales, easy to conflate:
- **Judge input scale** — fixed at 0–100 for `SCORING` criteria (D81),
  and 0–`maxPoints` for `BONUS` criteria. This is what a judge actually
  types in while reviewing one criterion of one project.
- **Display/winning scale** (`Event.finalScoreDisplayScale`) —
  organizer-configured per event (default 5), what a submission's final,
  publicly-shown score is expressed on. A judge never sees or interacts
  with this number while scoring; it only appears at the very last step,
  when a submission's averaged result is converted for display.

**generalRaw / bonusRaw / rawTotal / averageRawTotal / finalScore**
The full chain of the finalized scoring formula (D82), each stage
computed in this exact order — skipping or reordering any step
reproduces one of the two formula bugs found and rejected during design:
1. **`generalRaw`** (per judge) — the weighted sum of `SCORING`
   criteria, divided by 100 once. Lands in `[0, 100]`. **Must not be
   divided down further or shrunk to a smaller scale before the next
   step** — doing so was the specific mistake that let a low-quality
   project with bonus outscore a high-quality project without it.
2. **`bonusRaw`** (per judge) — sum of awarded bonus points, still in
   raw point units, not yet scaled.
3. **`rawTotal`** (per judge) — `generalRaw + bonusRaw`, computed while
   both are still in the same raw, undivided units.
4. **`averageRawTotal`** — the average of `rawTotal` across judges with
   `JudgeAssignment.status: COMPLETED` only (non-responding judges
   excluded entirely — see next entry). Division by 100 has *still* not
   happened yet at this point.
5. **`finalScore`** — `(averageRawTotal / 100) × finalScoreDisplayScale`.
   The **only** point in the entire pipeline where scaling to the
   display scale occurs. If `averageRawTotal > 100`, `finalScore`
   exceeds `finalScoreDisplayScale` — see **Overflow / Overachiever**
   below.

**Overflow / "Overachiever"**
When a submission's `averageRawTotal` exceeds 100 (possible whenever
enough judges award enough bonus), `finalScore` exceeds
`finalScoreDisplayScale` — e.g. `5.34 / 5`. This is displayed as-is,
never clamped down to the scale's maximum, with a fixed "Overachiever"
label in the public gallery. **Checked at the averaged submission level,
not per individual judge** — one generous judge alone does not trigger
this if the cross-judge average stays at or under 100. Never shown on
certificates, which carry no score at all (see the certificate payload
entry above).

**Bonus guardrail**
A validation warning (not a hard block) shown to an organizer at event
creation/edit if the sum of all `BONUS.maxPoints` for the event exceeds
a threshold (default 20). Exists because the scoring formula's safety —
bonus can only ever affect close calls, never overturn a real quality
gap — depends on bonus values staying small relative to the 100-point
general base; nothing in the math itself prevents an organizer from
setting an oversized bonus track that reintroduces that exact risk.
Proceeding past the warning is logged to `AuditLog`, not silently
allowed.

**Identity linking, v1 (Global Ranking, Module 14) — email only,
deliberately not Discord**
Historical/imported records link to a real `User` account
automatically when their email matches (D155) — safe, since it's a
verified account matching itself, not a typed claim. Every richer
alternative (an admin-review queue for a typed Discord handle, real
Discord OAuth, a self-service claim screen with corroboration) was
designed in real detail and then deliberately dropped (D156→D157→D158)
once it became clear email matching already covers the common case
and every alternative added real cost for a narrow remaining slice.
Anything email doesn't catch gets a static "contact an admin" note,
with no linking feature built for that path yet.
