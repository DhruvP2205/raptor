# VERIFICATION.md — Master Check List

One document to run start to finish. Every check has: what to do, the
exact command or steps, what a pass looks like, and what a fail looks
like. **Section 10 has the copy-paste template — fill in each check's
row as you go, then paste the whole table back.** Do not summarize; a
`FAIL` with the actual output is more useful than a clean-looking
`PASS` list.

Run the sections in order. Section 1 has to pass before anything else
is meaningful.

---

## 1. Docker / infrastructure

| # | Check | How | Pass | Fail looks like |
|---|---|---|---|---|
| 1.1 | Fresh clone boots | Empty folder, `git clone`, `docker compose up`, watch logs | No errors; migrations run; server listening | Any container exits, or migration error |
| 1.2 | Auth headers printed | Read the boot log | Four lines: organizer, judge_a, judge_b, participant, each a full `Cookie: ...` string | Missing role, bare token with no header name, or nothing printed |
| 1.3 | Fixtures imported correctly | `curl http://localhost:3000/events/sample-hack-2026/submissions` (or your real gallery route) | Response includes real project titles from `fixtures.json` | Empty list, or generic seed data instead of the fixture |
| 1.4 | Fixture counts match the file | Query the DB or an admin export | 8 tracks, 30 judges, 40 teams, 41 projects, 123 reviews (after the resubmission collapse — see 3.16) | Different counts, especially 41 submissions instead of 40 |
| 1.5 | Idempotent seed | `docker compose restart api`, re-check 1.4 | Identical counts, no duplicates | Counts double, or duplicate-key errors in the log |
| 1.6 | Data persists across restart | Note an ID from 1.3, `docker compose down` (no `-v`), `docker compose up`, look it up again | Same ID, same data | Data gone — means the volume isn't actually persistent |
| 1.7 | `DEMO_MODE=true` isolation | `DEMO_MODE=true docker compose up`, confirm 4 new events exist, confirm banner shows on every page, non-dismissible | 4 events at different phases; banner never goes away by clicking | Real event data missing, or banner has a close button |
| 1.8 | Turning `DEMO_MODE` off leaves `raptor` untouched | Stop, unset `DEMO_MODE`, `docker compose up`, check the real database | Only the fixture event exists, no demo events, no banner | Demo events or banner appear with `DEMO_MODE` off |
| 1.9 | Secrets aren't in plain env | `docker inspect <api container>` | No SMTP password, DB password, or signing key visible in `Env` | Any secret value visible in inspect output |
| 1.10 | Ports match the docs | Compare `docker compose config` output to `README.md` / `.dogfood.toml` | Same base URL and port everywhere | A mismatch between what's documented and what's actually bound |

---

## 2. The acceptance checker itself

| # | Check | How | Pass | Fail looks like |
|---|---|---|---|---|
| 2.1 | Real run, unedited report | Fill `.dogfood.toml` with real values from the boot log, run `python3 run.py .dogfood.toml > acceptance-report.txt` | All seven checks `PASS` | Any `FAIL` line — copy its exact detail lines |
| 2.2 | `peer_scores` and `judge_scores` are the same URL | Read the filled-in `.dogfood.toml` | Both routes are identical strings | They differ — this alone would make the peer-isolation check meaningless even if it happens to pass |
| 2.3 | No-auth request | `curl -i http://localhost:3000/<judge_scores route>` with no header at all | `401` | `403`, `200`, or a crash |
| 2.4 | Wrong-judge request | Same route, judge B's header | `403` (not `401`) | `401` (wrong error code), or `200` with real data |
| 2.5 | Organizer can still reach it | Same route, organizer's header | `200` | `403` — would mean the audit/oversight path is broken |

---

## 3. Backend modules, one guarantee each

For every module: the single most important thing that must hold, and
how to check it directly rather than by reading code.

| # | Module | The guarantee | How to check |
|---|---|---|---|
| 3.1 | Auth (1) | Session cookie is `HttpOnly`; wrong password gives a generic error | `curl -i` a login with a bad password; inspect `Set-Cookie` on a real login |
| 3.2 | Roles (2) | Judge and organizer are mutually exclusive account types | Try granting both to one account via the API directly; must be rejected |
| 3.3 | Events (3) | A `DRAFT` event is invisible to a non-member, not "visible but forbidden" | Request a draft event's page as an unrelated account; expect `404`, not `403` |
| 3.4 | Teams (4) | Roster locks permanently once `everSubmitted` is true, survives unsubmit | Submit, then unsubmit, then try to kick a member — must still be blocked |
| 3.5 | Submissions (5) | A late POST after `submissionsCloseAt` is rejected server-side | POST with a manually forged old-looking timestamp in the body — should still be rejected on server time, not client-claimed time |
| 3.6 | Verification (6) | A disqualified submission never re-enters the assignment pool | Disqualify one, confirm it's absent from the assignment screen/API |
| 3.7 | Assignment (7) | A judge never sees more than their cap | Set a low `maxProjectsPerJudge`, try to assign past it |
| 3.8 | Scoring (8) | Weighted criteria must sum to exactly 100 | Try saving a rubric that sums to 99 or 101 — must be rejected |
| 3.9 | Normalization (9) | Locked permanently after `resultsAnnounceAt`, no admin override | After announcement, try to re-run normalization as admin — must be refused |
| 3.10 | Results (10) | A disqualified entry is absent, not re-ranked around | Disqualify 2nd place, confirm there's a gap, not a promoted 3rd place |
| 3.11 | Voting (11) | Tally is invisible while the round is open, even to the organizer's own dashboard view meant for the public page | Check the public results while a round is open — no percentages anywhere |
| 3.12 | Certificates (12) | A tampered payload fails signature check visibly | Alter one byte of a certificate's stored payload directly in the DB, reload the view — must show a visible failure, not a silently "valid" certificate |
| 3.13 | Comments (13) | A comment survives its submission reverting to draft | Post a comment, revert the submission to draft, confirm the comment is still visible |
| 3.14 | Global Ranking (14) | Served from a cached snapshot, not computed per request | Check response time stays flat as data grows, or confirm a snapshot table exists and is what's queried |
| 3.15 | Fixtures import (16) | Never makes a real network call | Run the import with network access blocked at the container level; must still complete |
| 3.16 | Fixtures import (16) | Resubmission collapse: the team with two project entries becomes one submission | Query for that team's submissions — expect exactly one, with the later content |
| 3.17 | Auth bootstrap (17) | Reused, not reissued, on restart | Restart twice, confirm the four printed headers are byte-identical both times |
| 3.18 | CSV export (18) | Rank column blank pre-publish | Export Scores for an unpublished event — Rank column must be empty, not a guess |
| 3.19 | CSV export (18) | Admin routes refused for an event's own organizer | Call an admin-tier export as that organizer — must be `403` |
| 3.20 | `.dogfood.toml`/route (19) | Guard has three valid callers only | Test all three (matching judge, accepted organizer, admin) plus one invalid (a different judge) |
| 3.21 | Demo environment (20) | Timeline fields are internally consistent | Check `registrationClosesAt <= eventStartsAt` for every demo event — this is the exact bug found once before |
| 3.22 | Closeout A2 | Fixture import actually feeds judge calibration profiles | Run normalization on the fixture event; compare against `scripts/normalization-proof.py`'s output — ranks should move similarly, not stay flat |

---

## 4. Security / vulnerability checks

| # | Check | How | Pass | Fail looks like |
|---|---|---|---|---|
| 4.1 | SQL injection | Send `' OR '1'='1` in a search/query parameter | No error, no extra data returned | A DB error leaks to the response, or unfiltered data returns |
| 4.2 | Stored XSS | Post a comment or submission description containing `<script>alert(1)</script>` | Rendered as literal text, never executes | An alert fires, or raw HTML is present in the rendered page source |
| 4.3 | IDOR on scores | Guess a sequential-looking submission/judge ID pair you have no relation to | `403`/`404`, never real data | Real data returned for a resource you were never granted |
| 4.4 | Malformed/expired session | Send a made-up cookie value | `401` | `500` error, or worse, treated as authenticated |
| 4.5 | Upload content-type spoofing | Rename a `.exe` or script file to `.png`, upload it as a poster | Rejected — magic-byte check should catch it | Accepted and stored |
| 4.6 | SVG certificate template with a script tag | Upload an SVG containing `<script>` | Rejected on upload | Accepted, and the script appears in a rendered certificate |
| 4.7 | Rate limiting on login | Script 20 rapid failed logins from one source | Eventually `429` | No limit at all — unlimited guessing |
| 4.8 | Rate limiting on a public read route | Script 200 rapid requests to the gallery | Eventually `429`, or confirm this is a known, documented gap | Silent, unlimited — acceptable only if explicitly documented as not yet limited |
| 4.9 | Cookie flags | Inspect `Set-Cookie` on login | `HttpOnly` always present; `SameSite=Lax` or stricter | Missing `HttpOnly` — a real XSS-to-session-theft path |
| 4.10 | Dependency audit | `pnpm audit` (or npm equivalent) in `apps/api` and `apps/web` | No critical/high vulnerabilities, or each one explicitly triaged | Unaddressed critical vulnerabilities |
| 4.11 | Secrets not in git history | `git log -p -- secrets/` (excluding `.example` files) | Nothing but `.example` templates ever committed | A real secret value appears anywhere in history |
| 4.12 | GitHub token never returned in plaintext by any API response | Call any route that touches verification as organizer/admin | Token field absent or masked | Full plaintext token in a JSON response |

---

## 5. API contract checks

| # | Check | How | Pass | Fail looks like |
|---|---|---|---|---|
| 5.1 | Every UI action has an API equivalent | Pick 5 random buttons in the app, find their network call, replay it with `curl` and the right header | Same result as clicking | An action only works from the browser, not replayable |
| 5.2 | OpenAPI spec is real and current | Hit the served OpenAPI endpoint, diff against committed `openapi.json` | Identical | Drifted, or the endpoint 404s |
| 5.3 | Undocumented route check | Compare every route the API actually registers against the OpenAPI doc | Every route present (except an explicit exclusion list) | A real route missing from the spec |

---

## 6. Frontend

| # | Check | How | Pass | Fail looks like |
|---|---|---|---|---|
| 6.1 | Pages actually render | Visit all 34 URLs from `FRONTEND-MEGA-DOC.md` Part 3 | Every one renders without a blank screen or crash | Any page 500s, or shows nothing |
| 6.2 | Mobile responsive | Resize to ~375px width (or real device) on the Events list, Results, and Assignment board specifically | Table becomes stacked cards, no horizontal scrollbar on the page body | A table just shrinks or requires side-scrolling |
| 6.3 | No console errors | Open dev tools console, click through 10 pages | Clean, or only expected/benign warnings | Red errors on normal navigation |
| 6.4 | Reduced motion respected | Enable "prefers reduced motion" at the OS level, reload | All animations collapse to near-instant | Animations still play |
| 6.5 | Keyboard navigation | Tab through a form and a modal | Visible focus ring at every step, modal traps focus | Focus disappears, or escapes the modal into the page behind it |
| 6.6 | Basic performance | Run Lighthouse (or similar) on the home page and Events list | No obvious red flags — large unoptimized images, huge JS bundles | Multi-second load, huge bundle warnings |

---

## 7. Bonus challenges

| # | Check | Confirms |
|---|---|---|
| 7.1 | Threat Model's 5 open items (verification timestamp, rate limits ×2, fixture-import switch, cookie flags) | Same checks as Section 4.7, 4.8, 4.9, plus reading the verification code for which timestamp it uses |
| 7.2 | Normalization Proof platform cross-check | Same as 3.22 |
| 7.3 | API First's three tests exist and run | Same as Section 5, plus confirm they're wired into CI/the test command, not just possible to run manually |

---

## 8. Deliverables sanity check

| # | Check |
|---|---|
| 8.1 | `LICENSE` file exists at the root with real content, not a placeholder |
| 8.2 | Demo video exists, is watchable, and actually shows the running app — not just narrated slides |
| 8.3 | `acceptance-report.txt` is committed and matches a real run (Section 2.1), not hand-edited |
| 8.4 | README's docs map links resolve — every file it names actually exists at that path |

---

## 9. What "good" looks like overall

- Section 1 and 2 are the floor. If anything there fails, fix it before spending time on Sections 4–7.
- A `FAIL` in Section 4 is more valuable to report than a `PASS` — these are the ones most likely to cost real points if wrong, and most likely to be quietly assumed rather than actually checked.
- It is fine, and expected, for some Section 4/5 items to come back "not yet implemented" rather than pass/fail — say so plainly rather than skipping the row.

---

## 10. Reporting template — fill this in and paste back

```
SECTION 1 — DOCKER
1.1  [PASS/FAIL]  <what actually happened>
1.2  [PASS/FAIL]  <what actually happened>
1.3  [PASS/FAIL]  <what actually happened>
1.4  [PASS/FAIL]  <actual counts if different>
1.5  [PASS/FAIL]
1.6  [PASS/FAIL]
1.7  [PASS/FAIL]
1.8  [PASS/FAIL]
1.9  [PASS/FAIL]
1.10 [PASS/FAIL]

SECTION 2 — ACCEPTANCE CHECKER
2.1  [PASS/FAIL]  <paste the actual run.py output here in full>
2.2  [PASS/FAIL]
2.3  [PASS/FAIL]  <status code received>
2.4  [PASS/FAIL]  <status code received>
2.5  [PASS/FAIL]  <status code received>

SECTION 3 — MODULES
3.1  [PASS/FAIL/NOT CHECKED]  <notes>
... (repeat through 3.22)

SECTION 4 — SECURITY
4.1  [PASS/FAIL/NOT CHECKED]  <notes>
... (repeat through 4.12)

SECTION 5 — API CONTRACT
5.1  [PASS/FAIL/NOT CHECKED]
5.2  [PASS/FAIL/NOT CHECKED]
5.3  [PASS/FAIL/NOT CHECKED]

SECTION 6 — FRONTEND
6.1  [PASS/FAIL/NOT CHECKED]  <which pages, if any, failed>
... (repeat through 6.6)

SECTION 7 — BONUS
7.1  [PASS/FAIL/NOT CHECKED]
7.2  [PASS/FAIL/NOT CHECKED]
7.3  [PASS/FAIL/NOT CHECKED]

SECTION 8 — DELIVERABLES
8.1  [PASS/FAIL]
8.2  [PASS/FAIL]
8.3  [PASS/FAIL]
8.4  [PASS/FAIL]

OVERALL: <anything that surprised you, or that you weren't able to test>
```
