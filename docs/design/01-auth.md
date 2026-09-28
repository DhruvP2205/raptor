# Frontend Design: Module 1 — Auth & Email Setup

Status: **Design locked, not yet implemented.**
Covers: Sign up, Log in, Verify email (pending + landing), Set password
(forced, staff first login). Also establishes shared conventions
referenced by every later module's design doc rather than redefined
each time — marked clearly below.

Backend reference: `stages/01-auth-and-email-setup.md`. Nothing in
this doc introduces a capability the backend doesn't already have —
e.g. there is no "forgot password" flow here because Module 1's
backend explicitly doesn't have one yet (see Section 6).

---

## 0. Shared conventions established here (referenced by later docs)

**Logged-out shell.** Every screen in this doc uses the same minimal
layout: centered content, max-width ~400px, no main navigation bar —
just the Raptor mark, top-left, linking to the public events list.
This is deliberately different from the full app shell (header nav,
sidebar, etc.) used everywhere a session exists — someone isn't
"in the product" yet at sign up/login.

**Form validation pattern.**
- Inline, per-field errors, shown **on blur**, not on every keystroke
  (validating a field before someone's finished typing it is more
  annoying than helpful) — except password strength (Section 1), which
  updates live since it's informational, not a pass/fail check.
- On submit with existing errors: focus moves to the first invalid
  field, its error becomes visible if it wasn't already.
- Server-side validation errors (e.g. "email already in use") map onto
  the same inline-error slot as client-side ones — one visual pattern,
  regardless of where the error came from.

**Button loading state.** Primary action button: label stays the same,
a small spinner replaces the leading icon (or appears if there wasn't
one), button becomes disabled — prevents double-submission without
making the person re-read new button text mid-action.

**Password field.** Always has a show/hide toggle (eye icon) — typing
a password blind, twice, is real friction for no real security benefit
on a client-side field.

**Toast pattern** (for actions like "resend verification email"):
brief, bottom-of-screen, auto-dismisses, doesn't block interaction —
reserved for confirming an action succeeded, never used for errors
(errors get inline treatment, since they usually need the person to
actually do something, not just glance and move on).

---

## 1. Sign up

### Structure
Email, password, display name — three fields, in that order, matching
the backend's field order. Single primary button: "Create account."
Below the form: "Already have an account? Log in" linking to Section 2.

**Password strength indicator**: a thin bar below the password field,
live-updating as they type (this is the one exception to "validate on
blur" above — strength feedback is helpful *while* typing, a pass/fail
error is not). Three segments, filled progressively. No blocking
requirement shown as an error unless they try to submit something the
backend will actually reject (argon2 hashes anything — there's no
minimum-complexity rule in the backend spec, so this indicator is
purely informational, never a submit-blocker).

### States
| State | Behavior |
|---|---|
| Idle | Empty form, button enabled |
| Field-level validation error | Inline, per field (Section 0) — e.g. malformed email |
| Submitting | Button loading state (Section 0), fields disabled |
| Success | Redirect to Section 3.1 (verify-email pending screen) — never straight into the app, since the account isn't usable yet |
| Error — email already registered | Inline error under the email field: "An account with this email already exists." + inline link "Log in instead" |
| Error — email is banned (backend D48) | Inline error under the email field, deliberately generic: "This email can't be used to create an account. Contact an admin if you think this is a mistake." Doesn't confirm or deny a ban specifically — enough for a legitimate user to know something's actionable, not enough to let someone probe which emails are banned |
| Error — server/network failure | Same error-block pattern as the Events list doc (Section 2.5 there) — reused here, not redesigned: heading + specific cause + Retry, non-destructive to whatever was typed |

---

## 2. Log in

### Structure
Email, password, single primary button: "Log in." Below: "New here?
Create an account" linking to Section 1.

### States
| State | Behavior |
|---|---|
| Idle / Submitting | Same pattern as sign up |
| Error — invalid credentials | **Deliberately generic**: "Incorrect email or password." Never specifies which one was wrong — confirming "that email doesn't exist" is an account-enumeration leak, and this platform's backend doesn't distinguish the two either, so the frontend shouldn't invent a distinction the backend can't back up |
| Success, normal account | Redirect into the app (events list or wherever they were headed) |
| Success, `mustResetPassword: true` (staff account, first login) | Redirect straight to Section 4 — **not** the normal app, per backend D61 (every other route rejects until password is reset) |
| Error — server/network | Same reused error block as Section 1 |

### 2.1 What's *not* here
No "Forgot password" link. The backend has no password-reset flow yet
(explicitly out of scope in Module 1's stage doc). Showing a link that
leads nowhere real is worse than not showing one — omit it entirely
until the backend capability exists, then add both together.

---

## 3. Verify email

### 3.1 Pending screen (shown immediately after signup)
Not a form — a message: "Check your email" + "We sent a verification
link to **{email}**." + a **Resend email** button.

| State | Behavior |
|---|---|
| Idle | Resend button enabled |
| Resend clicked | Button loading state, then a toast: "Verification email sent." Button becomes disabled for a short cooldown (prevents spamming the send action) with a small countdown label, then re-enables |
| Resend failed | Toast pattern doesn't fit an error (Section 0 says toasts are success-only) — instead, an inline message appears below the button: "Couldn't resend — try again." |

### 3.2 Verification landing (the page the emailed link opens)
Reached with a token in the URL. No form — resolves automatically on
load.

| State | Behavior |
|---|---|
| Verifying | Brief loading state (spinner + "Verifying your email…") — this request is fast, so no skeleton needed, just a simple spinner is honest about what's happening |
| Success | "Email verified." + a button into the app. If they're not currently logged in (opened the link in a different browser/session than where they signed up), route to Section 2 (log in) instead, with a success message already shown above the login form: "Email verified — log in to continue." |
| Already verified (idempotent, backend-confirmed no-op) | **Same success treatment as a fresh verification** — "Email verified." Never shown as an error or as "already done" in a way that implies something went wrong; clicking an old link twice is a normal thing people do |
| Expired token | "This link has expired." + a **Resend verification email** button (requires being logged in to know which account to resend for — if not logged in, route to Section 2 first with a note explaining why) |
| Invalid/malformed token | Same treatment as expired — from the person's perspective, "this link doesn't work" and "this link is too old" don't need different messaging; both get "This link has expired or is invalid" + the same resend path |

---

## 4. Set password (forced, staff accounts only)

Reached only when `mustResetPassword: true`. This screen is
deliberately **inescapable** until completed — matches the backend
guarantee (D61) that no other route is reachable in this state.

### Structure
New password, confirm password, single button: "Set password and
continue." **No navigation present at all** — no logo-link back to the
events list, no nav bar, nothing else clickable except the form itself
and a plain "Log out" text link (leaving is always allowed; going
anywhere else in the product while unresetted is not).

A short line above the form explains why they're here: "An admin
created this account for you. Set a new password to continue." — this
matters because someone landing here with zero context (just followed
a link/credential someone handed them) shouldn't have to guess why
they can't do anything else yet.

### States
| State | Behavior |
|---|---|
| Idle | Both fields empty |
| Passwords don't match | Inline error under the confirm field, shown on blur of that field (not on the first field — don't error before they've had a chance to type the second one) |
| Submitting | Standard loading state |
| Success | Redirect into the normal app — this is the one time in the whole flow that a redirect *does* go straight into the product, since the account is now fully usable |
| Error — server/network | Standard reused error block |

---

## 5. Accessibility

- Every form field has a real, associated `<label>` — no
  placeholder-as-label pattern (placeholders disappear the moment
  someone starts typing, which is a known accessibility failure).
- Error messages are programmatically associated with their field
  (`aria-describedby`), not just visually positioned nearby — a screen
  reader user needs the same "this field has a problem" signal a
  sighted user gets from red text and proximity.
- Password show/hide toggle has an accessible label that changes with
  state ("Show password" / "Hide password"), not just an icon swap.
- Focus order follows visual/logical order on every screen in this
  doc — straightforward here since none of these forms have complex
  layout, but stated explicitly since it's a real requirement, not an
  assumption.

---

## 6. Explicit non-goals (matching backend scope exactly)

- No password reset/forgot-password flow (Section 2.1) — backend
  doesn't have it yet.
- No social/OAuth login — backend Module 1 is email/password only;
  Module 14's Discord OAuth exploration was fully walked back (D158)
  and never became a login method in the first place.
- No "remember me" / persistent-session toggle — not specified in the
  backend session model; sessions behave the same way regardless of
  any such checkbox, so adding one would be a UI control with no real
  effect, which is worse than not having it.
