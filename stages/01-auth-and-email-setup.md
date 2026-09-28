# Stage Spec: Auth & Email Setup

Status: **Design locked, not yet implemented.**
This document is the source of truth for building Module 1 (Auth & Identity)
and its email-verification dependency. If code and this doc ever disagree,
treat that as a bug in the code, not a reason to reinterpret the doc — come
back and update this file first if a real change is needed.

---

## 1. Scope of this stage

- User signup, login, logout
- Password hashing
- Server-side session management (creation, validation, revocation)
- Email verification flow, including the `TEST_MODE` mechanism
- SMTP integration via Docker secrets (provider-agnostic)

Explicitly **not** in this stage: roles/permissions logic beyond "a session
resolves to a User" (that's Module 2), event/team/submission logic (Modules
3-6). Those modules consume this one; they are not built here.

---

## 2. Password & session model

- **Hashing:** argon2 (memory-hard). Never bcrypt, never plain hashing.
- **Sessions are opaque server-side tokens, not JWTs.**
  - Rationale: JWTs can't be un-issued without extra revocation
    infrastructure. Opaque tokens can be deleted/revoked instantly by
    deleting the `Session` row — required for logout guarantees and future
    account-banning to actually take effect immediately.
  - The raw session token is set as an **HttpOnly, Secure, SameSite=Lax**
    cookie. It is never returned in a JSON response body, and the frontend
    never stores it in localStorage/sessionStorage. This is a deliberate
    XSS mitigation — relevant later because organizers will upload SVG
    certificate templates, another XSS surface in the same browser context.
  - The token is **hashed before storage** in the `Session` table (same
    principle as verification tokens below) — the DB never holds a value
    that's directly usable to impersonate a session if the DB were ever
    read by an attacker.
- **Session fields:** `id`, `userId`, `tokenHash`, `userAgent`, `ipHash`,
  `expiresAt`, `createdAt`, `revokedAt`.
- **Logout** deletes/revokes the session server-side. Clearing the client
  cookie alone is never sufficient — a stolen token must stop working the
  moment logout happens, not just stop being sent by the legitimate client.

---

## 3. Signup & email verification flow

1. `POST /auth/signup` — email, password, display name.
   - Argon2-hash the password.
   - Create `User` with `emailVerifiedAt: null`.
   - Reject signup outright if the email is on the banned-email list
     (`User.bannedAt`/`bannedReason` from a prior ban) — banning by email
     must also block re-registration, not just block the old account.
2. Generate a verification token:
   - High-entropy random value.
   - **Stored hashed**, never stored raw — same rationale as sessions.
   - Short expiry (24h default).
3. Dispatch the verification email (see Section 4 for exactly how, this is
   where `TEST_MODE` branches behavior).
4. `POST /auth/verify-email` — looks up the hashed token, checks expiry,
   sets `emailVerifiedAt = now()`, invalidates the token (single use).
   - Hitting an already-verified account's link again is **idempotent** —
     no error, just a no-op success.
   - An expired token returns a specific "expired, request a new one"
     error, with a resend path.

**Login is not gated on verification.** A user can log in unverified and
browse; verification is only required to *act* on things that need it later
(e.g. voting eligibility, per the voting module spec). Do not block login
itself on `emailVerifiedAt` unless a future module explicitly requires it.

---

## 4. SMTP integration

### 4.1 Provider-agnostic by design

The app integrates against **plain SMTP** (`host`, `port`, `user`,
`password`), not any provider-specific API (no Gmail OAuth Send API, no
SendGrid/Postmark REST API, etc.). This means:

- Any SMTP-speaking provider works through identical config — a
  self-hosted mail server, an organization's existing mail infrastructure,
  or a consumer provider's SMTP relay if someone chooses that.
- There is exactly **one** code path for sending mail. No separate
  "dev mode" mailer and "prod mailer" to keep in sync.

### 4.2 Secrets handling

SMTP credentials are **never** plain environment variables in
`docker-compose.yml`. They are mounted via Docker Compose's `secrets:`
mechanism:

```yaml
secrets:
  smtp_credentials:
    file: ./secrets/smtp_credentials.txt   # gitignored; self-hoster fills this in

services:
  api:
    secrets:
      - smtp_credentials
```

The app reads `/run/secrets/smtp_credentials` at startup. This value never
appears in `docker inspect`, shell history, or `docker-compose.yml` itself.
A self-hoster edits one file with their own SMTP details and it works — no
code change required.

`secrets/smtp_credentials.txt.example` is committed to the repo as a
template with placeholder values and inline comments explaining each field.

### 4.3 No local mail-catcher container (Maildev/MailHog rejected)

**Decision reversed from an earlier draft of this plan — recorded here so
it isn't reintroduced by accident.**

A local SMTP-catcher container (e.g. Maildev) was originally proposed to
let the seeded demo work without real SMTP configured. This was rejected:

- It has **zero use case in a real deployment** — pure demo scaffolding
  that becomes dead weight (one more container to maintain, secure, and
  explain) the moment this platform is actually adopted and run for years,
  which is the entire point of the brief.
- The problems it solved are better solved by:
  1. **Seed data is pre-verified directly in the database.** The seed
     script never goes through the signup/email flow — it inserts users
     with `emailVerifiedAt` already set. The demo/gallery/judging/voting
     flows work fully without email ever being involved.
  2. **`TEST_MODE`** (Section 5) for the one place the *real* signup→verify
     round-trip needs to be exercised by the acceptance suite.

**Service list for this stage: Postgres, Redis, API, web. No mail-catcher
container, ever.**

---

## 5. `TEST_MODE` — the acceptance-suite email mechanism

### 5.1 The flag

- **Env var:** `TEST_MODE` (boolean).
- **Default: `false` / unset**, in every real deployment. This is the
  state of a fresh clone and the state documented as correct for
  production in `.env.example`, with a loud inline warning:

  ```
  # TEST_MODE=false
  # NEVER enable in production — writes verification tokens to logs
  # when true. Only for local development / running the acceptance suite.
  ```

### 5.2 Behavior when `TEST_MODE=false` (default, real deployments)

- Verification email is sent via configured SMTP. Normal path, nothing
  special. No token is ever logged, printed, or returned in any API
  response body under this mode.
- If no SMTP is configured at all in this mode, signup should still
  succeed, but the user should see a clear message that verification mail
  could not be dispatched (e.g. "contact your administrator") — never
  silently pretend the email sent, and never fall back to logging as a
  substitute for real delivery in this mode.

### 5.3 Behavior when `TEST_MODE=true` (dev / acceptance suite only)

On every verification-email dispatch, **both** of the following happen:

1. **The verification token/link is written to the API's log output**
   (stdout), in a clearly delimited, greppable format, e.g.:
   ```
   [TEST_MODE] verification_token email=user@example.com token=<raw-token> link=https://.../verify-email?token=<raw-token>
   ```
   This is what the acceptance suite reads programmatically (parse
   container logs, or capture stdout directly in a test harness) to
   complete the real signup→verify→login round-trip without needing
   inbox access.
2. **A real email is also sent** through whatever SMTP is configured (if
   any is configured in the test environment), with subject and body
   explicitly marked as a test message, e.g.:
   - Subject: `[TEST MODE] Verification email — do not treat as real`
   - Body includes a first line: *"This is a test-mode email sent during
     development or automated testing. If you were not expecting this,
     no action is needed."*

   If no SMTP is configured while `TEST_MODE=true`, step 1 (logging) still
   happens; step 2 is simply skipped (nothing to send through). This is
   not an error condition.

### 5.4 Why both, and why this doesn't get simplified further

- Logging alone would give the acceptance suite what it needs but leaves
  no way for a human to eyeball that the actual SMTP send path itself
  works end-to-end.
- Sending-only (no logging) would require either inbox access for the
  automated suite (not viable) or a separate API-response-based token
  leak (a different, previously-considered design — rejected in favor of
  this simpler single mechanism).
- Both together, gated behind one flag, cover both needs with a single
  code path and a single point of audit.

### 5.5 Where this flag must never leak

- The acceptance suite's own environment/compose override sets
  `TEST_MODE=true` in its own configuration only.
- The default `docker-compose.yml` a self-hoster runs must not set this
  flag at all (absence = false).
- Code review checklist item for this module: grep the codebase for every
  call site that checks `TEST_MODE` — there should be exactly one, at the
  point of verification-email dispatch. If a second call site ever
  appears elsewhere, that's a sign this flag is scope-creeping into
  behavior it was never meant to control.

---

## 6. Explicit non-goals for this stage

- No OAuth/social login (not in the brief; not decided either way — revisit
  only if explicitly requested later).
- No password reset flow is specified here yet — same
  hashed-token-with-expiry pattern as verification should apply when it's
  designed, but it is out of scope until we discuss it.
- No rate limiting on login/signup attempts is specified here yet — this
  belongs with the broader anti-abuse work (already designed in depth for
  voting) and should be revisited as its own decision, not assumed.
- No MFA/2FA — not raised in the brief or in discussion; do not add
  speculatively.

---

## 7. Open questions (none currently blocking)

None outstanding for this stage as of this writing. If a new question
comes up during implementation that changes any decision above, stop and
update this document before proceeding — do not silently implement a
different behavior than what's written here.
