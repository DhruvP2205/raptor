# Stage Spec: Submission Verification

Status: **Design locked, not yet implemented.**
Depends on Module 3 (Event Management, for the timeline fields), Module 5
(Submission Management, for `Submission` and `everSubmitted`). This
module sits between Submission Management and Judge Assignment in the
pipeline — only `APPROVED` submissions (Section 4) proceed to judge
assignment. If code and this doc disagree, update this doc first.

---

## 1. Scope of this stage

- GitHub commit-history verification for submitted repos: fetching,
  classifying, and surfacing evidence for organizer review.
- GitHub token management: encrypted storage, multi-token rotation,
  rate-limit awareness, validity tracking.
- The shared async worker container (verification + certificate
  rendering), introduced here because this module is the first place in
  the platform where synchronous, in-request external API calls would
  create a real contention problem.
- Manual trigger, filtering, and re-run mechanics for organizers/admins.

Explicitly **not** in this stage: judge assignment itself (Module 7,
gated on this module's output), any verification method beyond GitHub
commit timestamps (no static analysis, no plagiarism detection — out of
scope entirely).

---

## 2. Trigger: always manual, never automatic

**There is no automatic trigger at any timeline event** (not
`eventEndsAt`, not `submissionsCloseAt`, nothing). Verification only ever
runs because an organizer or admin explicitly initiates it, via one of
three scopes:

1. **Full run** — every `everSubmitted: true` submission for the event
   that hasn't been checked yet (or: every one, if "re-run all" is
   explicitly chosen — see Section 7).
2. **Filtered run** — every submission currently matching a selected
   `checkStatus`/decision filter (e.g. "re-run everything currently
   `SUSPICIOUS`").
3. **Targeted run** — one or more explicitly selected submissions.

All three scopes queue jobs onto the same underlying worker queue; the
only difference is which submissions get enqueued.

---

## 3. The check itself

For each submission being checked:

1. Parse `Submission.repoUrl`.
2. **Classify the URL first, before attempting any API call:**
   - Recognizably a GitHub repo URL → proceed to step 3.
   - Not a GitHub URL (GitLab, Bitbucket, self-hosted, anything else) →
     `checkStatus: NON_GITHUB`, stop here, routed to manual review. No
     automated check is attempted for non-GitHub URLs.
3. Call the GitHub API for the repo's commit history (paginated, using
   token rotation — Section 5).
   - **If the repo is private/inaccessible** (403/404 from the API with
     no valid access) → `checkStatus: PRIVATE`, stop here, routed to
     manual review. This is never auto-rejected — accessibility is not
     evidence of guilt, just evidence the automated check couldn't run.
   - **If the API call fails transiently** (network error, rate limit
     exhausted across all tokens, GitHub outage) → `checkStatus: ERROR`,
     logged, routed to manual review, re-runnable via Section 7 once the
     transient condition clears.
4. On a successful fetch, compute:
   - `firstCommitAt`, `lastCommitAt` (across all commits)
   - `totalCommits`
   - `commitsInWindow` — commits with a timestamp between
     `event.eventStartsAt` and `event.submissionsCloseAt` (inclusive),
     **the confirmed window boundary** — not `eventEndsAt`.
   - `outsideWindowCommits` — full detail (sha, timestamp, message,
     author) for every commit outside that window, retained for the
     manual-review UI, not discarded.
5. **Classify:**
   - All commits within the window → `checkStatus: VERIFIED`,
     `finalDecision: APPROVED` — fully automatic, no human step needed.
   - Some in, some out → `checkStatus: SUSPICIOUS`,
     `finalDecision: PENDING_REVIEW`.
   - All commits outside the window (or zero commits) →
     `checkStatus: REJECTED`, `finalDecision: PENDING_REVIEW` — **not**
     `DISQUALIFIED` automatically. GitHub commit timestamps aren't
     perfect evidence on their own (a squashed merge, an imported repo
     with rewritten history, a timezone artifact could all produce a
     false "all outside" read) — so even the strongest automatic signal
     still lands in front of a human before a team is actually excluded
     from judging. There is no status a human cannot see and reverse.

---

## 4. Final decision — separate from the automated `checkStatus`

Two distinct fields, deliberately:

- **`checkStatus`** — what the automated check (or lack of one) found:
  `NOT_RUN | VERIFIED | SUSPICIOUS | REJECTED | PRIVATE | NON_GITHUB |
  ERROR`.
- **`finalDecision`** — what actually gates judge assignment:
  `PENDING_REVIEW | APPROVED | DISQUALIFIED`.

Only `finalDecision: APPROVED` submissions proceed to Module 7 (Judge
Assignment). `VERIFIED` is the only `checkStatus` that auto-resolves to
`APPROVED`; every other status requires an explicit organizer/admin
action to resolve `PENDING_REVIEW` into either `APPROVED` or
`DISQUALIFIED`.

**Every `DISQUALIFIED` decision requires a mandatory written reason**
(`finalDecisionRemarks`, non-empty) — same pattern used everywhere else
in this platform for consequential, justification-bearing actions (bans,
voting-round restarts). An `APPROVED` override (e.g. approving something
that was flagged `SUSPICIOUS` after review) may also carry an optional
remark, but it isn't mandatory the way a disqualification's is.

**Private-repo-at-review-time:** if an organizer reviews a `PRIVATE`
entry and the repo is still private, that is itself valid grounds for
`DISQUALIFIED` — the organizer states this in the mandatory remarks, the
system doesn't auto-decide it.

---

## 5. GitHub token management

**This is the one deliberate exception to the platform's "never store a
reversible secret" pattern used everywhere else** (sessions, email
verification, invitations are all hashed, write-once, compare-only). A
GitHub PAT must be read back in plaintext to call the API — hashing
would make it useless. This needs real, documented treatment:

- **Encryption:** AES-256-GCM at rest. The encryption key itself is
  supplied via Docker secrets (same mechanism as SMTP credentials),
  never hardcoded, never itself stored in the database.
- **`GithubToken` model:** `id`, `tokenEncrypted`, `label` (admin-facing
  name, e.g. "Token A — org bot account"), `isValid`, `rateLimitRemaining`,
  `rateLimitResetAt`, `lastUsedAt`, `revokedAt`.
- **Admin manages tokens** — add, label, revoke. Never surfaced to
  organizers; this is a platform-operator concern.
- **Multi-token rotation:** before each API call, the worker picks
  whichever valid, non-revoked token currently has the most remaining
  rate-limit headroom (read from GitHub's response headers after every
  call and persisted onto that token's row). Exhausted tokens are
  skipped until their `rateLimitResetAt` passes.
- **Validity tracking:** a token that starts failing auth (expired,
  revoked on GitHub's side) is marked `isValid: false` immediately, is
  excluded from rotation from that point on, and **surfaces as a visible
  admin-dashboard alert** — never a silent failure that just makes jobs
  quietly stop succeeding.

---

## 6. Async worker architecture

**One shared background-worker container**, running BullMQ against the
already-existing Redis instance, handling two independent queues:
verification jobs (this module) and certificate rendering jobs
(previously designed, not yet its own stage doc). Sharing one container
is reasonable since the two features rarely need to run concurrently for
the same event in practice — but they remain **separate queues**, so a
large verification batch can never block a certificate request, and
certificate rendering can never delay a verification run. Neither queue
ever executes in the main API process, which is what actually prevents
either from degrading responsiveness for other users hitting the API
concurrently (the same reasoning that ruled out synchronous, in-request
external calls in the first place).

This supersedes the earlier "bulk certificates dropped, no async
infra needed yet" decision — that infra is now being built anyway
because verification genuinely requires it, so certificate rendering can
reasonably move onto the same worker at low incremental cost whenever
that module is properly specified.

---

## 7. Organizer/admin-facing controls

**Filtering:** the verification list/dashboard is filterable by
`checkStatus` and by `finalDecision` — an organizer can pull up "show me
everything currently `SUSPICIOUS`" or "everything still
`PENDING_REVIEW`" directly.

**Manual review action**, per submission: view full evidence
(`firstCommitAt`, `lastCommitAt`, `totalCommits`, `commitsInWindow`,
full `outsideWindowCommits` detail), then set `finalDecision` to
`APPROVED` or `DISQUALIFIED` with remarks (mandatory for
`DISQUALIFIED`, optional for `APPROVED`).

**Re-running**, three scopes matching Section 2's trigger scopes:
1. Re-run everything for the event.
2. Re-run everything matching a current filter (e.g. re-check every
   `ERROR` entry after a token issue is fixed).
3. Re-run one or more explicitly selected submissions.

Re-running overwrites `checkStatus` and the computed commit fields with
fresh results, but **does not silently overwrite an existing manual
`finalDecision`** — if an organizer already resolved a submission to
`APPROVED`/`DISQUALIFIED`, a re-run refreshes the underlying evidence but
should surface the fact that a manual decision already exists rather
than quietly reverting it to `PENDING_REVIEW`. (Exact UX for this —
require explicit re-confirmation, or just show a warning banner — is an
implementation detail to settle when building the review screen, not a
blocking design question.)

**Submission-page notice:** the repo-link field on the submission form
(Module 5) displays an advisory note — e.g. "Repository must be public
for judging; private repos require manual verification and may be
disqualified." This is advisory only, checked at verification time, not
enforced at submission time (Module 5 is not being reopened to add a
public/private check at submit).

---

## 8. Data model

### `SubmissionVerification`

| Field | Type | Notes |
|---|---|---|
| `id`, `submissionId` | fk, unique | One verification record per submission, overwritten/updated on re-run |
| `checkStatus` | enum | `NOT_RUN \| VERIFIED \| SUSPICIOUS \| REJECTED \| PRIVATE \| NON_GITHUB \| ERROR` |
| `finalDecision` | enum | `PENDING_REVIEW \| APPROVED \| DISQUALIFIED` |
| `firstCommitAt`, `lastCommitAt` | datetime, nullable | UTC |
| `totalCommits`, `commitsInWindow` | int | |
| `outsideWindowCommits` | json | Full sha/timestamp/message/author detail, retained for review |
| `finalDecisionRemarks` | text, nullable | Mandatory (enforced at the application layer) when `finalDecision = DISQUALIFIED` |
| `reviewedByUserId` | fk, nullable | |
| `checkedAt`, `reviewedAt` | datetime, nullable | |

### `GithubToken`

See Section 5.

---

## 9. What I'm testing for this module

- A repo with all commits inside `[eventStartsAt, submissionsCloseAt]`
  auto-resolves to `VERIFIED`/`APPROVED` with no human action.
- A repo with any commit outside that window resolves to `SUSPICIOUS`,
  never auto-approved.
- A repo with every commit outside the window resolves to `REJECTED`
  with `finalDecision: PENDING_REVIEW`, not `DISQUALIFIED` — confirming
  a human step is still required even for the strongest automatic
  signal.
- A private repo resolves to `PRIVATE`/`PENDING_REVIEW`, never an
  automatic disqualification.
- A non-GitHub URL resolves to `NON_GITHUB` with **zero** API calls
  attempted.
- Attempting to set `finalDecision: DISQUALIFIED` without remarks is
  rejected at the API level.
- Only `finalDecision: APPROVED` submissions are visible to/selectable
  by Module 7's judge-assignment logic — a `PENDING_REVIEW` or
  `DISQUALIFIED` submission is excluded regardless of how strong its
  underlying commit evidence looks.
- Token rotation correctly skips a rate-limited or invalid token and
  uses the next available one; a fully exhausted token pool surfaces a
  clear error/alert rather than the job silently failing.
- A verification job's failure (transient `ERROR`) does not block or
  delay other queued verification jobs, and does not affect the
  certificate-rendering queue running on the same worker container.
- Filtering by `checkStatus`/`finalDecision` returns the correct subset;
  re-running a filtered subset only affects submissions matching that
  filter at the time the re-run was triggered.
- Timestamp comparison correctness: a commit timestamp from GitHub
  (potentially returned with a non-UTC offset) is normalized to UTC
  before being compared against the UTC-stored event window boundaries —
  tested with a commit timestamp expressed in a non-UTC offset to
  confirm the normalization actually happens rather than being silently
  skipped.

---

## 10. Open questions

None blocking. One implementation-level detail deferred to the actual
build (Section 7): the precise UX for re-running verification on a
submission that already has a manual `finalDecision` — whether that
requires explicit confirmation or just a warning banner before
proceeding. Either is acceptable; pick one during implementation and
note the choice here afterward.

**Resolved during implementation:** the backend never silently
overwrites a manual decision on re-run — `reviewedByUserId` on
`SubmissionVerification` is the signal that a human already resolved
this one (auto-`VERIFIED` → `APPROVED` never sets it, only the
`POST .../review` endpoint does). A re-run always refreshes
`checkStatus` and the evidence fields; it only also refreshes
`finalDecision`/`finalDecisionRemarks`/`reviewedByUserId`/`reviewedAt`
when `reviewedByUserId` is still null. No frontend exists yet for this
module, so the confirmation-vs-warning-banner UX question itself is
still open — only the backend half (never clobber, always refresh
evidence) is settled.
