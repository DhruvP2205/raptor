# Stage Spec: `.dogfood.toml` Assembly & `peer_scores` Route

Status: **Implemented and live-verified.** Guard confirmed exactly
as specified in Section 1: judge A 200, judge B 403, the seeded
organizer 200, an unrelated participant 403, and a request with no
auth header at all 401 — the last case distinct from the "wrong
role" 403s, confirming the guard correctly separates "you're nobody"
from "you're someone, just not authorized here." Three factual
errors in this doc's own example `.dogfood.toml` were caught and
corrected during implementation (Section 3).
Backend, continuing the sequence after CSV Export (Module 18). This
is the last piece of Tier 0 — everything the acceptance checker needs
to run at all. If code and this doc disagree, update this doc first.

---

## 1. Confirming the `peer_scores`-shaped route

**The route:** `GET /api/submissions/:submissionId/judges/:judgeId/scores`

Parameterized by *which judge*, not implicitly scoped to the caller —
this is the genuinely different shape from a normal "my own scores"
endpoint that Section 2 of the prior discussion identified as
necessary. It already has a legitimate real use before this checker
mechanism existed at all: an organizer auditing a specific judge's
specific review (Module 7's reliability-note workflow, Module 8's
progress dashboard drilling into one judge's completed assignment)
needs exactly this shape — "show me judge X's scores for submission
Y" — since an organizer isn't "the judge," so a caller-scoped
endpoint could never serve that need in the first place.

**Guard logic, stated precisely — corrected to match what actually
shipped:** the caller may access this route if and only if
`caller.id === :judgeId`, **or** the caller holds an `ORGANIZER`
membership on the submission's event with `invitationStatus:
ACCEPTED` (not merely an existing-but-unaccepted membership row),
**or** the caller is `siteAdmin` (in which case the access is
audited, same as every other `siteAdmin` bypass in this platform —
`ARCHITECTURE.md` §6). Every other caller — including a *different*
judge — is refused with 401/403. This is exactly `EventRoleGuard`'s
existing pattern, applied to one more route: the guard already knows
how to check "is this caller this specific judge," the same way it
already checks "is this caller this event's accepted organizer."
**The original version of this section undercounted the guard's
real cases** — it named only "the judge, or organizer/admin" as one
combined case, when the actual implementation correctly treats
`siteAdmin` as its own distinct, audited path rather than folding it
into "organizer," which matters because an admin viewing this route
isn't acting *as* an organizer of that event and shouldn't be
recorded as if they were.

**Why this needed confirming rather than assuming:** the checker's
`peer_scores` check is the single one explicitly called out as
costing the most points if it fails, and it specifically must be
enforced in the backend, not hidden only in a template. A route that
*looks* parameterized but whose guard secretly falls back to
"any authenticated judge on this event" would pass every other test
in this platform and fail exactly this one — worth actually writing
the guard condition out precisely (above) rather than trusting that
"we already do role isolation everywhere" covers this specific,
sharper case by default.

---

## 2. The route judge B actually gets sent to

`.dogfood.toml`'s `peer_scores` value is not a route *template* — it's
one **fully resolved, specific URL**, with judge A's real ID and a
real submission ID baked in as literal path segments. The checker
never substitutes anything into it; it requests exactly the string
it's given. This matters because it means `.dogfood.toml` has to be
filled in *after* the fixture import has actually run once, using
real IDs it produced — not written speculatively in advance.

---

## 3. The real `.dogfood.toml`

Assembled from what Modules 16–18 actually produce, not placeholder
values — the four header lines from Module 17's printed output, and
route paths matching this platform's real API surface.

**Three factual errors corrected in this section since the first
version of this doc, all caught by checking the real codebase rather
than assuming the earlier sketch was right:**

1. **No `/api` prefix exists anywhere in this codebase.** The earlier
   example prefixed every route with `/api`, which isn't how this
   platform's routes are actually structured — corrected below.
2. **`submit` pointed at the wrong endpoint** in the earlier example.
3. **`judge_scores` and `peer_scores` were shown as two different
   paths** — contradicting the design this route actually shipped
   with. Since the route is parameterized by judge ID rather than
   implicitly scoped to "whoever's asking," `judge_scores` (judge A
   requesting their own data) and `peer_scores` (judge B requesting
   the same data) are **the exact same URL string** — the only thing
   that differs between the two checks is which auth header gets
   attached, never the route itself. Showing them as separate paths
   in the earlier draft actively contradicted `run.py`'s own fallback
   logic (Module 17 §5), which only makes sense if the two really are
   the same URL.

```toml
[portal]
base_url = "http://localhost:3000"

[tiers]
claimed = ["T1", "T2"]
pitch = "Self-hosted hackathon judging with backend-enforced role isolation and shown, not hidden, normalization."

[auth]
organizer   = "Cookie: raptor_session=<printed at seed time — Module 17>"
judge_a     = "Cookie: raptor_session=<printed at seed time — Module 17>"
judge_b     = "Cookie: raptor_session=<printed at seed time — Module 17>"
participant = "Cookie: raptor_session=<printed at seed time — Module 17>"

[routes]
gallery      = "/events/sample-hack-2026/submissions"
submit       = "/events/sample-hack-2026/submissions"
judge_scores = "/submissions/<real-submission-id>/judges/<judge_a-real-id>/scores"
peer_scores  = "/submissions/<real-submission-id>/judges/<judge_a-real-id>/scores"
csv_export   = "/events/sample-hack-2026/export/submissions"
```

**Every `<...>` placeholder above gets replaced with the real ID
values Module 16's importer actually assigns on a live run** — this
file is filled in last, once, after a real seed has actually
happened, not written from this doc's imagination in advance.

---

## 4. What I'm testing for this module

- The `peer_scores` route, requested with judge A's own header,
  returns 200 with judge A's real scores.
- The same route, requested with judge B's header, returns 401/403 —
  the actual proof this whole module exists to produce. **Verified
  live: 403 specifically, not 401** — a meaningful distinction, since
  judge B is a real, authenticated identity being correctly refused,
  not an unrecognized one.
- The same route, requested with the seeded organizer's header,
  returns 200 — confirming the guard's "or an accepted organizer"
  clause works, not just its "or the matching judge" clause.
- **The same route, requested with no auth header at all, returns
  401** — distinct from the 403 cases above, and worth its own
  explicit test rather than assuming "some 4xx" is close enough,
  since 401 vs. 403 is a real, meaningful distinction this guard
  needs to get right in both directions.
- A full, real run of `run.py` against a freshly seeded portal, using
  a `.dogfood.toml` filled in exactly as Section 3 describes, reports
  every T1 and T2 check as `PASS` — the actual end-to-end proof that
  closes out Tier 0.

---

## 5. Open questions

None blocking. This closes the checker-blocking work list.
