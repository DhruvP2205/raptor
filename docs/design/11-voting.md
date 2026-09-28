# Frontend Design: Module 11 — Voting

Status: **Design locked, not yet implemented.**
Backend reference: `stages/11-voting.md`.

**Resolving the open question from the module map**: whether viewing
the shortlist without voting is public. Decision made directly here,
consistent with everything else public on this platform: **shortlist
viewing is public** (same as the results page it's revealed alongside,
backend D141) — only the act of *casting a vote* requires
authentication and eligibility. Anyone can see who's up for audience
choice; only eligible signed-in people can actually vote. This should
be confirmed against the backend doc's intent, but it's the reading
most consistent with this platform's general public/private line
(view is open, act is gated) and is treated as decided for this pass.

---

## 1. Screens

1. **Public: Shortlist / ballot.**
2. **Organizer: Shortlist curation.**
3. **Organizer: Round management.**

---

## 2. Shortlist / ballot (public)

### Structure
Grid of shortlisted submissions (same card component as the public
gallery, Module 5 — reused, not reinvented). If the viewer is
eligible and the round is open: each card has a **Vote** button. If
not eligible, or not signed in, or the round hasn't opened/has closed:
no vote buttons — replaced by a single, specific explanatory line
matching whichever condition applies (never a generic "voting
unavailable").

Casting a vote: click **Vote** on a card → invisible proof-of-work
resolves automatically in the background (no visible UI for this at
all — it's meant to be imperceptible, per backend D45) → occasionally,
if abuse signals are elevated, a visible image CAPTCHA modal appears
before the vote completes → confirmation state on the card itself
("Your vote ✓"), all other cards' Vote buttons disappear (single-choice
— once voted, done, for this round).

### States
| State | Behavior |
|---|---|
| Not signed in | Cards shown, no vote buttons, banner: "Sign in to vote." |
| Signed in, not eligible (mode/account-age gate) | No vote buttons, specific reason shown: "Voting in this event is open to participants only" or "Your account was created after this event started" — matching whichever backend rule actually excluded them, not a blanket message |
| Signed in, eligible, round not yet open | No vote buttons, "Voting opens {date}." |
| Signed in, eligible, round open, hasn't voted | Vote buttons active on every card |
| Vote submitted successfully | That card shows confirmation, all other Vote buttons removed from the page |
| Vote rejected — already voted (race condition, e.g. two tabs) | Same confirmation-card treatment as success, not an error — the person already has a vote recorded, so this should look identical to having just voted, never alarming |
| CAPTCHA challenge appears | Modal-style overlay, solving it retries the vote automatically on success — never a separate manual retry step |
| Round closed | No vote buttons, "Voting has closed for this round." Tally remains hidden regardless (backend: never shown until results publish) |
| Results published (`VotingResultVersion: LIVE`) | Percentage + total count now shown per card — never per-voter detail, at any point, matching backend absolutely |

---

## 3. Shortlist curation (organizer)

### Structure
Ranked list of all `APPROVED` submissions (by the selected
normalization run's score, same run-selection pattern as Module 10),
each with a checkbox. Top-N pre-checked based on an organizer-set
range input ("top 4–8"). Organizer freely toggles any row.
**Finalize shortlist** button — once finalized, locked (no further
edits without a full round restart, Section 4).

### States
Standard organizer-tool states (loading, error, save). One specific
rule: **finalizing requires at least one selected submission** — an
empty shortlist submit is blocked inline, not silently allowed to
produce a ballot with nothing on it.

---

## 4. Round management (organizer)

### Structure
Current round status, two actions: **Minor correction** (a lightweight
inline edit — fix a displayed name/typo — explicitly **not** routed
through the destructive Modal, since backend guarantees zero effect on
cast votes; the UI should reflect that low stakes, a simple inline
edit form, not a heavy confirmation) and **Restart round** (destructive
Modal, reason required, mandatory per backend — consequence line:
"This deactivates the current round. All its votes are excluded from
results. A new round starts from a blank shortlist. This can't be
undone.").

### States
| State | Behavior |
|---|---|
| Outside the restart window (`resultsAnnounceAt` to `eventClosedAt`) | Restart action absent, not disabled |
| Restart confirmed | Old round marked deactivated (shown in a small round-history list, never deleted), new round begins at Section 3 (blank shortlist, organizer rebuilds from scratch — **not** pre-populated, confirmed against backend's explicit "starts completely from scratch" rule) |
| Round history | Every past round (including deactivated ones) viewable read-only, each showing its own final tally for audit purposes — organizer/admin only, same visibility boundary as everywhere else vote-detail-adjacent |

---

## 5. Flow continuity check

- **Into this module:** the shortlist becomes visible the instant
  Module 10's `PublishedResultVersion` goes `LIVE` — confirming that
  promised hand-off now that this doc exists.
- **Out of this module:** `VotingResultVersion` publication (same
  draft/publish/correct pattern as Module 10, not re-specified in full
  here — it's identical, just for vote tallies instead of judge
  scores) feeds Module 14's Global Ranking points for audience-choice
  wins.
