# Stage Spec: Next.js 14 → 15 Upgrade

Status: **Design locked, not yet built.**

`pnpm audit`, run during the module-24 verification pass, found two
critical, unauthenticated-RCE advisories in `next@14.2.35`
(GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4), fixed in `15.5.24+`
(`docs/DECISIONS.md` D187, D189). This module exists to close that gap
— and only that gap. It is scoped, not just flagged, so it can actually
be picked up and finished in one pass rather than sitting as a vague
backlog line.

**Not in this module:** no redesign, no new App Router patterns
(server actions, `generateMetadata`, route handlers, `next/image`) —
none of those are in use today and none are being introduced as part
of this bump; no React Compiler adoption; no Turbopack build switch.
Purely: land on a patched Next 15, prove nothing broke, done.

---

## 1. Why this is smaller than it looks

The two headline Next 15 breaking changes are **async `cookies()` /
`headers()` / `params` / `searchParams`** and a **changed default
`fetch` caching behavior**. A scope check of the real codebase
(`apps/web`) before writing this doc found:

| Pattern that Next 15 changes | Present in this codebase? |
|---|---|
| Server Component `params`/`searchParams` props | No — all 5 dynamic routes (`certificates/[id]`, `events/[slug]`, `events/[slug]/assignments/[assignmentId]`, `submissions/[id]`, `users/[id]`) are `'use client'` pages reading the URL via `useParams()`/`useSearchParams()`, unaffected by the async-props change |
| `generateMetadata` | Not used anywhere |
| Route handlers (`app/**/route.ts`) | None — `web` only ever calls `api` over HTTP from client code, per `docs/ARCHITECTURE.md` |
| `next/headers` (`cookies()`/`headers()`) | Not used anywhere |
| `next/image` | Not used — posters/avatars render as plain `<img>` (see `EventCard.tsx`'s own eslint-disable comment) |
| `middleware.ts` | None |
| Third-party UI library with a pinned React peer dep | None — hand-built UI kit, no external design system (per `docs/design/FRONTEND-MEGA-DOC.md`) |

Net effect: the two changes that break most real Next 15 upgrades have
close to zero surface area here. What's left is a version bump, a
peer-dependency bump (React 18 → 19), and full regression coverage —
real work, but mechanical, not a redesign.

---

## 2. Items at a glance

| ID | Item | Type | Size |
|---|---|---|---|
| N1 | Bump `next` to `^15.5.24`, `react`/`react-dom` to `^19`, matching `@types/*` | Upgrade | Small |
| N2 | Re-run `next build` across all ~30 routes, fix any compile/type errors | Verify, fix if failing | Small–Medium |
| N3 | Confirm `next.config.js` keys (`output: 'standalone'`, `reactStrictMode`) still valid under 15 | Check | Tiny |
| N4 | Re-verify `StatStrip`'s `IntersectionObserver` effect and `PhaseProgressBar` under React 19 Strict Mode's effect double-invoke | Verify | Tiny |
| N5 | Docker image rebuild (`apps/web/Dockerfile`, `node:22-alpine` — already compatible, Next 15 needs ≥18.18) | Verify | Tiny |
| N6 | `pnpm audit` re-run post-bump — confirm the two critical advisories are actually gone, not just version-bumped past them | Verify | Tiny |
| N7 | Full route smoke pass (the same ~30-route list from `VERIFICATION.md` Section 6) plus the existing Playwright suite, if runnable in the target environment | Verify | Medium |
| N8 | `README.md` / `docs/DECISIONS.md`: remove the "Known security debt" callout once shipped, log the upgrade | Docs | Tiny |

---

## 3. Detail

**N1. The bump itself.** `apps/web/package.json`: `next` `^14.2.16` →
`^15.5.24`, `react`/`react-dom` `^18.3.1` → `^19.x`, `@types/react`/
`@types/react-dom` to their React-19-compatible majors. `pnpm install`,
resolve any peer-dependency warnings (none expected — no third-party
React UI library in this workspace). *Done when* `pnpm install` reports
no unresolved peer conflicts.

**N2. Build + typecheck.** `pnpm --filter @raptor/web build` and the
project's normal `tsc` check. Next 15's stricter typing around route
params (even though this codebase reads them client-side) and React
19's changed JSX types are the most likely source of real compile
errors. Fix forward; do not suppress with `any`. *Done when* the build
completes clean.

**N3. `next.config.js`.** Currently just `output: 'standalone'` and
`reactStrictMode: true` — both still valid keys in Next 15. Confirm via
a clean build with no config-deprecation warnings in the output. No
change expected; this is a check, not a task.

**N4. Effect-cleanup re-verification.** React 19 Strict Mode
double-invokes effects in dev the same way 18 did, but it's worth
explicitly re-confirming the two effect-driven components built this
session still behave correctly: `StatStrip`'s `IntersectionObserver`
(`observer.disconnect()` on cleanup, guarded by the `active` flag so a
double-invoke can't double-fire the count-up) and `PhaseProgressBar`
(no effects — pure render, lowest risk). *Done when* both are
confirmed in a dev-mode Strict Mode render, not just prod build.

**N5. Docker.** `apps/web/Dockerfile` already pins `node:22-alpine` for
both the `base` and `runtime` stages — well above Next 15's `>=18.18`
floor. No Dockerfile change expected; rebuild and confirm the image
still boots and serves `:3000` inside `docker compose up`.

**N6. Audit re-run.** `pnpm audit` from repo root, post-bump. *Done
when* GHSA-p293-qw3h-jr36 and GHSA-2xp9-vwfh-vxw4 no longer appear —
this is the actual close-out condition for the whole module, not the
version bump by itself (a bump to an unpatched 15.x would satisfy N1
but not the reason this module exists).

**N7. Regression pass.** Re-run the same ~30-route live-render check
`VERIFICATION.md` Section 6 already established (every route returns
`200`, no blank screen), plus `@playwright/test` if the target
environment supports browser automation (this session's sandbox has
not had that available — see D186/D187/D188's repeated honest
limitation on this point; if still unavailable when this module is
picked up, record that explicitly rather than silently skipping it).

**N8. Docs.** Once N6 passes: delete the "🚧 Known security debt"
callout this session added to `README.md`, and log a `DECISIONS.md`
entry recording the completed upgrade, the before/after `next`
version, and the `pnpm audit` result confirming the advisories are
resolved.

---

## 4. Build order

1. **N1** — the bump itself, first; everything else depends on it.
2. **N2, N3** — build/typecheck/config, immediately after, since N1
   without a clean build is not a usable state to leave the tree in.
3. **N5** — Docker rebuild, cheap to check early alongside N2/N3.
4. **N4, N7** — behavioral re-verification, once the tree builds clean.
5. **N6** — audit re-run, once everything above passes (confirms the
   actual goal, not just the mechanics).
6. **N8** — docs, last, once N6 is confirmed.

---

## 5. What I'm testing for this module

- `pnpm audit` shows neither GHSA-p293-qw3h-jr36 nor
  GHSA-2xp9-vwfh-vxw4 after the bump (the module's actual done
  condition, not a nice-to-have).
- Every route in the existing ~30-route smoke list still returns `200`
  post-upgrade — a regression here is exactly the risk this doc exists
  to manage.
- `StatStrip` and `PhaseProgressBar` (the two most recently added,
  effect-driven homepage components) are specifically re-checked under
  React 19, not assumed fine by extension of "the build passed."
- The Docker image builds and boots via `docker compose up --build`
  with no changes needed beyond the dependency bump.
- The full backend test suite is unaffected (this is a `web`-only
  dependency bump; `apps/api` and `apps/worker` do not depend on
  `next`) — a quick confirming run, not expected to find anything.

---

## 6. Open questions

- **Exact target version.** `^15.5.24` is the first patched line per
  the advisories found; pin to that or track latest-15 at
  implementation time — whichever is current when this module is
  actually built should be used, not whatever was current when this
  doc was written.
- **Playwright availability.** N7's browser-automation portion depends
  on tooling this session's sandbox has never had. If still
  unavailable, the module should still ship (N6's audit-clean state is
  the real security fix) with N7 honestly recorded as
  static-route-only verification, same honesty convention as every
  other module this session.
