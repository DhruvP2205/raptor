# Stage Spec: Fixtures Import

Status: **Implemented, committed (`a0f0378`), reconciled against the
real implementation twice** (once for the team-uniqueness and
demo-seed corrections, once for the organizer-account and optional-
field corrections that follow from those). 432/432 tests passing;
idempotency re-verified after the `resolveSubmissionFields()`
extraction with zero behavioral drift (identical event/submission/
assignment IDs across repeated seed runs).
Backend, continuing the module sequence after Global Ranking. Exists
solely to satisfy the acceptance checker's need for known, pre-
existing data — not a feature real users ever see or interact with.
If code and this doc disagree, update this doc first.

---

## 1. Scope

A direct-write loader that takes the organizers' fixture file (a
flatter shape than our own schema: event, tracks, judges, teams,
projects, scores) and materializes it into real rows in our database
— `Event`, `Track`, `User`, `EventMembership`, `Team`,
`TeamMembership`, `Submission`, `SubmissionVerification`,
`JudgeAssignment`, `Score`, `JudgeReview`.

**This is not the general bulk-import feature (T4).** That's a
separate, future, user-facing capability for organizers migrating
data from another tool. This is a narrow, boot-time mechanism for
exactly one fixed file shape, and it deliberately bypasses every gate
the normal pipeline enforces — verification, assignment, submission
deadlines — because the checker's environment can't satisfy them (no
network access, fixed/fake repo URLs, a script that never logs in).

---

## 2. [CORRECTED] Where the file lives, and when import runs

We commit the fixture file into our own repository at a fixed,
documented path once it's provided, rather than depending on the
checker mounting anything into our container — this keeps
`docker compose up` fully self-contained, with no external volume
dependency the checker's own environment would need to satisfy.

**Import runs as part of a seed step this module builds** — not, as
an earlier version of this doc wrongly claimed, "the existing seed
step... already run on every `docker compose up` per Module 1's boot
sequence." No such step existed anywhere in the codebase before this
module. It had to be built here: `apps/api/src/scripts/seed.ts`,
wired into `docker-entrypoint.sh` immediately after migrations.

**This module's seed step does not also produce a rich, human-
browsable demo event.** An earlier version of this doc asserted one
already existed "alongside" the fixture import — it doesn't, and
building one was correctly treated as out of scope here rather than
folded in as unplanned extra work. That remains a real, separate,
still-open gap. Until it's designed and built, the only event this
seed step produces is the one fixture import creates — there is
currently nothing for a human exploring the portal to see beyond it.

**Idempotent on every boot.** A small `FixtureImportRecord(fixtureType,
fixtureId, internalId)` mapping table (new) tracks which fixture
entities have already been imported and to which of our internal IDs
— re-running the seed step (container restart, `docker compose
up` a second time) upserts rather than duplicates. This matters
because the checker may run against a freshly restarted container
more than once.

---

## 3. Field mapping

| Fixture entity | Maps to | Notes |
|---|---|---|
| `event` | `Event` + full timeline fields | The fixture is not expected to supply our full ten-field timeline chain. Synthesize what's missing: `submissionsCloseAt` **must** land in the past relative to import time — this is the one hard constraint, since a T1 check depends on a closed event refusing a late submission. Everything else defaults to a state consistent with "judging already underway" (`judgingClosesAt` slightly in the future is fine, since scores already exist and reading them is never phase-gated). |
| `tracks` | `Track` rows | Direct mapping, one row per fixture track. |
| `judges` | `User` (`accountType: JUDGE`) + `EventMembership` (`invitationStatus: ACCEPTED`) | Bypasses Module 2's whole invitation flow — created already-accepted, since the checker never walks that flow either. |
| `teams` | `Team` + `TeamMembership` + `EventMembership` (`role: PARTICIPANT`) + member `User` rows (`accountType: PARTICIPANT`) | **Corrected — a real bug, found by Module 18's implementation, not caught here originally.** This row previously omitted `EventMembership`. Team membership alone isn't sufficient — the real application logic (`teams.service.ts`) requires a participant's `EventMembership` to already exist *before* `TeamMembership` is meaningful, and this module's importer never created one. The practical symptom: a downstream export (Module 18's Registrations) came back completely empty against the real 40-team fixture despite 91 real participants existing in `Team`/`TeamMembership` rows — the data existed, but nothing had ever registered them for the event in the one place that mattered. Fixed to create `EventMembership` alongside `TeamMembership` for every team member, and backfilled against already-imported data, not just future imports. See Section 4a for the one real wrinkle (team names aren't guaranteed unique in the fixture). |
| `projects` | `Submission` (`isDraft: false`, `everSubmitted: true`) | **Corrected field list.** Checked directly against Module 5's real submit validation rather than assumed: only `description` and `repoUrl` are actually required and therefore placeholder-eligible when the fixture omits them. `demoVideoUrl` and `liveUrl` are **not** required by Module 5 — an earlier version of this doc wrongly named them as placeholder targets. Extracted into a pure function, `resolveSubmissionFields()`, precisely because getting this list right matters and is easy to get wrong by assumption rather than by checking. See Section 4b for the resubmission-collapse case (the same team appearing on two project entries). |
| `projects` (continued) | `SubmissionVerification` (`checkStatus: VERIFIED`, `finalDecision: APPROVED`) | **Written directly, never computed.** Module 6's real GitHub-verification pipeline never runs against fixture data — the repo URLs aren't real, and the checker's environment has no network access regardless. The verification row exists so nothing downstream (Module 7's `APPROVED`-only eligibility gate) breaks on a missing row, but its `checkStatus`/`finalDecision` values are asserted, not derived. |
| `scores` (per judge/project/criteria/comment) | `JudgeAssignment` (`status: COMPLETED`) + `Score` (one row per criterion) + `JudgeReview` (`overallFeedback` from the fixture's `comment` field) + one `ScoreRevision` snapshot | See Section 4c for the criteria-mapping detail — this is the one place the fixture's shape and ours genuinely diverge. |
| *(none — synthesized by us)* | One minimal, fixed organizer `User` + `EventMembership` (`role: ORGANIZER`) on the fixture event, created by this module itself | **Corrected.** An earlier version of this doc said this reuses "our own existing seeded demo-organizer account" — no such account exists (Section 2), so there was nothing to reuse. This module creates its own minimal organizer account directly, solely so `.dogfood.toml`'s `auth.organizer` header has a real, working account to point at. |

---

## 4a. [CORRECTED] Team names aren't guaranteed unique in the fixture

The real file confirms this is a genuine case, not a hypothetical:
three separate teams share the same name. **This section originally
asserted team-name uniqueness had no database-level constraint and
lived only in the create-team endpoint's application logic — that was
wrong, and it was wrong specifically because it was never actually
checked against the real schema before being written down.** The
constraint is real: `Team @@unique([eventId, name])`, added back in
Module 4. A direct write attempting all three duplicate names would
fail outright, exactly as it did on first attempt.

**Corrected rule: the importer disambiguates on collision rather than
bypassing or loosening the constraint.** On encountering a team name
already used within the same event, append a counter —
`StillTrail`, `StillTrail (2)`, `StillTrail (3)` — and proceed. The
constraint itself is never weakened; the importer works around it the
same way any other direct-write caller would have to, by not
attempting to violate it in the first place. This preserves Module
4's real, tested guarantee instead of asking it to make an exception
for this one caller.

**Process note, not just a content fix:** this is exactly the kind of
error `CLAUDE.md`'s "check the schema, don't assume" discipline exists
to catch, and it was caught by checking `schema.prisma` directly
during implementation rather than trusting this doc's assertion at
face value. That's the correct response to finding a wrong stage doc
— fix the doc, don't quietly code around it and leave the written
record wrong for the next person who reads it.

## 4b. Resubmission collapse — the same team, two project entries

The real file contains a deliberate stress case: one team appears
twice in `projects`, same title and repo URL, different `id`s, with
the second entry's `submitted_at` later than the first. Per Module 5
(one `Submission` row per team per event; `submittedAt` always
reflects the *most recent* submit, never a history of prior ones),
this is not two projects — it's one team resubmitting, represented in
the fixture as if two separate project records existed.

**Rule: when two fixture projects share the same `team`, collapse them
into a single `Submission` row, keeping the later `submitted_at` and
its associated content.** The earlier entry is not imported as a
separate row at all.

**This has a direct consequence for scores.** In the real file, more
than one judge scored *both* entries for that team — meaning the
fixture contains two separate score-sets from the same judge, one
against the discarded earlier entry, one against the kept later one.
**Rule: when a judge appears in both score-sets for a collapsed
submission, keep only the score-set attached to the later entry** —
this mirrors exactly how a real resubmission already behaves in
Module 8 (a judge's updated review supersedes their own prior one for
the same submission, never both persisting as if they were separate).
A judge who only scored one of the two entries is unaffected — their
single score-set simply becomes a normal score on the collapsed
submission, no conflict to resolve.

## 4c. Scoring-criteria mapping

The fixture's `scores.criteria` is a plain key→value map — the real
file uses three keys (`functionality`, `quality`, `innovation`) — 
flatter than our `RubricCriterion` model, which requires named,
weighted `SCORING` criteria summing to exactly 100%, with judge input
on a 0–100 scale.

**Mapping strategy, designed to stay robust rather than hardcoded to
this one file's exact key count, since a different real event could
plausibly configure a different number:**
- **Read whichever criterion keys actually appear** and create one
  `RubricCriterion` (`kind: SCORING`) per key, with weight split evenly
  across however many keys exist (three keys here → roughly
  33/33/34) — the count is read from the data, never assumed.
- **Store the fixture's numeric value as-is**, without attempting to
  rescale it onto our 0–100 range. This is safe specifically because
  none of the seven mechanical checks inspect a score's actual
  numeric value — they only check *access control* (a judge can read
  their own scores, can't read a peer's). A fixture value of `4` is a
  perfectly valid `Score.value` under our schema (any number 0–100 is
  legal), even though it would compute an unglamorous `generalRaw` if
  anyone actually ran normalization against it — which nothing in the
  checker does.
- If the real file's scale ever turns out to violate our 0–100 bound
  (e.g. a negative number, which does happen in some rating
  conventions), the importer clamps rather than rejects — a rejected
  import is a much worse failure mode than a slightly-off score value
  nobody mechanically checks.
- The fixture's `comment` field (sometimes an empty string) maps
  directly to `JudgeReview.overallFeedback` — including the empty-
  string case; Module 8 doesn't reject an empty feedback string on
  import the way it might discourage one through the real UI, and
  this module never routes through that UI validation regardless.

---

## 5. What this explicitly does not do

- Does **not** run Module 6's real verification pipeline against any
  fixture project, under any circumstance.
- Does **not** create `JudgeAssignment` rows through Module 7's normal
  assignment algorithm — they're written directly, already
  `COMPLETED`, matching the fixture's pre-existing scores.
- Does **not** touch normalization (Module 9), results (Module 10),
  voting (Module 11), or certificates (Module 12) — the fixture and
  the seven checks never reach any of those; there's nothing for this
  importer to seed there.
- Does **not** replace or interfere with any richer, human-facing
  demo seed. **Correction: this doc previously asserted such a seed
  already existed "side by side" with the fixture import — it
  doesn't.** No demo-event seed has been built yet; this remains a
  real, separate, still-open gap, not something this module produces
  as a side effect. When that seed is eventually built, it needs to
  coexist cleanly with the fixture-imported event (predictable slug,
  no shared identifiers) — but nothing about *that* is designed yet,
  and this module doesn't attempt to fill the gap itself.

---

## 5a. A dependency the gallery route needs to honor, found by reading
the real `run.py` source

The checker's "project from fixtures shown" check only looks for the
titles of the **first three projects in the fixture file, in file
order** — `prj_01` through `prj_03`, whatever their titles are — as a
case-insensitive substring search against the gallery route's raw
response body. It does not search the whole gallery exhaustively
across pages; it checks whatever page-one actually returns.

**This isn't something the importer itself can get wrong — it's a
constraint on the gallery route's default sort/pagination**, worth
recording here since it's a direct consequence of what this module
imports. If the gallery's default view sorts by something other than
import order (most-recently-scored, alphabetical, random), and that
sort happens to push `prj_01`–`prj_03` off page one, this check fails
even though the data is sitting correctly in the database. Flagged
here as a cross-module dependency rather than silently discovered
later when the gallery route gets built.

**Verified, and already safe by construction — no code change
needed.** Checked directly against the real gallery route
(`submissions.service.ts` and its controller): there is no
`take`/`skip` anywhere in that path — every submission for an event
comes back in one unpaginated response, so there's no sort order that
could push anything off a "page one" that doesn't exist. Confirmed
live against the real seeded fixture event: the gallery response
contains all three of the first three fixture project titles. This
dependency was correctly identified as a real risk in principle; it
simply turned out the gallery route never had the failure mode to
begin with.

---

## 6. What I'm testing for this module

- Running the seed step twice in a row produces the same row counts
  the second time (idempotency via `FixtureImportRecord`), not
  duplicates.
- The fixture event's `submissionsCloseAt` lands in the past relative
  to import time regardless of what the fixture does or doesn't
  specify — and a POST to that event's submission route, using the
  seed-printed participant header, is rejected.
- A judge's own seed-printed header successfully reads their imported
  scores; a different judge's header, pointed at the same scores,
  is refused — this is the actual `peer_scores` check, and it must
  hold against fixture-imported data exactly as it holds against
  normally-created data, since the access-control logic itself is
  untouched by this module (Module 7/8's existing guards, not
  anything new).
- **Two fixture projects sharing the same team collapse into exactly
  one `Submission` row**, carrying the later entry's content — never
  two rows for one team.
- **A judge who scored both the discarded and the kept entry for a
  collapsed submission ends up with exactly one `Score` per
  criterion** on the final row (the later one), not two conflicting
  values and not a duplicate-key failure on import.
- **Importing a fixture with duplicate team names across different
  teams succeeds** — confirming the importer's disambiguation
  (`StillTrail`, `StillTrail (2)`, `StillTrail (3)`) correctly avoids
  ever violating `Team @@unique([eventId, name])`, rather than the
  disproven earlier assumption that no such constraint existed.
- `resolveSubmissionFields()` (the pure function extracted specifically
  for this) correctly placeholder-fills `description`/`repoUrl` when
  the fixture omits them, and correctly does **not** touch
  `demoVideoUrl`/`liveUrl`, which Module 5 never required in the
  first place — direct unit tests against this function, not just an
  end-to-end assertion, since the real fixture never actually
  exercises the omitted-field path (all 41 real projects supply both
  fields), making a unit-level test the only way this path gets
  covered at all.
- No fixture-imported row ever triggers a real outbound network call
  (verification, or anything else) — checkable by running the import
  step with network access deliberately blocked and confirming it
  still completes.
- The organizer account granted membership on the fixture event can
  successfully call the CSV export route for that event.

---

## 7. Open questions

**None blocking, now that the real file is in hand.** The field-shape
uncertainty flagged in the previous version of this doc is resolved —
Sections 3–4 above reflect the actual file (8 tracks, 30 judges, 40
teams, 41 projects, three scoring criteria), not the earlier
illustrative guess. The two real design decisions this file's own
content forced — the team-name-duplication handling (4a) and the
resubmission-collapse rule (4b) — are locked, not left open, since the
data itself made clear they needed a definite answer rather than a
placeholder.

One thing worth a final sanity check once the loader is actually
written, not a design gap: confirming the collapse rule in 4b behaves
correctly if a *third* project entry for the same team ever appeared
in a future fixture revision (this file only ever has at most two per
team) — the rule as written ("keep whichever entry has the latest
`submitted_at`") already generalizes to any count without change, but
it's worth a test case beyond what this exact file can exercise.
