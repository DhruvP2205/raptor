# Threat Model

Scope: voting abuse, submission abuse, and the other attack surfaces a
judging platform has. For each one: what the attacker wants, what
stops them, and what is left. **Section 5 lists what we did not stop.**
That list is deliberate, and it is the part of this document to read
first if you only read one.

Companion documents: `JUDGING.md` (how scoring works), `ARCHITECTURE.md`
(network and authorization model), `stages/` (per-module detail).

---

## 1. What we are protecting

| Asset | Why it matters |
|---|---|
| Judge scores and reviews | They decide outcomes and prize money. |
| Judge identity | Participants must never learn who judged them. |
| Published results | Once announced, they must not change silently. |
| Vote integrity | Audience-choice results must reflect real, distinct people. |
| Participant data (names, emails) | Personal data collected by an open platform. |
| Sessions and credentials | They carry every role's authority. |
| Certificate signing key | Forging a certificate means forging an achievement. |
| Audit log | It is the record that makes every other control accountable. |
| GitHub tokens | Used for verification; must never be readable back out. |

## 2. Who might attack

| Actor | Typical motive |
|---|---|
| Anonymous visitor | Scrape, stuff votes, probe the API |
| Participant | Improve their own result, sabotage a rival, get a peer's scores |
| Judge | Favor a friend, learn a peer's scores, avoid the work |
| Organizer | Change an outcome, or make an honest mistake that looks like fraud |
| Site admin | Highest authority; trusted, but never invisible |
| Host-level attacker | Read logs, files, or containers on the machine itself |

## 3. The five named abuse classes

### 3.1 Sybil votes (one person, many accounts)

**Goal:** turn one person into many voters.

**What stops it.** Voting always requires an authenticated account.
Eligibility is an organizer-chosen mode: participants of that event
only, or any verified platform user. Every voter must also have an
account that existed **before the event started**, so accounts created
mid-event to vote are useless. One vote per person per round. Each vote
carries an invisible proof-of-work cost, with a visible image challenge
as a fallback when abuse signals rise; both are self-hosted, with no
third-party service. Accounts sharing network origin are **flagged for
admin review**. Admins can ban by email, which also blocks
re-registration with it. Tallies stay hidden while a round is open, so
an attacker gets no live feedback to steer by.

**What it does not stop.** See 5.1 and 5.2. In short: many *real,
aged, verified* accounts operated by one person.

### 3.2 Ballot stuffing (many votes for one candidate)

**Goal:** inflate one project's tally.

**What stops it.** Single-choice ballots (one pick per person per
round) remove the "spread many votes" tactic entirely. Quadratic
voting was considered and rejected: it changes how votes are priced but
does nothing about one person owning many accounts. If fraud is found
after the fact, an organizer can **restart the round** with a mandatory
written reason. The old round is deactivated (never deleted), zero
votes carry over, and the action is audit-logged. Minor cosmetic
corrections are separate and cannot touch cast votes.

**What it does not stop.** Coordinated real voters, and an organizer
who is themselves the beneficiary (see 5.6).

### 3.3 Submission scraping

**Goal:** bulk-harvest submissions, or reach non-public data.

**What stops it.** Drafts are never public, and organizers cannot read
draft content either. Judge identity and scores never appear in any
public or participant-facing response. Public pages expose only the
public submission fields. Markdown is rendered through one sanitizer
shared by preview and production.

**What it does not stop.** The gallery is **public on purpose**;
harvesting public content cannot be prevented, only slowed. See 5.4.

### 3.4 Judge collusion

**Goal:** see a peer's scores, or coordinate scores.

**What stops it.** Role isolation is enforced in the backend, on every
request, against real database relationships, not against what the UI
shows. A judge requesting another judge's scores receives **403**;
this is checked by the acceptance suite and verified live. A judge sees
only their own assignments. Assignment order uses randomized offsets,
so it cannot be predicted. Every review edit is kept as an immutable
snapshot, so a quiet post-hoc change is visible. A judge who scores
everything identically is flagged to organizers by normalization
rather than silently absorbed. Completed reviews stay attached to their
author permanently; only unfinished work can be transferred, and a
transfer requires a written reason that becomes a permanent note on
that judge.

**What it does not stop.** Judges talking to each other outside the
platform, and conflicts of interest between a judge and a team. See
5.3.

### 3.5 Deadline gaming

**Goal:** submit or edit after the deadline, or work outside the window.

**What stops it.** Every deadline is checked against **server time, at
the moment of the write**, on every mutating request. No client
timestamp, countdown, or disabled button is trusted. Timeline fields
have a strict enforced order. Once a team has ever submitted, its
roster is locked permanently, so members cannot be swapped in and out
around the deadline. Submission verification checks repository commit
history against the event window and routes anything outside it to
human review rather than passing it.

**What it does not stop.** Commit timestamps are influenced by whoever
made the commit; see 5.5. A host with a wrong clock changes every
deadline at once; see Section 6. **Confirmed by reading the fetch code
(`apps/worker/src/verification/github-client.ts`):** the worker reads
the commit **author date**, not the committer date and not GitHub's
own push-received timestamp — the most spoofable of the three
(`git commit --date` sets it to anything, with no server-side record
to cross-check it against).

## 4. Other attack surfaces

| Attack | Control | Residual |
|---|---|---|
| Reading another judge's data by guessing ids (IDOR) | The per-judge scores route allows only that judge, an accepted organizer of that event, or a site admin (the last audited) | None known |
| Privilege escalation between roles | Account type (participant or staff) is permanent at creation; judge and organizer are mutually exclusive platform-wide; per-route guards check membership for that event only, never a global flag | Admin is trusted by definition |
| Session theft | Opaque server-side tokens in an HttpOnly cookie, stored hashed, instantly revocable. **Confirmed (`apps/api/src/auth/session.service.ts`): `httpOnly: true`, `secure` true in production, `sameSite: 'lax'`** — the SameSite setting is real, working CSRF protection, not just an assumption | Needs TLS in production; operator's responsibility (Section 6) |
| Stored XSS via markdown | One shared sanitizer for every place markdown renders | Depends on that one path staying the only one |
| Malicious uploads | Content validated by magic bytes, never by extension or declared type; images re-encoded (strips metadata and polyglots); random filenames; files served only through one route that re-checks type; no SVG for posters | Low |
| Malicious SVG certificate templates | Parsed and sanitized as XML on upload; rendered output is generated, never stored | Low |
| Server-side request forgery via repository URLs | Only GitHub repositories are fetched; any other URL is classified as non-GitHub without making a request | Low |
| Certificate forgery or spoofing | No free-text recipient names anywhere; recipient is resolved from the caller's own participation record; payload is Ed25519-signed and verified on view | Key compromise (host-level) |
| Silent result changes after publication | Published results are versioned; every correction needs a reason, is audit-logged, and is visibly marked | Admin tampering with the log; see 5.6 |
| Secrets exposure | Docker secrets, never plain environment values; GitHub tokens encrypted at rest with a separate key | Host-level access |
| Database or Redis exposed | Neither publishes any host port; frontend container has no network path to either | None known |

## 5. What we did not stop

Ordered roughly by how much they matter. Each has a path to fixing it.

1. **One person with many real accounts.** The pre-event account-age
   rule blocks throwaway accounts made during the event. It does not
   block someone who registered many accounts earlier. Email
   verification is a low bar. *Fix path:* stronger per-account
   signals; a per-event allow-list for high-stakes votes.
2. **Shared-network and VPN voters.** Same-origin clusters are flagged
   for a human, never auto-blocked, because blocking would also hit
   real people behind one office or campus network. So a determined
   attacker rotating networks is not stopped, only inconvenienced.
3. **Off-platform judge collusion and conflicts of interest.** We
   cannot see a chat between two judges. We also do not detect a judge
   who has a personal tie to a team; a person holding two accounts
   under different emails would not be linked. *Fix path:* an
   organizer-declared conflict list per judge.
4. **Bulk collection of public content.** The gallery is public by
   design. **Fixed (Module 24, A4):** a generous, per-IP rate limit
   (120/minute, `GalleryRateLimitGuard`) now covers the gallery list and
   submission-detail routes, configurable via `GALLERY_RATE_LIMIT_PER_MINUTE`
   — alongside the existing limits on uploads, team-join, comments, and
   voting. **Residual, honestly:** this slows a single-source scrape, it
   does not stop a motivated attacker rotating IPs; the gallery is
   public by design, so bulk harvesting of *public* content can only
   ever be slowed, not fully prevented.
5. **Repository history is evidence, not proof.** A determined person
   can make commits that look like they were made inside the window.
   Verification exists to triage; ambiguous results go to a human, and
   a human can still be fooled. **Confirmed: the worker reads commit
   *author* date specifically** (`github-client.ts`) — the field
   `git commit --date` sets directly, the easiest of the three
   candidate timestamps to falsify. *Fix path:* tie checks to when
   GitHub received the push, not only to commit metadata.
6. **A malicious admin or organizer with database access.** Post-
   publication corrections are versioned, reasoned, and logged, and
   admin overrides are audited, but the audit log lives in the same
   database an admin controls. It is not tamper-evident. *Fix path:*
   hash-chained entries, or a write-once external sink.
7. **Seeded checker credentials exist on every boot.** The acceptance
   checker needs ready-made sessions, so boot creates four real ones
   (including an organizer for the fixture event), prints them, and
   stores them in a gitignored file. Anyone who can read that file or
   the container logs holds those sessions. The blast radius is one
   sample event. **Fixed (Module 24, A5):** `FIXTURES_IMPORT=false`
   skips fixture import and seeded sessions entirely — no fixture
   event, no credentials, no headers file. **Residual, by deliberate
   design:** defaults to `true`, since the acceptance checker needs
   this data present with zero manual steps; a real deployment must
   explicitly opt out, which is a real step an operator has to
   remember to take, not something the platform forces.
8. **Login guessing.** Passwords are argon2-hashed, which makes each
   guess expensive. **Fixed (Module 24, A4):** login now has a rate
   limit — 10 attempts per 15 minutes per (source IP, email) pair,
   configurable via `LOGIN_RATE_LIMIT_ATTEMPTS`/
   `LOGIN_RATE_LIMIT_WINDOW_MINUTES`, with a fully generic 429 that
   never confirms whether the email is registered. **Residual,
   honestly:** the limit resets after its window rather than
   permanently locking the account, and there is still no
   password-reset flow.
9. **Denial of service.** Rate limiting now covers uploads, voting,
   team-join, comments, login, and the public gallery/submission-detail
   routes (Module 24, A4) — but every other route is still unlimited. A
   flood against any of those is a resource problem we have not
   addressed at the application layer; a reverse proxy is the expected
   answer.

## 6. Assumptions we rely on

- The host clock is correct. Every deadline depends on it.
- The operator terminates TLS in front of the platform (we do not
  provision certificates), and sets cookie behavior accordingly.
- Docker networks and secret mounts are intact, and the host is not
  compromised.
- Site admins are trusted. They are audited, not prevented.

All five items formerly tracked here (repository verification
timestamp source, read-route rate limiting, login rate limiting,
fixture-import kill switch, cookie attributes) have been checked
directly against the running code and folded into Sections 3.5, 4, and
5 above, each marked **Confirmed**. Section removed per its own
instruction.
