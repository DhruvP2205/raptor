# Stage Spec: Certificates

Status: **Design locked, not yet implemented.**
Depends on Module 1 (Auth, `User.displayName`), Module 4 (Team), Module
5 (Submission), Module 10 (Results & Rankings — the gate this module's
issuance trigger depends on). Consolidates design decisions D34-D40
made much earlier in this project, plus new decisions resolving a real
vulnerability found in a competing platform (Section 2). If code and
this doc disagree, update this doc first.

---

## 1. Scope of this stage

- The issuance trigger: what actually causes a `Certificate` row to
  exist, and why it must never be a free-text, self-asserted claim.
- Certificate content: what's on it, and what's deliberately *not*
  on it (no per-team-member role distinction).
- Template system: sanitized SVG upload, per-event, versioned.
- Rendering: SVG (on-platform view) and PDF (download), both derived
  from `payloadJson` at request time, never stored pre-rendered.
- Caching, keyed to template version.
- Access control: public view/verify vs. owner-or-organizer-only
  download.
- The public certificate gallery on a user's profile.

---

## 2. The issuance trigger — anchored on a real vulnerability

**A competing platform (zerodepshack.com) was found to let anyone
search for any project/team by name, then type an arbitrary name into a
free-text field to generate a signed-looking certificate for that
project — with zero check that the person typing the name had any
connection to the work.** This is a Broken Object-Level Authorization
vulnerability with no identity binding at all, and it directly
undermines the value of every legitimate certificate on that platform,
since "verify" proves nothing if the record was never tied to a real
person in the first place.

**This platform's issuance model is structurally incompatible with that
flaw, not just policy-incompatible:**

- **There is no certificate request flow where a user searches for a
  project and types a name.** A certificate's recipient is never a
  free-text field, ever, under any circumstance.
- **Name is pulled directly from the authenticated account's
  `User.displayName`** at issuance time — never entered, never
  editable in the certificate-generation flow itself.
- **A certificate can only ever be generated for the authenticated
  caller's own participation record** — resolved from their own
  `TeamMembership`/`EventMembership`/`JudgeAssignment` rows, never from
  a search result pointing at someone else's project.

### 2.1 The trigger, precisely

- **Single, unified event-level switch:** `certificatesEnabled`,
  flipped by organizer/admin (`POST /events/:id/enable-certificates`).
- **Validation: can only be enabled once a `PublishedResultVersion`
  exists at `status: LIVE` for this event** (Module 10) — i.e., only
  after judge-decided winners are actually announced. Attempting to
  enable certificates before that is rejected outright.
- **One switch controls issuance for everyone** — participants and
  judges alike — even though a judge's actual work finished earlier at
  `judgingClosesAt`. Decided directly by Claude for simplicity: a
  single event-wide trigger is easier for an organizer to reason about
  than two separately-timed ones, and there's no strong reason a judge
  needs their certificate meaningfully earlier than participants do.
- Once enabled, the certificate section becomes visible in the event UI
  and every eligible person can generate their certificate with one
  button click — the `Certificate` row (payload + signature) is created
  at that point, on demand, per person, not pre-batch-generated for
  everyone at the moment the switch flips.

### 2.2 Eligibility, and the disqualification exclusion

- **Participants:** anyone with a `TeamMembership` (or solo
  `Submission.soloUserId`) on a submission that is **not**
  `finalDecision: DISQUALIFIED` (Module 6).
- **Judges:** anyone with at least one `JudgeAssignment.status:
  COMPLETED` on this event.
- **Disqualified submissions' participants do not get an automatically
  issued certificate.** Decided directly by Claude, not asked back:
  since the whole issuance gate is tied to judge results being
  finalized, and disqualified submissions never enter those results at
  all, extending that same exclusion to certificates is the consistent
  default. **Organizer/admin can still manually issue one as an
  explicit override** if they judge it appropriate for a specific case
  — this is not a hard block, just not automatic.

---

## 3. Certificate content

- Recipient name (from `User.displayName`, Section 2), event name,
  role (`PARTICIPANT | JUDGE | WINNER | SPECIAL_AWARD_WINNER`), issue
  date, associated project name, and associated team name if the
  participant was on a team (omitted entirely for solo participants,
  consistent with Module 5's solo/team model).
- **No per-team-member role distinction on the certificate itself** —
  confirmed directly: a team admin and a regular member receive
  identically-formatted certificates. Team-management authority (Module
  4) is an operational concept, not something the certificate content
  reflects.
- **A person may hold more than one certificate for the same event** —
  a `PARTICIPANT` certificate is always available once eligible, and a
  **separate** `WINNER` or `SPECIAL_AWARD_WINNER` certificate is
  additionally issued if they actually won a rank-based prize (Module
  10) or a special award (Module 8/10) — rather than one certificate
  whose content dynamically changes. This keeps `Certificate.role` a
  fixed, simple field per row instead of needing to represent multiple
  simultaneous accolades in one record.

---

## 4. Template system (D35, D36 — restated as locked requirements)

- **SVG only**, never HTML/CSS or HTML-in-`<foreignObject>` — the only
  format that renders identically and reliably through both the
  on-platform view and the lightweight, non-browser SVG→PDF conversion
  path (D35). Organizers author/upload a template per event with
  plain-text placeholder tokens (`{{recipientName}}`, `{{eventName}}`,
  `{{role}}`, `{{projectName}}`, `{{teamName}}`, `{{issuedDate}}`,
  `{{certificateId}}`, `{{verifyUrl}}`).
- **Sanitized on upload** — strip `<script>`, `on*` event attributes,
  `foreignObject`, and external resource references, via a real XML/SVG
  DOM parser, never string/regex replacement (D36). This is a real XSS
  surface (an organizer-uploaded template renders in every viewer's
  browser), not a hypothetical one.
- **Versioned** — a template edit bumps `CertificateTemplate.version`;
  an already-issued `Certificate` stores the `templateVersion` it was
  issued under and continues rendering against that version forever,
  never retroactively changing appearance because the template was
  edited later.

---

## 5. Rendering and caching (D34, D37)

- **Never store a rendered image.** Only `payloadJson` (the facts) and
  an Ed25519 `signature` computed over it are persisted. SVG and PDF are
  always generated on demand from that record (D34).
- **SVG** is the canonical on-platform view. **PDF** is derived from the
  same SVG via a pure-JS conversion (no headless browser dependency,
  consistent with `ARCHITECTURE.md`'s laptop-friendly requirement).
- **Cached** in Redis, keyed `certificate:{id}:{templateVersion}:
  {format}` (D37) — a template version bump naturally invalidates stale
  cache entries by changing the key, with no explicit invalidation step
  needed.

---

## 6. Access control (D38, D39)

- **`Certificate.id` is a UUID** — unguessable, non-sequential by
  construction, safe to put in a shareable public link without enabling
  enumeration of other certificates (D38).
- **`GET /certificates/{id}` — public, no auth.** Shows the SVG render,
  recipient name (no privacy toggle, per earlier decision), and a
  verification indicator (signature checked against `payloadJson`
  server-side).
- **`GET /certificates/{id}/download` (PDF) — restricted** to the
  certificate's own owner, or an organizer/admin scoped to that specific
  event (D39) — never a global organizer permission across events.

---

## 7. Public certificate gallery (new — confirmed public)

- **Every user profile has a public certificate gallery** —
  `GET /users/:id/certificates` — visible to anyone, no auth required,
  listing that user's certificates across every event (event name,
  project name, role/achievement, issue date, link to the full public
  certificate view).
- **This is a deliberate, confirmed product decision, not a default —
  worth restating plainly since it has a real privacy dimension:** a
  user's full hackathon participation history (which events, which
  projects, whether they won anything) becomes discoverable to anyone
  who knows or finds their profile URL. This was explicitly chosen over
  a private-by-default alternative — noted here so it's clearly a
  decision made with that tradeoff visible, not an oversight.
- **No per-certificate opt-out/hide toggle is included in this design**
  — since the gallery itself is confirmed public, an individual
  certificate hide option wasn't requested and isn't built. This could
  be revisited later if a real need surfaces (e.g. a participant who
  wants their participation visible but a specific low-scoring result
  hidden), but is out of scope for now.

---

## 8. Data model

### `Event` extension

| Field | Type | Notes |
|---|---|---|
| `certificatesEnabled` | boolean | Default `false` |
| `certificatesEnabledAt`, `certificatesEnabledByUserId` | | Set when the trigger fires; validated against `PublishedResultVersion: LIVE` existing first |

### `Certificate`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Unguessable (D38) |
| `eventId`, `userId` | fk | Recipient always resolved from an authenticated account, never a free-text input (Section 2) |
| `role` | enum: `PARTICIPANT \| JUDGE \| WINNER \| SPECIAL_AWARD_WINNER` | A person can hold multiple certificate rows for the same event if eligible for more than one role |
| `teamId`, `submissionId` | fk, nullable | `teamId` null for solo participants |
| `payloadJson` | json | The facts the signature covers — name, event, role, project, team, date (D34) |
| `signature`, `publicKeyId` | string | Ed25519 |
| `templateId`, `templateVersion` | fk, int | Snapshotted at issue time — never retroactively changed by a later template edit |
| `issuedAt` | datetime | |

### `CertificateTemplate`

| Field | Type | Notes |
|---|---|---|
| `id`, `eventId` | | |
| `svgMarkup` | text | Sanitized on upload (D36) |
| `version` | int | Bumped on every edit |

---

## 9. What I'm testing for this module

- **There is no code path, anywhere, that accepts a free-text name and
  associates it with an arbitrary project/team to produce a
  certificate.** This is the direct, explicit regression test against
  the zerodepshack.com vulnerability — attempted via direct API call,
  not just absent from the UI.
- Enabling certificates before a `PublishedResultVersion` exists at
  `status: LIVE` is rejected.
- A disqualified submission's team members do not receive an
  automatically issued `PARTICIPANT` certificate; an organizer's manual
  override issuance for such a case succeeds and is auditable.
- A participant with a winning result gets **two** certificate rows
  (`PARTICIPANT` and `WINNER`), not one row whose content changes.
- A solo participant's certificate omits team name entirely; a team
  member's certificate includes both project and team name.
- Uploading a template containing `<script>` or an `onload` attribute
  results in that content being stripped before storage — verified by
  inspecting the stored `svgMarkup`, not just the rendered output.
- Editing a template bumps `version`; a previously-issued certificate's
  render is unaffected and continues using its original
  `templateVersion`.
- `GET /certificates/{id}` succeeds with no auth; `GET
  /certificates/{id}/download` succeeds for the owner or an
  organizer/admin scoped to that event, and fails for every other
  caller including an organizer of a *different* event.
- The public gallery endpoint returns results with no authentication
  required, for any user ID.
- Cache correctness: requesting the same certificate/format twice
  before a template edit returns identical bytes fast (cache hit);
  requesting after a template version bump produces a freshly rendered
  result reflecting the new template.

---

## 10. Open questions

None blocking. Two implementation-detail calls made directly rather
than asked back, both noted inline above:

1. **Disqualified submissions excluded from automatic issuance**
   (Section 2.2), organizer-overridable manually.
2. **Judges gated by the same unified event-wide switch** as
   participants (Section 2.1), rather than their own earlier trigger
   tied to `judgingClosesAt`.
