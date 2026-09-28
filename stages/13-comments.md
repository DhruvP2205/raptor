# Stage Spec: Comments

Status: **Design locked, not yet implemented.**
Depends on Module 1 (Auth, `emailVerifiedAt`), Module 5 (Submission,
gallery visibility). If code and this doc disagree, update this doc
first.

---

## 1. Scope of this stage

- Who can comment, and on what.
- Structure (flat, no threading), editing, and soft-delete moderation.
- The per-event enable/disable toggle.
- Rate limiting, reusing existing infrastructure rather than building
  new abuse-detection machinery.

This is a deliberately small module — most of the hard design tensions
elsewhere in this platform (isolation, deadlines, tie-breaking) don't
apply to a simple public comment thread. Most decisions below were made
directly rather than round-tripped, since they're consistent low-risk
defaults rather than genuine forks — flagged as such in Section 10.

---

## 2. Who can comment

- **Eligibility: any user with `User.emailVerifiedAt` set** — the same
  trust bar as voting's `VERIFIED_PLATFORM_USERS` mode. **Not
  participation-gated** — unlike voting, comments aren't a competitive
  mechanism, so restricting to only participants on that specific event
  isn't necessary the way it is for a ballot.
- **Not gated by the event's `votingEligibilityMode`** — that setting
  governs voting specifically (Module 11); comments use their own,
  simpler, always-the-same bar regardless of what voting mode an event
  chose.

---

## 3. What can be commented on

- Any submission currently visible in the public gallery
  (`Submission.isDraft: false`, Module 5) — comments are not gated by
  Module 6's verification status or Module 10's results-publication
  state. A submission stays commentable through its full public
  lifecycle, including if later disqualified, unless the organizer
  disables comments for the event entirely.
- **Per-event toggle:** `Event.commentsEnabled` (default `true`).
  Organizer can disable comments entirely — when disabled, no new
  comments can be posted, but existing ones remain visible (disabling
  is not the same as deleting).

---

## 4. Structure: flat, no threading

**No `parentCommentId`, no nested replies.** A submission has one flat,
chronological list of comments. Not requested to be threaded anywhere
in prior discussion, and matches the brief's plain "comments on gallery
projects" framing rather than a full discussion-forum feature.

---

## 5. Editing

- The comment's author can edit it at any time, with no time limit —
  no separate "unlock" step, no deadline tied to any event timestamp.
- An edited comment shows an **`(edited)`** indicator to any viewer —
  transparent editing rather than either disallowing edits or silently
  allowing an edit with no trace.
- `Comment.editedAt` tracks the most recent edit timestamp (same
  "most-recent, not original" pattern already used elsewhere, e.g.
  `Submission.submittedAt`, D31).

---

## 6. Deletion — soft-delete only, two different actors, two different
requirements

- **Self-deletion by the comment's own author:** no justification
  required — a person can freely remove their own comment.
- **Moderation deletion by organizer/admin:** **requires a mandatory,
  non-empty reason**, same pattern as every other consequential
  organizer action in this platform (disqualification, bans, voting
  round restarts, results corrections) — and writes a complete
  `AuditLog` entry.
- **Always soft-delete** (`Comment.deletedAt` set, row never
  hard-deleted) — consistent with "nothing silently disappears"
  applied everywhere else. A deleted comment is hidden from public
  view but remains queryable by admin for dispute-resolution purposes.

---

## 7. Abuse mitigation

- **Rate-limited** on comment creation, using the same Redis-backed
  mechanism already built for voting/CAPTCHA (`ARCHITECTURE.md` §2) —
  no new infrastructure needed.
- **No automated content filtering** (profanity/spam detection) is
  built for this stage — consistent with this platform's general
  preference for audit-and-moderate (a human reviewing and removing bad
  content, with a reason, after the fact) over automated pre-filtering,
  the same philosophy applied to voting's abuse-flagging (Module 11,
  D47) and verification's manual review queue (Module 6).

---

## 8. Data model

### `Comment`

| Field | Type | Notes |
|---|---|---|
| `id`, `submissionId`, `userId` | | |
| `body` | text | |
| `createdAt`, `editedAt` | datetime, nullable | `editedAt` set on every edit, most-recent only |
| `deletedAt` | datetime, nullable | Soft-delete only, never a hard `DELETE` |
| `deletedByUserId`, `deletionReason` | fk, text, nullable | `deletionReason` mandatory **only** when deletion was performed by someone other than the comment's own author (i.e. a moderation action) |

### `Event` extension

| Field | Type | Notes |
|---|---|---|
| `commentsEnabled` | boolean | Default `true` |

---

## 9. What I'm testing for this module

- A user without `emailVerifiedAt` set cannot post a comment, regardless
  of whether they're a participant on the event.
- A comment on a submission that's since become `isDraft: true` again
  (e.g. a team unsubmitted per Module 5) — does the comment stay
  visible even though the submission itself is temporarily back in
  draft? **Decided directly: yes, an existing comment remains visible
  regardless of the submission's current draft state** — only new
  comment *creation* is gated by current gallery visibility, not the
  continued display of comments already posted. Tested explicitly,
  since this is an easy inconsistency to introduce by accident.
- `Event.commentsEnabled: false` blocks new comment creation but leaves
  existing comments visible.
- Self-deletion succeeds with no reason provided; organizer/admin
  deletion is rejected if `deletionReason` is empty.
- A soft-deleted comment disappears from the public-facing list but
  remains retrievable via an admin-only query.
- Editing a comment updates `editedAt` and the public view shows the
  `(edited)` indicator; the original `createdAt` is unchanged.
- Rate limiting rejects a burst of rapid comment-creation attempts from
  the same account, using the existing Redis-backed mechanism.

---

## 10. Open questions

None blocking. Every decision in this module was made directly by
Claude rather than round-tripped to the user, since none of them
represent a genuine policy fork the way earlier modules' decisions did
— they're consistent, low-risk defaults drawn from patterns already
established elsewhere in this platform (soft-delete, mandatory reasons
for moderation, rate-limiting via existing infrastructure, transparent
editing). Flag any of the following if a different default is wanted:

1. Eligibility bar (verified email, not participation-gated).
2. No threading/nested replies.
3. Unlimited-time, indicator-shown editing.
4. Comments remaining visible even if their submission later reverts
   to draft.
