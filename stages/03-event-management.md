# Stage Spec: Event Management

Status: **Design locked, not yet implemented.**
Depends on Module 1 (Auth) and Module 2 (Roles & Membership) already
existing. If code and this doc disagree, update this doc first.

---

## 1. Scope of this stage

- Event creation, editing, and the status/phase split.
- The full timeline model and its validation rules.
- Tracks and prizes.
- Rich text (markdown) content for description/tracks, with sanitized
  preview and render.
- File uploads (poster, thumbnail) and their security hardening.
- Public read access to events.

Explicitly **not** in this stage: teams/submissions (Modules 4-5), judging,
voting.

---

## 2. Status vs. Phase — two independent concepts

This split exists because "where is this event in its published timeline"
(a computed fact) and "has an organizer chosen to make this visible /
close it out" (a deliberate decision) are genuinely different things and
were getting conflated in earlier drafts of this design.

### 2.1 `EventStatus` — manual, admin/organizer-controlled

```
DRAFT → PUBLISHED → ARCHIVED
                  ↘ DELETED
```

- **`DRAFT`** — default on creation. Not publicly visible. Fully editable,
  with no phase-awareness restrictions at all (nothing has been acted on
  by anyone yet).
- **`PUBLISHED`** — a deliberate organizer/admin action
  (`POST /events/:id/publish`), not automatic, not timestamp-triggered.
  From this point the event is publicly listed/visible, and phase (2.2)
  starts resolving to something meaningful. Editing becomes
  **phase-aware** (Section 3), not fully locked and not fully open.
- **`ARCHIVED`** — a later, deliberate action once an event has fully
  concluded (presumably alongside or after `eventClosedAt`'s phase would
  resolve to "done," but the transition itself is still a manual action,
  not automatic — an organizer decides when to actually archive it).
- **`DELETED`** — soft-delete, never a hard row delete, for the same
  reason nothing else in this platform gets silently destroyed (audit
  trail integrity).

There is no `ACTIVE` status — deliberately dropped after review; it added
a redundant state without a clear trigger condition and duplicated what
phase already expresses.

### 2.2 `EventPhase` — fully computed, never stored, never manually set

Resolved from `now()` against the timeline fields, on every read, exactly
as previously designed:

```
REGISTRATION_OPEN → REGISTRATION_CLOSED → IN_PROGRESS → SUBMISSIONS_OPEN
  → SUBMISSIONS_CLOSED → JUDGING → JUDGING_CLOSED → RESULTS_ANNOUNCED
  → VOTING_OPEN → VOTING_CLOSED → VOTING_WINNER_ANNOUNCED
```

**Amended by Module 8** (docs/stages/08-rubric-and-scoring.md Section
7): `JUDGING_CLOSED` is a later addition, not part of this stage's
original design. `JUDGING` now runs from `eventEndsAt` to the new
`Event.judgingClosesAt` field (scoring actively happening);
`JUDGING_CLOSED` runs from `judgingClosesAt` to `resultsAnnounceAt`
(scores frozen, normalization/organizer review happening, nothing
judge-facing writable). This stage's original design modeled the whole
judging period as an implicit, unstored gap between `eventEndsAt` and
`resultsAnnounceAt` — that's superseded now; the boundary is real,
stored, and organizer-set.

- Only meaningful once `status = PUBLISHED`. A `DRAFT` event's phase is
  `NOT_STARTED` / null — it hasn't begun its public timeline yet
  regardless of what timestamps are configured.
- Never a stored column that can drift from reality — always derived at
  read time from the current timeline fields and `now()`. No background
  job is required for correctness of the *value itself* (only for
  side-effects that need to fire at a transition, e.g. notification
  emails, which is separate).

---

## 3. Editing rules

### 3.1 While `status = DRAFT`

Full edit freedom on every field — name, slug, description, tracks,
prizes, poster/thumbnail, every timeline timestamp — with no
phase-awareness restriction, since nobody has registered, submitted, or
been invited against any of these values yet.

### 3.2 While `status = PUBLISHED`

Editing is **phase-aware**, not a blanket lock:

- **Slug: immutable.** Editable only in `DRAFT`. Once `PUBLISHED`, never
  changeable again, under any circumstance — shared links and external
  references depend on it staying stable.
- **A timeline timestamp whose phase has already fully passed becomes
  immutable.** E.g. once `REGISTRATION_CLOSED` phase has resolved (i.e.
  `now() > registrationClosesAt`), `registrationOpensAt` and
  `registrationClosesAt` can no longer be edited at all.
- **A future timestamp can be pushed later, never pulled earlier than
  what's already been acted on.** E.g. `submissionsCloseAt` can be
  extended (safe — helps stragglers, harms nobody who already submitted)
  but never moved earlier than `now()` or earlier than its current value
  if doing so would retroactively invalidate something already committed
  against it.
- Description, tracks (adding new ones), prizes, poster/thumbnail remain
  editable while `PUBLISHED`, since these don't carry the same
  "someone already made a timing decision based on this" risk that
  timestamps do. (Removing a track that already has submissions attached
  to it is a different, harder case — not resolved in this stage; flag if
  it comes up during Module 5.)

### 3.3 Validation, at both creation and every edit

Full chronological ordering enforced server-side on every write, not just
at creation:

```
registrationOpensAt < registrationClosesAt <= eventStartsAt
  < submissionsOpenAt < submissionsCloseAt <= eventEndsAt
  < judgingClosesAt <= resultsAnnounceAt < votingOpensAt
  < votingClosesAt < votingWinnerAnnounceAt
```

**Amended by Module 8** (docs/stages/08-rubric-and-scoring.md Section
7): `judgingClosesAt` sits between `eventEndsAt` and `resultsAnnounceAt`
— this stage's original chain went straight from `eventEndsAt` to
`resultsAnnounceAt` with no boundary of its own in between. The `<=`
(not strict `<`) between `judgingClosesAt` and `resultsAnnounceAt`
lets an organizer announce results the instant judging closes, if they
want zero gap for normalization/review.

A violation is rejected with a specific error naming which pair is out of
order — never a generic 400. `submissionsCloseAt` defaults to mirror
`eventEndsAt` unless the organizer explicitly unlinks them.

---

## 4. Judge invitation deadline — resolved

**Confirmed: judge invitation deadlines are always live-computed against
the event's current `eventStartsAt`, never a frozen snapshot.** If an
organizer changes `eventStartsAt` after invitations are already
outstanding, every pending invitation's effective deadline moves with it
automatically — there is no separate `respondByAt` value stored
independently of the live event field.

This directly supersedes the "snapshot vs. live" open question from
Module 2's spec doc — that question is now closed. Update Module 2's doc
to drop `respondByAt` as a stored snapshot field; the invitation deadline
is computed at read/check time as `event.eventStartsAt`, full stop.

(Practical implication: if `eventStartsAt` is edited, this doesn't
retroactively un-expire an already-`EXPIRED` invitation, since
`EXPIRED` is a state transition that already happened. It only affects
invitations still genuinely `PENDING` at the time of the edit.)

---

## 5. Tracks & Prizes

- **Track:** name, markdown description (see Section 6). Can be added
  after `PUBLISHED`, including after submissions have opened — existing
  submissions aren't retroactively assigned to a new track; a team would
  need to explicitly edit their submission to select it, which is already
  permitted up until `submissionsCloseAt`.
- **Prize:** name, rank, optional track association, `decidedBy: JUDGES |
  PUBLIC_VOTE`. Not resolving in this stage whether prize *editing* locks
  once `resultsAnnounceAt`'s phase has passed — flag for Module 8
  (Rubric & Scoring) or the results-publication design, since it's more
  naturally a question about protecting an already-announced result than
  about event editing generally.

---

## 6. Rich text: markdown, not WYSIWYG-HTML

- **Storage: markdown source, always.** Applies to `Event.description` and
  `Track.description`. Never store rendered HTML as the source of truth —
  markdown source is portable, diffable, and safely exportable as plain
  text for the bulk import/export module later.
- **Authoring:** a markdown editor with a **preview toggle** — organizer
  can view rendered output without saving, purely client-side during
  editing.
- **Sanitization happens on every render, both preview and production,
  through the identical code path.** A sanitizing markdown-to-HTML
  renderer strips raw `<script>` tags, `on*` event attributes, and any
  HTML embedded directly in the markdown source (an organizer pasting raw
  HTML into the markdown box must not be able to inject anything that
  executes in another visitor's browser). Preview and the real public
  page must never diverge — same render function, called from both
  places, not two separate implementations that could drift out of sync.

---

## 7. File uploads: poster & thumbnail

### 7.1 Limits

| Asset | Max size | Max dimensions |
|---|---|---|
| Thumbnail | 2MB | 800×800px |
| Poster | 5MB | 1920×1080px |

Enforced **server-side**, on the actual uploaded bytes — a frontend
`accept`/size hint is UX convenience only, never treated as a real
constraint, since it's trivially bypassed via direct API call.

### 7.2 Validation & hardening

- **Allowed formats: JPEG, PNG, WebP only. No SVG.** SVG is deliberately
  excluded here even though it's allowed elsewhere (certificate
  templates) — that module has its own dedicated sanitization pipeline
  because SVG-as-template is the actual feature there; here it would just
  be reopening an XSS surface for no benefit, since a plain photo/poster
  has no reason to be a vector format.
- **File type identified by magic bytes (actual file header), never by
  extension or client-supplied `Content-Type` header.** Extension and
  declared MIME type are both attacker-controlled and prove nothing.
- **Dimension check happens before full decode**, to reject a
  decompression-bomb (a small file engineered to decode into an enormous
  pixel buffer) before it can exhaust server memory.
- **Every upload is re-encoded server-side** — decoded through a real
  image library and re-encoded fresh to a clean JPEG/PNG/WebP, rather than
  storing the originally uploaded bytes as-is. This:
  - Strips EXIF metadata (privacy — removes embedded GPS/device info a
    participant may not realize is present).
  - Neutralizes any malformed-file/polyglot exploit attempt, since none
    of the original byte content survives into what's actually stored.
- **Storage:** local disk volume (no cloud bucket, consistent with the
  no-hosted-service-dependency rule), outside any directly web-served or
  executable path.
- **Filenames rewritten to a generated UUID** on storage — the original
  client-supplied filename is never used as the stored filename or
  reflected in the serving path (prevents path traversal and avoids
  leaking any information the original filename might have carried).
- **Served through a dedicated API route**, which sets the
  `Content-Type` header from the *actual re-encoded* file's real type —
  never inferred from a stored extension or trusted from upload time.
- **Rate limited** on the upload endpoint itself (same Redis-backed
  mechanism used elsewhere) — repeated upload attempts, valid or not, are
  a resource-exhaustion vector on their own regardless of file validity.

---

## 8. Public read access

- `GET /events` (list, filterable by phase) and `GET /events/:slug`
  (detail) — public, no auth required, for any `status: PUBLISHED` event
  regardless of which phase it's currently in. An organizer wanting an
  upcoming event visible for early hype, before registration even opens,
  is a legitimate and supported use case.
- `DRAFT` events are never visible via these routes, to anyone without an
  `EventMembership` (or `siteAdmin`) on that specific event.

---

## 9. What I'm testing for this module

- Full timestamp ordering validation, at both creation and edit, with
  specific error messages naming the violated pair.
- Slug edits accepted in `DRAFT`, rejected once `PUBLISHED`.
- A timestamp edit attempting to move a passed-phase boundary is rejected;
  extending a future deadline succeeds.
- Phase resolves correctly at every boundary via manipulated fixture
  timestamps (no real-time waiting in tests).
- A `DRAFT` event returns 404/403 on public read routes to a
  non-member; a `PUBLISHED` event is visible regardless of phase.
- Changing `eventStartsAt` on a published event immediately changes the
  effective deadline seen by a still-`PENDING` judge invitation, and does
  not affect already-`EXPIRED`/`ACCEPTED`/`DECLINED` invitations.
- Upload endpoint rejects: oversized files, disallowed formats (checked
  by magic bytes even when the extension lies), and oversized dimensions
  — each with a distinct, specific error.
- Two uploads of the same source image produce different stored
  filenames (UUID-based), and neither filename is derived from or
  reflects the original client-supplied name.
- Markdown containing a raw `<script>` tag or an `onclick` attribute
  renders with that content stripped, identically in preview and in the
  production-served page.

---

## 10. Cross-reference note (applied)

Module 2's spec doc (`02-roles-and-membership.md`) previously listed
`respondByAt` as a snapshot field and flagged the snapshot-vs-live
question as open. That question is closed by Section 4 above, and Module
2's doc has already been updated accordingly — its data model section no
longer stores `respondByAt`; the invitation deadline is always
`event.eventStartsAt`, computed live. Noted here only for traceability of
why that change happened.
