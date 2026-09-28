# CLAUDE.md

Instructions for any AI assistant (or human) doing development work in
this repository. Read this before touching anything.

---

## What this project is

An open, self-hostable hackathon submission & judging platform, built
against the "Dogfood" hackathon brief. The winning entry gets forked and
run in production for real hackathons — so the target isn't "looks done
for a demo," it's "an organizer could actually run this and trust it."

---

## The one rule that governs everything else

**`/docs/stages/*.md` is the source of truth for behavior. Code implements
what the docs say. If code and docs ever disagree, that's a bug — fix it
by either correcting the code to match the doc, or by updating the doc
first (with a clear reason) and then changing the code to match. Never
silently implement something different from what a stage doc says because
it seemed easier or more obvious while coding.**

Every design decision in this project went through an explicit
discussion-and-confirmation cycle before being written down. That process
is expensive and deliberate — don't undo it by improvising during
implementation. If something genuinely wasn't covered by a doc and you
have to make a judgment call to keep moving, mark it clearly (a `TODO:
undocumented decision, needs confirmation` comment) and flag it back
rather than quietly deciding and moving on.

---

## Where things are

```
docs/
  ARCHITECTURE.md       ← system shape, tech stack, network model
  DATA-MODEL.md         ← full schema, field-by-field, with rationale
  DECISIONS.md          ← chronological decision log (the "why")
  GLOSSARY.md           ← precise terminology — read this before using
                            any project-specific term in code or comments
  stages/
    01-auth-and-email-setup.md
    02-roles-and-membership.md
    03-event-management.md
    04-team-management.md
    05-submission-management.md
    ...                 ← one file per module, numbered in build order
apps/
  api/                  ← NestJS backend
  web/                  ← Next.js frontend
packages/
  shared/               ← types/DTOs shared between api and web
```

**Before implementing anything in a given module, read that module's
stage doc in full — not just the section that seems relevant.** Stage
docs cross-reference each other (e.g. Module 4 keys a permanent lock off
a field defined in Module 5's doc) — missing that context produces code
that's locally correct and globally wrong.

---

## Non-negotiable engineering principles

These came up repeatedly enough across every module that they're
project-wide rules, not per-module suggestions:

1. **Authorization is enforced in the backend, at the API boundary, never
   only in the UI.** If a check "works" only because a button is hidden
   or disabled client-side, it does not work. Every privileged route has
   a server-side guard. Write the test that calls the route directly
   (curl-equivalent), not just the test that clicks through the UI.

2. **Deadlines and windows are checked against server time, at the
   moment of the write.** Never trust a client-supplied timestamp, a
   disabled-button state, or a countdown timer as a substitute for a
   real server-side check on every mutating request.

3. **Nothing sensitive is stored in a directly-usable form.** Passwords:
   argon2. Session tokens, verification tokens, invitation tokens: random,
   high-entropy, and **stored hashed** — the raw value is never
   persisted anywhere after issuance. This pattern repeats everywhere;
   don't invent a new one per feature.

4. **Nothing gets silently destroyed.** Bans, declines, expirations,
   deletions of anything with downstream consequences (a team, an
   invitation, a voting round) either soft-delete/status-flag or
   explicitly cascade with the cascade documented — never a bare `DELETE`
   with no consideration of what depends on the row.

5. **Every privileged or destructive action writes to the audit log.**
   Role assignment, invitation actions, results publication, voting round
   resets, admin bypasses of normal scoping — if it's the kind of action
   an organizer or a future dispute would want a record of, it goes in
   `AuditLog`, not just in application logs.

6. **No third-party hosted service dependency, ever.** No cloud database,
   no auth-as-a-service, no third-party CAPTCHA, no provider-specific
   mail API. Plain protocols (SMTP) and self-hosted primitives
   (Postgres, Redis) only, config-driven so a self-hoster can point them
   anywhere. `docker compose up` must produce a fully working instance
   with zero external accounts.

7. **User-supplied content that gets rendered back to other users is
   always sanitized, and sanitization runs through one shared code path
   used identically in every context that renders it** (preview and
   production, certificate view and certificate download, etc.) — never
   two implementations that could silently drift apart.

8. **File uploads are validated by actual content (magic bytes), never by
   extension or client-declared MIME type, and are re-encoded server-side
   before storage** — never stored as the raw uploaded bytes.

9. **`TEST_MODE` and any other test-only behavior is off by default, has
   exactly one call site per behavior, and is documented loudly enough in
   `.env.example` that nobody enables it in production by accident.**

---

## Coding conventions

- **TypeScript everywhere.** Backend (NestJS), frontend (Next.js), shared
  types (`packages/shared`) — one language, one type system, no
  boundary where types have to be manually kept in sync between two
  languages.
- **Prisma is the schema source of truth for the database** —
  `DATA-MODEL.md` is the human-readable narrative of the same schema;
  if they diverge, the Prisma schema is corrected to match the documented
  design (the design was decided deliberately; the schema implements it,
  not the other way around).
- **DTOs use `class-validator` decorators** for request validation —
  don't hand-write if-chains for shape/type checking when the framework's
  declarative validation covers it.
- **Every guard checks the specific resource's scope**, not a global
  role. `@RequireEventRole(...)` resolves `eventId` from the request path
  and checks membership for *that* event — there is no global "is this
  user an organizer" check anywhere in the codebase.

---

## Testing philosophy

- Every module's stage doc ends with a "What I'm testing for this
  module" section — treat that list as a minimum required test set, not
  a suggestion.
- Deadline/timestamp logic is tested by manipulating fixture timestamps
  into the past/future, never by waiting real time in a test run.
- Isolation/permission tests always include the "wrong scope" case (an
  organizer on Event A hitting Event B's routes), not just the "wrong
  role" case — both are real, both are tested.
- The acceptance suite (once it exists) runs against a live seeded
  instance and produces `acceptance-report.txt`, tier by tier — this is
  separate from and in addition to per-module unit/integration tests.

---

## What to do if something seems underspecified

1. Check the relevant stage doc's "Open questions" section — it may
   already be flagged as a known gap with a stated default.
2. Check `DECISIONS.md` — the reasoning behind a seemingly-arbitrary rule
   is probably recorded there even if the stage doc doesn't restate it.
3. Check `GLOSSARY.md` — a lot of apparent ambiguity is just imprecise
   terminology; the exact meaning of a term like "phase" vs. "status" is
   fixed and defined there.
4. If it's genuinely not covered anywhere: implement the smallest
   reasonable interpretation, mark it clearly as an assumption in a code
   comment, and surface it explicitly rather than letting it pass as if
   it were already decided.
