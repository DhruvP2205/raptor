# Stage Spec: Demo Environment

Status: **Implemented and live-verified against a real scratch
`raptor_demo` database** — exact team/submission counts, the
deliberate tie at rank 1, certificate counts, correctly-withheld
voting tallies, and idempotency across two runs all confirmed live;
the banner checked in an actual browser via Playwright. A real
timeline-ordering bug (Section 2.1) was found and fixed during this
verification, not caught by inspection alone. 470/470 tests passing.
**Honest limitation:** `docker-compose.yml` and entrypoint shell
changes are reviewed but not container-tested — no Docker available
in the environment this was built in. Treat the compose/entrypoint
pieces specifically as reviewed-but-unverified until run for real.
Supersedes the earlier "one small second event" sketch discussed
before this doc — this is a better design: more lifecycle coverage,
genuinely reusable rather than a one-time seed that goes stale.
**Revised once more since the first version of this doc:** the
original version assumed demo events would be seeded into the same
database as any real event, with no isolation between the two. Fixed
below (Section 1, item 4) — see `ARCHITECTURE.md` §4 for the
corresponding infrastructure change.
Backend + frontend both touched. If code and this doc disagree,
update this doc first.

---

## 1. Scope

1. A `DEMO_MODE` environment variable gating whether any of this runs
   at all — a real self-hoster running a real event never gets fake
   data cluttering their instance unless they explicitly opt in.
2. A **persistent, non-dismissible banner** on every page when demo
   mode is on, so nobody — a judge, a curious visitor — ever mistakes
   sample data for a real event.
3. A seed script producing **four events, each at a different
   lifecycle phase**, with every timeline field computed **relative
   to the moment the script runs**, never a hardcoded date — so the
   demo looks equally fresh whether someone runs it today or a year
   from now.
4. **A genuinely separate database, not a shared one with extra
   rows in it.** `DEMO_MODE=true` connects to a distinct logical
   database (`raptor_demo`) on the same Postgres server, entirely
   independent of `raptor`, the real, always-persistent database a
   self-hoster's actual event data lives in. This was missing from
   the first version of this doc, which risked exactly the problem a
   real self-hoster would actually hit: try the demo once, turn it
   off, and find four fake teams sitting in what's supposed to be
   their real event's data. Full detail in Section 4.

**Explicitly separate from Module 16's fixtures importer**, which
always runs regardless of `DEMO_MODE` — the checker needs that data
unconditionally. This module is purely for human-facing demonstration
and only ever runs when opted into.

---

## 2. The four events

| Event | Status | Phase (relative to "now" at seed time) |
|---|---|---|
| **Archived** | `ARCHIVED` | Results published, voting closed with a winner, certificates issued, comments present — everything finished 1–3 days ago |
| **Draft** | `DRAFT` | Not date-driven at all — an organizer's own deliberate decision (`ARCHITECTURE.md` §7's Status-vs-Phase pattern), so this one's "phase" is irrelevant; dates are set comfortably in the future purely for narrative coherence, not because draft status depends on them |
| **Running** | `PUBLISHED` | Submissions currently open — some teams have already submitted, registration still open for others, judging hasn't started |
| **Voting** | `PUBLISHED` | Judging closed, results published, one voting round currently open |

Four phases chosen deliberately to be **mutually exclusive and
maximally spread** across the pipeline — there's no value in two demo
events showing nearly the same phase; the point is a judge clicking
through the events list sees the platform's full range at a glance,
in one screen, without needing to imagine what an intermediate state
would look like.

### 2.1 Date computation — the part that has to be relative, not fixed

Every timeline field for the three date-driven events is computed
from `now = new Date()` **at the moment the seed script actually
runs**, the same principle Module 16's fixtures importer already uses
for its one fixture event's `submissionsCloseAt`, just extended across
richer, hand-crafted content.

**Corrected to list every field explicitly, in strict order, after a
real bug was found during implementation:** the first version of this
section only named the "headline" fields for each event and left the
rest implicit — which is exactly how the Running event ended up with
`registrationClosesAt` computed *after* `eventStartsAt`, an inverted
ordering that violates the platform's own timeline rule
(`registrationOpensAt < registrationClosesAt <= eventStartsAt <
submissionsOpenAt < ...`, `03-event-management.md`) and made
`computeEventPhase` report `REGISTRATION_OPEN` when the event was
actually well past that. It was caught by curling the live public
events list and seeing the wrong phase string — not by reading the
code — which is exactly the kind of bug an incomplete date spec
invites: every *individual* offset looked reasonable in isolation,
and only the full ordering, checked all at once, reveals the problem.
Every event below now lists **every** required field, in order, so
there's no implicit gap left for an ordering mistake to hide in.

- **Archived** (all fields, oldest to newest): `registrationOpensAt
  = now - 10d`, `registrationClosesAt = now - 8d`, `eventStartsAt =
  now - 8d`, `submissionsOpenAt = now - 8d`, `submissionsCloseAt =
  now - 4d`, `eventEndsAt = now - 4d`, `judgingClosesAt = now - 3d`,
  `resultsAnnounceAt = now - 2d`, `votingOpensAt = now - 2d`,
  `votingClosesAt = now - 1d`, `votingWinnerAnnounceAt = now - 12h`.
- **Running**: `registrationOpensAt = now - 5d`,
  `registrationClosesAt = now - 3d`, `eventStartsAt = now - 2d`,
  `submissionsOpenAt = now - 2d`, `submissionsCloseAt = now + 2d`
  (still open), `eventEndsAt = now + 3d`, `judgingClosesAt = now +
  4d`, `resultsAnnounceAt = now + 5d`, `votingOpensAt = now + 5d`,
  `votingClosesAt = now + 6d`, `votingWinnerAnnounceAt = now + 6d
  12h`.
- **Voting**: `registrationOpensAt = now - 9d`, `registrationClosesAt
  = now - 7d`, `eventStartsAt = now - 7d`, `submissionsOpenAt = now -
  7d`, `submissionsCloseAt = now - 3d`, `eventEndsAt = now - 3d`,
  `judgingClosesAt = now - 1d`, `resultsAnnounceAt = now - 12h`,
  `votingOpensAt = now - 6h`, `votingClosesAt = now + 18h` (open
  right now), `votingWinnerAnnounceAt = now + 19h`.
- **Draft**: no computed relationship needed — any coherent
  future-leaning set of dates works, since `DRAFT` status alone is
  what actually matters for how this event behaves, and a draft's
  dates carry no phase consequence the way a `PUBLISHED` event's do.

**Every one of these three lists satisfies the full ordering rule
end to end** — not just the two or three fields that happened to
matter most for that event's headline phase, which is precisely the
partial-specification gap that let the real bug through the first
time.

### 2.2 Content per event

- **Archived**: ~6 teams, all submitted, fully judged, one normalization run, published results with a clear ranking (including one deliberately tied position, so the shared-rank display gets exercised too), one certificate per participant plus winner certificates, a closed voting round with a declared winner, two or three comments on the winning submission.
- **Running**: ~4 teams submitted, 2 more registered but not yet submitted (showing the gallery mid-fill, not artificially complete), zero judging activity yet — this event's whole point is showing what "still in progress" looks like.
- **Voting**: ~5 teams, fully judged, results published, shortlist visible, votes already cast by a few synthetic accounts so the tally isn't zero when a judge looks (but the round is still open, so per Module 11's own rule, no percentage is shown publicly yet — only the fact that voting is live).
- **Draft**: zero teams, zero submissions — an empty draft is the *correct*, realistic state for something an organizer hasn't published yet; populating it with fake content would misrepresent what a real draft actually looks like.

**Confirmed during implementation, worth recording as a deliberate
choice rather than an incidental detail: the Archived event's
normalization run and rank computation reuse this platform's own
tested formula modules directly** (`computeRankResults`,
`computeJudgeZScore`, and the rest of Module 9's real logic) **rather
than a separate, hand-approximated version written just for the demo
seed.** This matters for the same reason Module 16's fixtures
importer bypasses the verification pipeline but never reimplements
scoring math — a demo whose numbers came from different code than
the real feature would be demonstrating something other than the
actual platform. Certificates for this event are real, Ed25519-signed
artifacts (Module 12), not mocked placeholders — the same signing
path a genuine winner's certificate goes through.

---

## 3. Idempotency — refresh dates on every boot, don't churn content

Each of the four events gets a **fixed, predictable slug**
(`demo-archived`, `demo-draft`, `demo-running`, `demo-voting`). On
every seed run:

- If an event with that slug already exists, **its timeline fields
  are recomputed and updated in place** against the current `now` —
  this is the part that keeps the demo perpetually fresh no matter
  how long the container's been sitting stopped between runs.
- Teams, submissions, scores, comments, and certificates are **left
  untouched** once created — there's no reason to regenerate content
  that doesn't need a date relative to "now," and doing so would just
  create needless churn (new random names every boot, nothing
  gained).
- If the four events don't exist yet at all (first boot), full
  content generation runs once, as described in Section 2.2.

---

## 4. Database isolation — a genuinely separate database, not a
shared one

**Corrected from the first version of this doc**, which said nothing
about this at all and implicitly assumed demo events would live in
whatever database the API happened to be connected to — the same one
real event data would live in. That's a real problem: a self-hoster
trying the demo once, then disabling it to run a real event, would
find four fake teams sitting in their real database with no
principled way to distinguish "mine" from "sample."

**Fixed: `DEMO_MODE` selects which of two databases the API connects
to, not whether extra rows get added to one shared database.**

- `DEMO_MODE` unset or `false` → `DATABASE_URL` points at `raptor`,
  the real database. This module never runs at all; nothing it does
  ever touches this database, under any circumstance.
- `DEMO_MODE=true` → `DATABASE_URL` points at `raptor_demo`, a
  separate logical database on the same Postgres server. This
  module's seed step, including Section 3's every-boot date refresh,
  only ever operates here.

Both databases run the identical schema — `prisma migrate deploy`
applies to whichever one is currently selected. This isn't a second
application or a second codebase; it's the same application pointed
at one of two interchangeable, structurally identical databases,
chosen by a single environment variable at boot.

**Consequence worth stating plainly:** turning `DEMO_MODE` on, then
back off, is not a one-way action with residue — `raptor` is exactly
as it was before anyone ever touched the flag, because nothing in
this module was ever capable of writing to it in the first place.

### 4.1 How this is actually enabled — one compose file, not two

**A single `docker-compose.yml`, never a second one.** Two compose
files would be exactly the kind of duplication this platform avoids
everywhere else (one shared markdown renderer, one type system across
frontend/backend) — the only differences between demo and real mode
are which database to connect to, whether one extra seed branch runs,
and whether the frontend shows a banner, all of which are a single
environment variable being read by application code, not a structural
difference in what containers exist.

```yaml
services:
  api:
    environment:
      - DEMO_MODE=${DEMO_MODE:-false}
  worker:
    environment:
      - DEMO_MODE=${DEMO_MODE:-false}
```

**Both `api` and `worker` read the identical variable — this is not
optional.** Module 14's background recompute job runs in `worker`,
and it has to agree with `api` on which database is active. Passing
`DEMO_MODE` to `api` alone would risk `worker` quietly recomputing
against `raptor` while `api` serves pages from `raptor_demo` — two
containers disagreeing about which database is real, which is a far
worse failure than either database being wrong on its own.

Defaults to `false` if unset — a self-hoster who never heard of this
flag gets ordinary, real-database behavior with no extra step.
Turning it on: set `DEMO_MODE=true` in a `.env` file (Compose reads
this automatically, same directory as `docker-compose.yml`), or
inline for one session: `DEMO_MODE=true docker compose up`.

### 4.2 Creating `raptor_demo` in the first place

Postgres has no `CREATE DATABASE IF NOT EXISTS` — unlike a table or
an extension, database creation has no built-in idempotent form at
all. A dedicated step (`ensure-demo-database.ts`), run before the
seed step, checks whether `raptor_demo` already exists via a query
against Postgres's own catalog and creates it only if it doesn't —
this is genuinely separate from Prisma's migration step, which
assumes its target database already exists and only manages schema
*within* it.

---

## 5. The banner

A fixed bar at the very top of every page, above the normal nav,
rendered only when the API's public config endpoint
(`GET /config/public` — no `/api` prefix, this codebase has none; same
correction as Module 19's D179 — already unauthenticated per Module 1's
`@Public()` pattern) reports `demoMode: true`. Visually distinct from
every other banner/status treatment already in this platform's
design system — not the amber "live" status color reused from
elsewhere, since this needs to read as categorically different from
an in-app status, not as one more instance of the same pattern.

**Deliberately not dismissible.** A judge clicking through a dozen
pages shouldn't be able to dismiss it on page one and lose the context
for the rest of their visit — the entire point is that it's
impossible to forget you're looking at sample data, for the whole
session, on every page, no exception.

Text: **"Demo instance — sample data, not a real event."** Plain,
factual, no explanation needed beyond that one line.

---

## 6. What I'm testing for this module

- **`DEMO_MODE=true` connects to `raptor_demo`; unset connects to
  `raptor` — verified by inspecting the actual connection string at
  runtime, not just trusting the environment variable was read.**
- **Writing demo content, then restarting with `DEMO_MODE` unset,
  shows a completely empty `raptor` (aside from whatever a real event
  might have put there) — confirming Section 4's isolation holds in
  practice, not just in the connection-string logic.**

- With `DEMO_MODE` unset, the seed script produces zero demo events —
  Module 16's fixture event exists, nothing else does, and the
  banner never renders.
- With `DEMO_MODE=true`, all four events exist with the correct
  status/phase relationships described in Section 2, **including the
  ordering bug found and fixed during this implementation — verified
  by checking the actual public events list output, not just by
  re-reading the corrected date logic.**
- **The Archived event's deliberate tie is confirmed live at rank
  1** — two submissions genuinely sharing the top position, rendered
  as a shared rank rather than an arbitrary tiebreak, exercising the
  same dense-ranking display real events use.
- Running the seed twice, several (simulated) days apart, produces
  the *same four events* (by slug) with *updated* timeline fields —
  the Archived event's `eventEndsAt` is always a fixed offset before
  whenever the script last ran, never a stale absolute date.
- Team/submission/comment content is identical across two consecutive
  seed runs — confirming content doesn't churn, only dates do.
- **The banner was verified in a real browser (Playwright), not just
  as a rendered-HTML assertion**: correct text, no dismiss control
  present, persists across client-side navigation between pages, and
  is absent entirely when `DEMO_MODE` is off.
- The Voting demo event's vote tally is not publicly visible while
  its round is still open, matching Module 11's real rule exactly —
  this demo event doesn't get a special exception to a rule that
  exists to be demonstrated, not bypassed.

---

## 7. Open questions

None blocking. One thing worth a look once this is built: whether the
banner's fixed positioning needs to account for the mobile safe-area
insets already established in `DESIGN-SYSTEM.md` — likely yes, same
treatment as the sticky nav header, just stacked above it rather than
replacing it.
