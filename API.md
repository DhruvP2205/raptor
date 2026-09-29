# API

Every action available in the web app is an HTTP call to the same API
that anyone else can call. There is no second, private path.

This is a structural fact, not a promise: the web container has no
network route to the database or Redis, so the API is the only thing it
can talk to (`ARCHITECTURE.md` Section 4). Anything the interface can do,
the API can do, and the API enforces the rules either way.

This document states the contract, where the machine-readable spec
comes from, and how we keep it from drifting. The spec itself is
generated from the code; this file deliberately does not hand-copy a
route list, because a hand-copied list is the thing that goes out of
date.

---

## 1. The contract

1. **One API, no side doors.** No capability exists only in the
   frontend. If a screen can do it, a route exists for it.
2. **Rules live in the API.** Role checks, deadline checks and
   ownership checks run on every request. The frontend hiding a button
   is never the control. A judge requesting another judge's scores gets
   `403` from the API regardless of what any page shows.
3. **`401` and `403` mean different things.** `401`: no valid session.
   `403`: a valid session that is not allowed here.
4. **Times are ISO 8601 in UTC.** All deadlines are evaluated against
   server time when the request arrives.
5. **Exports are CSV over HTTP.** Organizer and admin exports return
   `text/csv` from ordinary GET routes (`stages/18-csv-export.md`).

## 2. Authentication

The API authenticates with an **opaque session token carried in a
cookie**. A browser gets it by logging in. A script gets the same
thing by sending the same header:

```bash
curl -H "Cookie: <session cookie>" "<api-base>/events/<slug>/export/submissions"
```

That is exactly how the acceptance checker calls it: one request, one
header, no login step. The boot process prints a ready-to-use header for
each seeded role (`stages/17-auth-header-bootstrap.md`).

**Limit, stated plainly:** session cookies are the only credential type.
There are no long-lived API keys or bearer tokens for third-party
integrations. That is the first thing to add for real machine clients.

## 3. Where the specification comes from

The OpenAPI document is generated from the same decorators that
validate requests, so there is one source of truth
(`ARCHITECTURE.md` Section 2). It is meant to be available three ways:

- served live by the running API (interactive reference page and raw
  JSON);
- exported to a committed `openapi.json` at the repository root by a
  single command, so it can be read without running anything;
- described with a cookie-based security scheme, since that is what the
  API actually uses.

*Status: confirmed against the running code — none of this exists yet.
See Section 5 for what was checked and what's actually there today.*

## 4. Keeping it honest

A specification that is not tested drifts. Three checks, each meant to
fail the build rather than warn:

1. **Route coverage.** Enumerate every route the running API registers
   and assert each appears in the generated document, except an explicit,
   short list of internal ones (health check and similar). A route added
   without documentation fails.
2. **Committed file is current.** Regenerate `openapi.json` and compare
   with the committed copy. A code change without a refreshed spec
   fails.
3. **UI-to-API traceability.** The web app reaches the API only through
   its shared client. Enumerate the client's operations and assert each
   maps to a documented operation. A screen that calls something
   undocumented fails.

The third check is what turns "every UI action is available through the
API" from a statement into something a test can break.

## 5. Not covered, and things confirmed

- **Webhooks are not built.** The API can be polled; it cannot notify.
- **No machine credentials** beyond session cookies (Section 2).
- **Confirmed: none of Section 3 exists yet.** A repo-wide search finds
  zero use of `@nestjs/swagger` or any OpenAPI tooling anywhere in
  `apps/api`. There is no generated `openapi.json`, and none of Section
  4's three drift checks are wired into the test run, because there is
  nothing yet for them to check. The honest description is exactly what
  this section already said: **"API-first by architecture, specification
  pending verification"** — now confirmed as the real, current state
  rather than an open question. "API-first by architecture" itself
  holds structurally regardless: the `web` container has no network
  route to Postgres or Redis (`ARCHITECTURE.md` Section 4), so nothing
  the frontend does can bypass the API even without a generated spec
  proving it route-by-route.
- **Confirmed: the API's base URL and port agree everywhere.** README,
  this file, and `.dogfood.toml` all use `http://localhost:4000`
  (`API_PORT=4000`).
- **Confirmed: the session cookie is named `raptor_session`**, set with
  `httpOnly: true`, `secure` true in production, and
  `sameSite: 'lax'` (`apps/api/src/auth/session.service.ts`) — real
  CSRF protection, not an assumption. See `THREAT-MODEL.md`'s "Session
  theft" row.
