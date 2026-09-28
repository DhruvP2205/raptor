# Frontend Design: Module 12 — Certificates

Status: **Design locked, not yet implemented.**
Backend reference: `stages/12-certificates.md`. The anti-spoofing
principle from that doc (D106/D143 depending on which decision log)
governs this entire module's structure — **restated here as the
frontend's own hard rule**: no screen in this module ever contains a
free-text "recipient name" field. Not on any form, not anywhere.

---

## 1. Screens

1. **Public: Certificate view.**
2. **User: Certificate gallery** (own profile, public).
3. **Organizer: Template upload.**
4. **Organizer: Enable certificates action.**

---

## 2. Certificate view (public)

### Structure
The rendered SVG certificate, full-width, plus a verification panel
below it: recipient name, event, role, issue date, and a signature
status line ("Verified ✓" or, in the unlikely case of tampering,
a clear failure state — see below). A **Download PDF** button, visible
to everyone but only *functional* for the owner or a scoped organizer
(Section 5).

### States
| State | Behavior |
|---|---|
| Loaded, signature valid | "Verified ✓" in `status-success` styling |
| Loaded, signature invalid (should never happen under normal operation — this is a genuine integrity failure, not a UX edge case) | **Does not hide this.** Shows a prominent `status-danger` banner: "This certificate's signature doesn't match its data — it may have been tampered with." Silently showing a certificate as if it were fine when the cryptographic check fails would defeat the entire point of signing it |
| Download clicked, caller is the owner or scoped organizer | PDF downloads directly |
| Download clicked, caller lacks permission | **Button is present but disabled-with-explanation**, not hidden — this is a deliberate exception to the "hide, don't disable" rule established elsewhere in this design system (events-list doc, Section 9), because unlike "Create event," seeing that a download exists but isn't yours is itself meaningful information (confirms the certificate is real and downloadable by *someone*) rather than an action being falsely implied as universally available. Tooltip/inline text: "Only the recipient or an event organizer can download this." |
| Certificate ID doesn't resolve (invalid/guessed UUID) | Plain 404 — never a "certificate not found, did you mean..." suggestion list, which would reopen exactly the enumeration risk the UUID scheme was designed to prevent |

---

## 3. Certificate gallery (own profile, public)

### Structure
Confirmed public per backend D110 and the module map — reached at any
user's profile URL, no auth required to view. Grid of certificate
summaries (event, role, date), each linking to Section 2's full view.

### States
Standard empty/loading/error states. One specific note: **this page
never differentiates "this is your own profile" vs. "you're viewing
someone else's"** beyond an owner seeing their own download buttons
enabled by default (Section 2's permission logic already handles
this correctly per-certificate; the gallery itself needs no separate
permission model).

---

## 4. Template upload (organizer)

### Structure
SVG file upload (drag-and-drop + file picker), a live preview panel
showing the template with placeholder token values substituted (e.g.
`{{recipientName}}` → "Jordan Rivera") so the organizer sees roughly
what recipients will see, without needing a real certificate to exist
yet.

### States
| State | Behavior |
|---|---|
| Upload accepted | Preview renders, save button available |
| Upload rejected — not valid SVG / contains disallowed content (script tags, `foreignObject`, etc. — backend's sanitization pass, D36) | **The frontend does not attempt to explain exactly what was stripped or why** — matching this design system's general instinct (established back in the certificate backend discussion) not to narrate detection mechanics. Plain message: "This SVG couldn't be used as a certificate template. Check that it doesn't include scripts or embedded HTML, then try again." |
| Save while an event's certificates are already enabled (Module 12 Section 4) | Allowed — this bumps `templateVersion`; a confirmation line notes: "Already-issued certificates keep their original design. Only certificates issued from now on use this new one." — matching backend's version-snapshot behavior exactly, so nobody's surprised later by certificates looking inconsistent across time |

---

## 5. Enable certificates (organizer)

### Structure
A single toggle/button on the event's admin area, gated exactly as the
backend requires.

### States
| State | Behavior |
|---|---|
| No `PublishedResultVersion` at `LIVE` yet | Action **absent**, not disabled — "Certificates can be enabled once results are published." |
| Available | "Enable certificates" button → standard (non-destructive) confirmation, since this is a one-way switch but not consequential-with-blame the way disqualifying is |
| Enabled | Every eligible participant/judge now sees a "Get your certificate" action wherever they'd look for it (event detail, profile) — this doc doesn't re-specify that entry point since it's a small addition to already-designed screens, not a new one |
| Disqualified submission's team, certificates enabled | No automatic certificate-issuance entry point shown to them (backend default exclusion) — if an organizer manually overrides and issues one anyway, it simply appears in that person's gallery (Section 3) like any other, with no special "manually issued" marking visible publicly (the override itself is audit-logged on the backend, not something the UI needs to surface to the recipient) |

---

## 6. Flow continuity check

- **Into this module:** gated on Module 10's results publication
  (explicit dependency, restated from that doc's own flow-continuity
  note).
- **Out of this module:** certificate gallery links appear on user
  profiles generally — the same profile surface Module 14's Global
  Ranking drill-down will eventually sit alongside, worth noting now
  since both are "public things about a specific person," and should
  probably share one profile-page shell rather than being two
  unrelated routes. Flagged for Module 14's doc to pick up.
