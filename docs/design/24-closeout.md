# Stage Spec: Release Closeout

Status: **Design locked, not yet built.**
One module for every small task left after Modules 1 to 23. Most items
are **check, then fix only if the check fails**. A check that passes is
recorded and closed with no code change. If code and this doc disagree,
update this doc first.

**Not in this module** (each is a real feature, not a small task):
webhooks, the embeddable gallery widget, general bulk import/export,
the joint-model normalization upgrade, the pairwise implementation, the
unbound judge invitation link, and the final home-page spec.

---

## 1. Items at a glance

| ID | Item | Type | Size |
|---|---|---|---|
| A1 | Real acceptance run, report committed | Verify | Small |
| A2 | Fixture import feeds judge calibration profiles | Check, fix if failing | Small |
| A3 | Which timestamp repository verification reads | Read-only check | Tiny |
| A4 | Login and read-route rate limits | Check, add if missing | Small |
| A5 | Off-switch for fixture import | Add | Small |
| A6 | Session cookie attributes | Check, set if missing | Tiny |
| A7 | Gallery search and filter | Check, add if missing | Small |
| A8 | Cold-start test on Docker | Verify | Small |
| A9 | One truth for API base URL and port | Check, align | Tiny |
| B1 | Organizer audit-log viewer | New, small | Medium |
| B2 | Ballot order | Decide, then maybe add | Small |
| B3 | OpenAPI served, exported, and tested | Check, complete | Small to medium |
| C1 to C10 | Docs, licence, repo housekeeping | Edit | Small |

---

## 2. Group A: verify, then fix

**A1. Acceptance run.** Fill `.dogfood.toml`'s placeholders with the real
IDs and headers a fresh seed prints. From a fresh `docker compose up`,
run `python3 run.py .dogfood.toml > acceptance-report.txt`. Commit the
output unedited. `claimed` stays `["T1", "T2"]`. *Done when* the report
shows all seven checks passing, or every failure is fixed and the run
repeated. Run this last (Section 6), so it reflects the final code.

**A2. Calibration profiles.** The importer writes reviews directly, and
the step that normally updates each judge's profile does not run. Run
normalization on the imported fixture event and compare its ranking with
`scripts/normalization-proof.py` (37 of 40 ranks change, largest move
15). *If the platform shows no rank movement*, profiles are empty: fix
by populating profiles from the imported scores, using the same
function the submit-review step uses, idempotently. *If small
differences*, check the standard-deviation convention (sample, n minus
1). *Done when* the outcome is recorded in `NORMALIZATION.md` Section 7
and, if code changed, a test covers it.

**A3. Verification timestamp.** Read Module 6's code and record which
field it compares to the event window (commit metadata or push time).
No code change. *Done when* `THREAT-MODEL.md` limit 5.5 names it.

**A4. Rate limits.** Use the existing Redis limiter.
- *Login:* if none exists, limit failed attempts per (source, email)
  pair; default 10 per 15 minutes, then `429`. Keep the generic error
  message so accounts cannot be enumerated.
- *Public read routes, including the gallery:* if none, a generous
  per-source limit; default 120 requests per minute.
Both configurable by environment variable. The acceptance checker uses
static headers and makes seven requests, so neither limit can affect it.
*Done when* tests show the limit triggering and normal use passing.

**A5. Fixture-import switch.** Add `FIXTURES_IMPORT`, default `true`
(the checker needs the data at first boot). When `false`, skip the
fixture import and the seeded sessions entirely: no fixture event, no
seeded credentials, no headers file. Document it in the README as
production hardening. Also confirm and document behavior under
`DEMO_MODE=true`. *Done when* tests cover both values.

**A6. Cookie attributes.** Assert the session cookie is `HttpOnly` with
`SameSite=Lax` or stricter. Add `Secure` behind a `COOKIE_SECURE`
setting (default off for plain-http local runs; documented on for
production behind TLS). Confirm no state-changing route accepts GET.
*Done when* a test checks the `Set-Cookie` attributes.

**A7. Gallery search and filter.** Confirm the gallery route accepts a
text query and a track filter. If not, add `q` (title and description,
case-insensitive) and `trackId`. With no parameters the response must
remain the full, unpaginated list; the checker reads the raw body for
fixture titles. *Done when* tests cover filtered and unfiltered calls.

**A8. Cold start on Docker.** On a machine with Docker, from an empty
folder: clone, `docker compose up`, confirm migrations, seed, and the
printed headers; run `A1`; stop and start again and confirm data
persisted; then `DEMO_MODE=true docker compose up` and confirm the
banner, the four events, and that `raptor` is untouched. Record
results; correct any README step that fails. This closes the
"reviewed, not container-tested" caveat on Modules 19 and 20.

**A9. Base URL and port.** Establish which service and port serve the
API and which serve the frontend. Make `README.md`, `API.md` and
`.dogfood.toml` state the same thing.

---

## 3. Group B: small gaps

**B1. Audit-log viewer for organizers (T3).** Everything is already
logged and admins can export it; organizers cannot read their own
event's trail. The table has no structured event link, so:
1. Add a nullable, indexed `eventId` to `AuditLog`. Set it at write time
   for event-scoped actions. Backfill existing rows once, idempotently,
   from `metadataJson` where an event id is recoverable; leave the rest
   null.
2. Add `GET /events/:eventId/audit-log` (filters: date range, action;
   cursor-paginated, since the list is unbounded). Allowed for an
   accepted organizer of that event, or a site admin (audited). Columns:
   time, actor, action, target, reason, using Module 18's
   `(unavailable)` convention where metadata lacks a target or reason.
3. Add an "Audit log" item to the organizer shell; on mobile it renders
   as cards, like every other list there.
*Done when* an organizer sees only their own event's entries, an
organizer of a different event gets `403`, and null-event rows are never
shown to an organizer.

**B2. Ballot order.** Check the spec's T3 wording for randomized ballot
order. If required or judged, show each signed-in voter the shortlist in
an order seeded by (voter, round), so it is random across voters but
stable for one voter; anonymous viewers get a fixed order. Published
results are unaffected. If not required, record the decision and skip.

**B3. OpenAPI.** Serve the generated document from the running API,
add one command that writes `openapi.json` at the repository root, and
describe the cookie security scheme. Add the three checks from
`API.md` Section 4: route coverage (with a short explicit exclusion
list), committed file current, and UI-to-API traceability. Where
decorator coverage is poor, add decorators; do not hand-write spec
entries. Report how many routes needed work. *Done when* all three
checks run in the test suite.

---

## 4. Group C: documents, licence, housekeeping

| ID | Change |
|---|---|
| C1 | `NORMALIZATION.md`: real fixture path (`apps/api/prisma/fixtures.json`); record the A2 outcome |
| C2 | `README.md`: add the new documents to the docs map; add a "Bonus challenges" table copied verbatim from `23-bonus-challenges.md`; note that the scripts need numpy; add the production-hardening settings (A4, A5, A6); fix the base URL (A9) |
| C3 | `JUDGING.md` Section 5: a short pointer to `NORMALIZATION.md`'s limits, so the two agree |
| C4 | `DECISIONS.md`: log the fixture switch, the limits, the audit `eventId`, the ballot-order decision, and the normalization-method decision once made |
| C5 | `THREAT-MODEL.md`: update limits 5.4, 5.5, 5.7, 5.8 to match A3 to A6; delete its "still to confirm" section |
| C6 | `23-bonus-challenges.md`: move each status as its checks pass |
| C7 | `scripts/requirements.txt` containing `numpy` |
| C8 | `LICENSE`: MIT text, with the owner's name as copyright holder |
| C9 | Run the full test suite, then commit in logical groups. Do not commit the packaging zip or its `bonus/` folder. |
| C10 | Stray root `design/` folder and `design//docs/ARCHITECTURE-backup.md`: delete if older than or identical to the current docs; otherwise merge. Leave local scratch data; it is not committed. |

Also confirm the spec's full deliverables list, including the demo
video, which no module here produces.

---

## 5. Files touched

| Area | Files |
|---|---|
| Backend | login and read-route limiters, seed and fixture-import entrypoint, cookie configuration, gallery route, audit-log model and route, ballot ordering (if adopted), OpenAPI setup |
| Migration | one: nullable `eventId` on `AuditLog`, plus its backfill |
| Frontend | organizer shell: "Audit log" item and list |
| Config | `docker-compose.yml` and `.env.example` (new settings), `.dogfood.toml`, `openapi.json` |
| Docs | as in Section 4 |

---

## 6. Build order

1. **A9** first, because later items and documents depend on the answer.
2. **A5, A4, A6, A7, A2**: the code changes, smallest first.
3. **A3**: read-only, any time.
4. **B1, B2, B3**: the larger pieces.
5. **C1 to C7, C10**: documents and repo cleanup, now that the facts are settled.
6. **A8, then A1**: cold start and the acceptance run, last, on the final code.
7. **C8, C9**: licence and commit.

---

## 7. What I'm testing for this module

- Each new setting has a test for both values: `FIXTURES_IMPORT` on and
  off; rate limits triggering and not triggering.
- With `FIXTURES_IMPORT=false`, no fixture event, seeded session, or
  headers file exists.
- Session cookie attributes are asserted, not assumed.
- The unfiltered gallery still returns every submission, so the
  acceptance checker's fixture-title check still passes.
- The audit viewer's isolation includes the wrong-event case (an
  organizer of another event gets `403`), not only the wrong-role case.
- The OpenAPI checks fail when a route is added without documentation.
- The full suite passes before commit, and the real `run.py` shows all
  seven checks passing after all code changes.
- Every path and command named in the README, `API.md` and
  `NORMALIZATION.md` resolves.

---

## 8. Open questions

- **Licence holder name** for C8. Needed from the owner.
- **Ballot order (B2):** adopt only if the spec asks for it; otherwise
  record "not required" and skip.
- **Rate-limit numbers (A4):** the defaults above are starting points,
  not tuned values.
- **Audit-viewer scope (B1):** organizers of that event only, plus
  admins. Whether participants should ever see anything is not
  proposed.
