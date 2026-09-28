# Stage Spec: Seed-Time Auth-Header Bootstrap

Status: **Implemented and live-verified.** Session-reuse mechanism
corrected after an initial implementation issued fresh tokens on
every boot (see Section 4); reuse now confirmed byte-identical across
repeated seed runs with zero session-row growth, and a reused
credential verified to actually still authenticate, not just to look
unchanged. 440/440 tests passing.
Backend, continuing the sequence after Fixtures Import (Module 16).
Verified directly against the real `run.py` source, not just the spec
page's prose description — see Section 5 for exactly what that
changed. If code and this doc disagree, update this doc first.

---

## 1. Scope

Generate four real, working session credentials — one each for
`organizer`, `judge_a`, `judge_b`, `participant` — at seed time, and
print them in a form that can be copied verbatim into
`.dogfood.toml`. This exists solely so the checker (`run.py`) can
attach a header to each of its seven requests without ever calling a
login endpoint — confirmed directly from the source: every check is
one independent HTTP request with one header attached; there is no
login call anywhere in the script, no cookie jar, no multi-request
session establishment of any kind.

**This has no real-user-facing use whatsoever.** A real participant,
judge, or organizer always goes through Module 1's actual login flow,
every time, with no exception. This mechanism only ever touches the
four fixture identities Module 16 creates.

---

## 2. Why this needs no new authentication code path

Module 1's real session model is already exactly what this needs: an
opaque, high-entropy token, stored hashed, presented back as a cookie.
This module doesn't invent a second way to authenticate — it just
creates a real `Session` row directly, the same way a successful
login does, and skips straight to the row that a login would have
produced anyway. `SessionAuthGuard` reads a cookie and looks up a
session; it has no way to tell, and no reason to care, whether that
session came from a password check or a seed script.

**Confirmed from the real `run.py`:** the header value it attaches is
whatever string sits in `.dogfood.toml`, split once on the first
colon into a header name and value, then applied directly to the
request (`req.add_header(name, value)`). This means what we print, and
what goes into the toml file, must be a **complete header line** —
e.g. `Cookie: raptor_session=ab12cd34...` — not a bare token. Printing
just the token and expecting the checker to know what header name to
wrap it in would be a real, silent failure mode.

---

## 3. What gets printed, and where

At the end of the seed step (after Module 16's fixture import
completes, so the four identities already exist), print four lines to
stdout, clearly delimited so a human copying them into
`.dogfood.toml` can't misattribute one to the wrong role:

```
--- dogfood auth headers (copy into .dogfood.toml) ---
organizer:   Cookie: raptor_session=<token>
judge_a:     Cookie: raptor_session=<token>
judge_b:     Cookie: raptor_session=<token>
participant: Cookie: raptor_session=<token>
--------------------------------------------------------
```

**Also written to a file** (`apps/api/.fixture-auth-headers.txt`,
gitignored). **This file is load-bearing, not a convenience — an
earlier version of this doc wrongly called it the latter.** `Session`
stores only a token's hash (Module 1's hash-everything pattern, no
exception made for these four); once a token is issued, its raw value
cannot be reconstructed from the database on any later run. This file
is the *only* place a previously-issued raw token survives between
boots — losing it means the corresponding session, while still
technically valid in the database, becomes unreachable, since nothing
can regenerate the string a human would need to paste into
`.dogfood.toml`.

---

## 4. [CORRECTED] Interaction with Module 16's idempotency

Re-running the seed step must **not** silently rotate these tokens
out from under a `.dogfood.toml` that already has the old ones copied
in. **An earlier implementation attempt got this wrong** — it issued
a brand-new session for all four roles on every boot, which is
functionally harmless in isolation but defeats the whole point of
Section 3's file: a human who already copied yesterday's tokens into
`.dogfood.toml` would find them silently invalid after any container
restart.

**Corrected mechanism:** one `FixtureImportRecord` per role
(`fixtureType: "auth-session"`) tracks whether a session already
exists for that role. On each seed run: if a record exists **and**
the session it points to is still valid, reprint the *same* value
read back from Section 3's file rather than issuing a new one; only
issue a fresh session (and a fresh record) the first time a role has
none, or if its prior session was somehow invalidated. A container
restart during real iteration on `.dogfood.toml` produces the
byte-identical four values every time, not four new ones.

---

## 5. What reading the real `run.py` source changed, versus the
earlier design based on the spec page's prose alone

- **Header format precision (Section 2)** — the spec page said "a
  working header," which is accurate but underspecified; the source
  makes clear it's a literal, complete `Name: Value` string, split by
  the checker itself, not a value the checker knows how to wrap.
- **No login call, confirmed structurally, not just described** — the
  script has no request that could plausibly be a login (no POST to
  anything resembling `/auth/*`, no stored cookie jar carried between
  requests). Every one of the seven checks independently attaches
  whatever static header string it was given. This confirms the
  design in Sections 1–2 was already pointed the right direction, but
  it's confirmed now rather than inferred.
- **T1 gates T2 in the report's headline scoring** — not something
  this module needs to *do* anything about (it doesn't touch scoring
  logic), but worth recording here since it changes how urgently
  Module 16/17's correctness matters: a single T1 failure — including
  one this module could cause, like a malformed header string —
  zeroes out the entire "verified" tier count in the report,
  regardless of how well T2 otherwise works.
- **The `peer_scores` check's exact mechanics, confirmed precisely**:
  the checker builds one URL — `routes.peer_scores`, falling back to
  `routes.judge_scores` if `peer_scores` isn't set — and requests it
  with `judge_b`'s header, expecting 401/403. `.dogfood.toml` should
  set `peer_scores` explicitly to the specific route that would return
  `judge_a`'s scores, rather than relying on the fallback, since the
  fallback exists for a team that never separated the concept at all
  — we have, so we should be explicit.

---

## 6. What I'm testing for this module

- A freshly seeded portal, with the four printed headers copied
  verbatim into a `.dogfood.toml`, passes all four T2 checks when
  `run.py` is actually run against it — this is the real end-to-end
  proof, not just a unit test of token generation.
- Re-running the seed step twice produces **byte-identical** header
  values both times, confirmed against actual output, not just
  assumed from the reuse logic's design — a `.dogfood.toml` filled in
  after the first run stays valid after a second, and session-row
  count doesn't grow on the reused run.
- **A reused credential is re-verified live, not just compared as a
  string** — reboot the API after a reuse-triggering second seed run
  and re-run the T1/T2 checks against the *same* header values printed
  the first time, confirming the underlying session is still actually
  valid, not merely that the printed text looks unchanged.
- The printed header for `participant`, attached to a request for
  `judge_scores`, is refused — confirming this bootstrap didn't
  accidentally grant broader access than the role it's meant to
  represent.
- A header string containing a raw `#` character is never produced —
  the checker's own TOML fallback parser (used on Python versions
  before 3.11) truncates a value at `#`, treating it as a comment
  start; our session tokens are generated from a character set that
  can't contain one, but this is worth a direct test rather than an
  assumption about the token generator's alphabet.

---

## 7. Open questions

None blocking. One thing to verify once `.dogfood.toml`'s real
routes are finalized (Module 17's sibling task): confirm we set
`peer_scores` explicitly rather than depending on the fallback
mentioned in Section 5 — an easy thing to forget once the file is
being filled in by hand rather than read from this doc.
