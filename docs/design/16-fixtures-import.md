# Stage Spec: Fixtures Import

Status: **Implemented and live-verified against the real fixtures.json**
(2026-09-25) — `apps/api/src/scripts/fixtures-import.ts` +
`apps/api/src/scripts/seed.ts`, `FixtureImportRecord` in
`schema.prisma`. See D171-D173, docs/DECISIONS.md, for the two real
corrections this build surfaced (Section 2's seed-step assumption,
Section 4a's uniqueness-constraint claim).
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

## 2. Where the file lives, and when import runs

We commit the fixture file into our own repository at a fixed,
documented path once it's provided, rather than depending on the
checker mounting anything into our container — this keeps
`docker compose up` fully self-contained, with no external volume
dependency the checker's own environment would need to satisfy.

**Import runs automatically as part of the existing seed step**
(`prisma db seed`, already run on every `docker compose up` per
Module 1's boot sequence) — not a separate manual command. It runs
**alongside**, not instead of, our own normal seed data: our seed
still creates a rich demo event showing off every module for a human
judge clicking around; fixture import additionally creates one
clearly separate, predictably-slugged event containing exactly what
the checker expects. The two never overlap or conflict — a human
exploring the portal sees both; the checker only cares about the
fixture one.

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
| `teams` | `Team` + `TeamMembership` + member `User` rows (`accountType: PARTICIPANT`) | Direct mapping — see Section 4a for the one real wrinkle (team names aren't guaranteed unique in the fixture). |
| `projects` | `Submission` (`isDraft: false`, `everSubmitted: true`) | Any field Module 5 requires but the fixture omits (e.g. `demoVideoUrl`, `liveUrl` if absent) gets a clearly-synthetic placeholder value, not left null — our schema's NOT NULL constraints stay honest, and the placeholder is visually obvious if a human ever looks (`"synthesized — not provided by fixture"` as the string itself, not a silent empty string). See Section 4b for the resubmission-collapse case (the same team appearing on two project entries). |
| `projects` (continued) | `SubmissionVerification` (`checkStatus: VERIFIED`, `finalDecision: APPROVED`) | **Written directly, never computed.** Module 6's real GitHub-verification pipeline never runs against fixture data — the repo URLs aren't real, and the checker's environment has no network access regardless. The verification row exists so nothing downstream (Module 7's `APPROVED`-only eligibility gate) breaks on a missing row, but its `checkStatus`/`finalDecision` values are asserted, not derived. |
| `scores` (per judge/project/criteria/comment) | `JudgeAssignment` (`status: COMPLETED`) + `Score` (one row per criterion) + `JudgeReview` (`overallFeedback` from the fixture's `comment` field) + one `ScoreRevision` snapshot | See Section 4 for the criteria-mapping detail — this is the one place the fixture's shape and ours genuinely diverge. |
| *(none — synthesized by us)* | An organizer `User` + `EventMembership` (`role: ORGANIZER`) on the fixture event | The fixture format doesn't include an explicit organizer entity. We grant our own existing seeded demo-organizer account membership on the fixture event specifically, so `.dogfood.toml`'s `auth.organizer` header has a real, working account to point at. |

---

## 4a. Team names aren't guaranteed unique in the fixture

The real file confirms this is a genuine case, not a hypothetical:
several team names repeat (`StillTrail` ×3, `AmberSwitch` ×2,
`OpenSignal` ×2).

**Correction (D172, docs/DECISIONS.md) — the earlier version of this
section claimed team-name uniqueness "has to live at the application
layer... not a database constraint." That was checked against the
actual schema and found wrong: `Team` has had `@@unique([eventId,
name])` as a real database constraint since Module 4** (alongside the
create-team endpoint's own pre-check, which returns a clean
`TEAM_NAME_TAKEN` error for a real user — belt and suspenders, not
either/or). Writing fixture `Team` rows directly with colliding names
would hit that constraint and fail the import outright, exactly the
failure mode this section originally (incorrectly) said was avoided.

**Actual rule: the importer disambiguates a colliding fixture team name
before writing it** — the second `StillTrail` persists as `StillTrail
(2)`, the third as `StillTrail (3)`, and so on — tracked back to the
fixture's own team id via `FixtureImportRecord` regardless of the
display name actually stored, so nothing downstream needs to know a
collision happened. Module 4's existing uniqueness guarantee for real
user-created teams is untouched by this — the importer works around its
own constraint rather than loosening it for everyone.

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
- Does **not** replace or interfere with our own richer demo seed data
  — both exist side by side, in clearly separate events.

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
  teams succeeds** — confirming the uniqueness check really does live
  in the create-team endpoint's application logic and not a database
  constraint this direct-write path would otherwise violate.
  untouched by this module (Module 7/8's existing guards, not
  anything new).
- A fixture project missing an optional field (e.g. `liveUrl`) still
  produces a valid `Submission` row, with the synthesized-placeholder
  value visibly distinguishable from real fixture content.
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
