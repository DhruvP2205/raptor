# DESIGN-SYSTEM.md

The visual language for Raptor's frontend — the actual tokens and
component specs, not prose descriptions. Every module design doc in
`design/` references this file rather than redefining values; if a
doc's "same button as before" doesn't match what's written here,
this file wins. Update it here first, then fix the drift.

Locked from the mockup iterations already reviewed and approved
(events list, polished pass, responsive pass) — this doc formalizes
what those already established, plus fills in values that were used
consistently but never written down anywhere.

---

## 1. Principles (why the rest of this file looks the way it does)

- **Enterprise-conservative, not designed-agency-distinctive.**
  Explicit direction from review: no custom display fonts, no
  bespoke accent palette with a backstory. This should read like
  software a large, established company built — GitHub, Atlassian,
  Microsoft 365 territory — not like a startup's marketing site.
- **Performance over search-engine SEO.** Confirmed priority: fast
  and snappy matters, indexability doesn't. This is *why* Section 2
  is a system font stack with zero webfont downloads — it's a
  performance decision wearing a typography hat, not a style
  preference.
- **Motion is purposeful, not decorative.** Every transition in this
  system either gives feedback (a button responding to a click) or
  communicates a real state change (a live-status pulse, a stagger on
  first load). Nothing animates just to look alive.
- **One shared implementation per pattern, used everywhere it
  applies.** Same principle `CLAUDE.md` already states for markdown
  rendering — a button, a badge, a table row don't get reinvented
  per screen.

---

## 2. Typography

**Font stack — system fonts only, no webfont download:**
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             Helvetica, Arial, sans-serif;
```
Monospace (used only for real data — scores, counts, IDs — never
decoratively):
```css
font-family: ui-monospace, Consolas, monospace;
```

**Type scale** (all sizes in px, matching what the reviewed mockups
actually used — this is a record of the real scale in use, not a
theoretical one):

| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `display` | 22px (20px mobile) | 28px | 600 | Page titles (e.g. "Events") |
| `heading` | 15–17px | 22px | 600 | Card/section headings, nav brand |
| `body` | 14px | 20px | 400 | Default body text |
| `body-medium` | 13.5–14.5px | 20px | 500 | Interactive text — nav links, buttons |
| `small` | 12.5–13px | 18px | 400–500 | Secondary/meta text (slugs, timestamps) |
| `micro` | 11–12px | 16px | 400–500 | Table header labels, tiny meta |

No display/expanded typeface, no italics anywhere in the system, no
more than two weights (400, 500) outside of headings (600) — keeping
the weight range narrow is part of what reads as "enterprise," not
"designed."

---

## 3. Color

**Two layers, not one — raw palette, then semantic tokens mapped onto
it.** This was a mistake in the first draft of this file: hardcoding
raw palette values (`gray-600`, `blue-50`) directly into components
was justified as an anti-"vibe-coded" signal, but that reasoning
doesn't hold up under scrutiny — semantic tokens are exactly what
GitHub Primer, Atlassian, and IBM Carbon actually do. The fix isn't
adding a branded palette back in; it's naming what each color is *for*,
so the raw value can change in one place later (dark mode, a rebrand,
a contrast fix) without hunting through every component.

### 3.1 Raw palette (unchanged values, now just the bottom layer)

| Raw token | Hex |
|---|---|
| `gray-900` | `#111827` |
| `gray-600` | `#4B5563` |
| `gray-500` | `#6B7280` |
| `gray-400` | `#9CA3AF` |
| `gray-200` | `#E5E7EB` |
| `gray-100` | `#F3F4F6` |
| `gray-50` | `#F9FAFB` |
| `white` | `#FFFFFF` |
| `blue-700` | `#1D4ED8` |
| `blue-600` | `#2563EB` |
| `blue-500` | `#3B82F6` |
| `blue-50` | `#EFF6FF` |
| `amber-700` | `#B45309` |
| `amber-50` | `#FFFBEB` |
| `amber-200` | `#FDE68A` |
| `green-700` | `#15803D` |
| `green-50` | `#F0FDF4` |
| `green-200` | `#BBF7D0` |
| `red-700` | `#B91C1C` |
| `red-600` | `#DC2626` |
| `red-50` | `#FEF2F2` |
| `red-200` | `#FECACA` |

### 3.2 Semantic tokens — what components actually reference

| Semantic token | Maps to | Use |
|---|---|---|
| `text-primary` | `gray-900` | Main content text |
| `text-secondary` | `gray-600` | Supporting/meta text |
| `text-muted` | `gray-500` | De-emphasized text |
| `text-placeholder` | `gray-400` | Empty-field hints, disabled text |
| `text-link` | `blue-600` | Links, "View" actions |
| `text-on-primary` | `white` | Text on filled primary/danger buttons |
| `surface-page` | `gray-50` | Page background |
| `surface-default` | `white` | Card/table/input background |
| `surface-hover` | `gray-100` | Hover fill (nav items, ghost buttons) |
| `surface-selected` | `blue-50` | Active nav tab, selected row |
| `border-default` | `gray-200` | Standard borders/dividers |
| `border-hover` | `gray-400` | Input/select hover border |
| `border-focus` | `blue-500` | Focus border |
| `ring-focus` | `blue-500` @ 25% alpha | Focus ring, every interactive element |
| `action-primary` | `blue-600` → `blue-700` gradient | Primary button |
| `action-danger` | `red-600` → `red-700` gradient | **New — destructive actions (Section 7.2)** |
| `status-live` | `amber-700` / `amber-50` / `amber-200` | Judging, registration open, voting open |
| `status-success` | `green-700` / `green-50` / `green-200` | Results announced, verified, approved |
| `status-neutral` | `gray-600` / `gray-100` / `gray-200` | Archived, draft, inactive |
| `status-danger` | `red-700` / `red-50` / `red-200` | **New — disqualified, rejected, error states** |

**Rule:** components and module design docs reference the semantic
column, never the raw one directly. If a semantic token needs a
different raw value later (dark mode, contrast fix), it changes once,
here — not at every call site.

**Rule, restated from the first draft, still true:** color is never
the only signal. Every status pairing includes a text label.

---

## 4. Spacing & sizing

Standard Tailwind spacing scale (4px increments) used directly — no
custom scale. Component-specific sizing observed across the reviewed
mockups:

| Element | Value |
|---|---|
| Page max-width | 1200px |
| Page horizontal padding | 24px desktop, 16px mobile |
| Header height | 56px (`h-14`) |
| Button height (default) | 32px desktop, 36px mobile (touch targets need more room) |
| Input/select height | Same as button — 32px / 36px |
| Table row vertical padding | 14px (comfortable) |
| Card padding | 16px |
| Border radius, default | 6px (`rounded-md`) |
| Border radius, pills/badges/dots | Full (`rounded-full`) |

---

## 5. Elevation

**Was a single shadow value — too thin.** One `shadow-sm` works for
static cards/tables, but a dropdown, modal, and toast all need to
visually sit *above* other content by different amounts, and "one
shadow" can't express layering. Real scale:

| Token | Value | Use |
|---|---|---|
| `elevation-flat` | `shadow-sm`: `0 1px 2px rgba(0,0,0,0.05)` | Cards, table container — resting content |
| `elevation-raised` | `0 4px 12px rgba(0,0,0,0.08)` | Dropdown menus, popovers |
| `elevation-overlay` | `0 12px 32px rgba(0,0,0,0.14)` | Modal dialogs (Section 7.6) |
| `elevation-toast` | `0 4px 16px rgba(0,0,0,0.12)` | Toast notifications |

No blur/glassmorphism effects anywhere. Still restrained — four
values, not a sprawling scale — but enough to express real layering
once dropdowns and modals exist, which they now do (Section 7.6).

## 5.1 Z-index scale

Never documented before, even though the sticky header already used
arbitrary `z-10`/`z-20` values in the mockups. A stacking order,
defined once:

| Token | Value | Use |
|---|---|---|
| `z-header` | 20 | Sticky nav header |
| `z-dropdown` | 30 | Select menus, popovers |
| `z-modal-backdrop` | 40 | Modal dialog backdrop |
| `z-modal` | 50 | Modal dialog itself |
| `z-toast` | 60 | Toast notifications — always above everything, including an open modal |

---

## 6. Motion

| Property | Value | Used for |
|---|---|---|
| Hover/interaction transitions | 140–160ms, `ease` | Color, background, border changes on hover |
| Button press feedback | 120ms, `ease` | `:active` scale(0.98–0.99) + translateY(1px) |
| Entrance animation | 320ms, `cubic-bezier(0.16, 1, 0.3, 1)` | First-load stagger only (40ms delay per item) — one orchestrated moment, not repeated on every re-render |
| Live-status pulse | 2s, `ease-in-out`, infinite | Only on active/live status dots |
| Row hover accent bar | 180ms, `cubic-bezier(0.16, 1, 0.3, 1)` | `scaleY` from 0, transform-origin center |

**`prefers-reduced-motion: reduce` collapses every duration above to
~0ms.** Non-negotiable, applied globally, not per-component.

---

## 7. Components

Each component below now includes its **contract** (the props/states
an engineer actually needs to implement it), not just visual
description — a design doc that only describes appearance isn't
finished from an engineering-handoff perspective.

### 7.1 Button — primary
```css
background: linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%);
box-shadow: 0 1px 2px rgba(29,78,216,0.15), inset 0 1px 0 rgba(255,255,255,0.12);
/* hover: */ filter: brightness(1.06); box-shadow: 0 4px 10px rgba(29,78,216,0.28), inset 0 1px 0 rgba(255,255,255,0.15);
/* active: */ transform: translateY(1px) scale(0.99);
/* disabled: */ background: gray-200; color: gray-400; box-shadow: none; cursor: not-allowed; /* no hover/active effects fire */
```
Text: white, 13.5–14px, weight 500. Loading state: label stays,
leading icon replaced by a spinner, button disabled.

**Contract:** `variant: primary | secondary | ghost | danger`,
`size: default | small`, `disabled: boolean`, `loading: boolean`,
`icon?: ReactNode`.

### 7.2 Button — danger (new)

**The single most-missing piece in the first draft of this system.**
This backend requires a mandatory written reason before nearly every
consequential action — disqualifying a submission, banning an
account, restarting a voting round, correcting published results,
deleting a comment as a moderator. Every one of those needs a visibly
*different* button from "Create event," and there was no such variant.

```css
background: linear-gradient(180deg, #DC2626 0%, #B91C1C 100%);
box-shadow: 0 1px 2px rgba(185,28,28,0.15), inset 0 1px 0 rgba(255,255,255,0.12);
/* hover/active/disabled: same pattern as primary, red in place of blue */
```
Used **only** for the confirming action inside a destructive
confirmation modal (7.6) — never as a standalone button sitting
loose in a toolbar. A destructive action always routes through the
modal first; the danger button only exists inside that modal.

### 7.3 Button — secondary/ghost
Plain text or bordered, `text-secondary` color, `surface-hover`
background on hover, no shadow, same transition timing as primary.
Disabled: `text-placeholder`, no hover effect.

### 7.4 Input / Select
White (`surface-default`) background, `border-default` border,
`rounded-md`. Focus: border becomes `border-focus` + `ring-focus`.
Placeholder text in `text-placeholder`. Hover (select only): border
darkens to `border-hover`. Disabled: `surface-hover` background,
`text-placeholder` text, no hover/focus effects fire, cursor
`not-allowed`.

**Contract:** `disabled: boolean`, `error: boolean` (renders
`status-danger` border/ring instead of default/focus — this was
never specified before either; form field error states existed only
as a description in `01-auth.md`, with no actual color values behind
them until this token layer existed).

### 7.5 Textarea (new)

Same visual treatment as Input (7.4), minimum 3 visible rows, resizes
vertically only (never horizontally — breaks layout). This exists
specifically for the mandatory-reason pattern (7.6) and for content
like a judge's overall feedback (backend Module 8) or a comment body
(Module 13) — both real, frequent needs that had no component before
now.

**Contract:** same as Input, plus `minRows`, `maxLength?` (some
reason fields may warrant a cap — not decided at the backend level,
so left optional here rather than assumed).

### 7.6 Modal / Confirmation dialog (new)

**The component this whole system was missing.** Two variants:

- **Standard modal** — a dialog for a multi-field action (e.g. the
  admin staff-account creation form's confirmation step from
  `02-roles-and-membership.md`'s outline).
- **Destructive confirmation modal** — the specific, recurring
  pattern for every "mandatory reason" action in the backend:
  - Heading names the action plainly: "Disqualify this submission?"
    — never a vague "Are you sure?"
  - One line stating the consequence, specifically: "This removes the
    submission from judging and results. This can be undone by an
    admin, but won't happen automatically."
  - A required `Textarea` (7.5) for the reason — **the confirm button
    stays disabled until this field is non-empty**, mirroring the
    backend's own validation (a disqualification with no reason is
    rejected at the API regardless, so the UI shouldn't let someone
    reach that rejection in the first place).
  - Two buttons: `secondary` "Cancel" and `danger` (7.2) "Disqualify
    submission" — the danger button's label always names the actual
    action, never a generic "Confirm."

**Structure:** backdrop (`z-modal-backdrop`, semi-transparent black),
centered panel (`z-modal`, `elevation-overlay`, `rounded-lg`,
white/`surface-default`), max-width 480px. Closes on backdrop click
or Escape key **only for the standard modal** — a destructive
confirmation modal does not close on backdrop click (prevents
accidentally dismissing/losing a half-typed reason), Escape still
works (always needs a keyboard-only escape hatch).

**Contract:** `variant: standard | destructive`, `title: string`,
`consequenceText?: string` (destructive only), `confirmLabel: string`
(must name the action, enforced by convention not code),
`requireReason: boolean` (destructive defaults true), `onConfirm`,
`onCancel`.

### 7.7 Badge / status pill
`rounded-full`, border + fill + text all from the same semantic
status token (Section 3.2), 12–12.5px text, small leading dot. Live
statuses get the pulse (Section 6); everything else is static.

**Contract:** `status: live | success | neutral | danger`,
`label: string`, `pulse?: boolean` (defaults to true only for `live`).

### 7.8 Table row
`border-default` divider between rows. Hover: background shifts to
`surface-hover`-adjacent (`#F8FAFC`, slightly lighter than the token
for this specific subtle case), a 2.5px `action-primary`-colored
accent bar slides in from the left. Never a full row shadow/lift on
hover.

### 7.9 Card (mobile row-equivalent)
`surface-default` background, `border-default` border, `rounded-lg`,
16px padding. Hover/focus: border shifts toward `border-focus`,
`elevation-flat` appears.

### 7.10 Avatar (new)

Not previously specified, but needed the moment any screen shows a
person — nav profile menu, team member lists, comment authors, judge
assignment lists, all real and all upcoming. Circular, three sizes
(24px small / 32px default / 40px large). No photo-upload capability
assumed at this stage (nothing in the backend spec supports an avatar
image) — renders as initials (first letter of `displayName`) on a
deterministic background color derived from the person's `User.id`
(same person always gets the same color, without needing a stored
color field).

**Contract:** `name: string`, `size: small | default | large`.

### 7.11 Skeleton (new, formalized as a system component)

Was described per-screen (events list doc) but never given a real
token here. Fill color `gray-100`, shimmer animation sweeping
`gray-100` → `gray-50` → `gray-100`, 1.5s `ease-in-out` infinite,
respects `prefers-reduced-motion` (becomes a static fill, no shimmer,
under that setting). Used for any loading state where the shape of
incoming content is already known (table rows, stat numbers, cards) —
never for a state where the shape is unpredictable, which gets a
plain spinner instead (see `01-auth.md`'s "Verifying your email…"
state for an example of the spinner case).

### 7.12 Empty state (formalized as a system pattern)

Centered, no illustration (consistent with the system's overall
restraint — an icon at most, never decorative artwork), a short
heading, one supporting line, and an action button only when the
viewer actually has permission to take one (established in the
events-list states doc, restated here as the general rule every
module should follow rather than re-deriving).

### 7.13 Toast
Bottom-of-screen, `elevation-toast`, auto-dismiss, success-only
(established in `01-auth.md`) — errors always get inline treatment
instead, never a toast.

### 7.14 Navigation
56px header, sticky (`z-header`), `surface-default` background,
`border-default` bottom border. Active tab: `surface-selected`
background + `blue-700` text. Inactive: `text-secondary`, hover to
`text-primary` + `surface-hover`. Mobile: collapses to a hamburger.

---

## 8. Responsive breakpoints

Standard Tailwind breakpoints, used directly:

| Breakpoint | Width | Behavior established so far |
|---|---|---|
| Default (mobile) | <640px | Nav collapses to hamburger; data tables collapse to stacked cards; filter bar stacks vertically; touch targets sized up (36px) |
| `sm` | ≥640px | "Sign in" text reappears in header; button labels un-collapse from icon-only |
| `md` | ≥768px | Table replaces cards; full nav links reappear |
| `lg` | ≥1024px | No changes established yet beyond `md` — revisit if a screen needs it |

**Rule, not just observation:** a data-dense table is never allowed
to just horizontally scroll on mobile as its only adaptation — it
must have a genuine restructured mobile layout (card stack, as
established for the events list). Horizontal-scroll-as-mobile-strategy
is explicitly rejected, stated once here so it doesn't need
re-litigating per module.

---

## 9. Iconography

Inline SVG only (no icon font, no icon library dependency — keeps the
performance story simple, nothing to load). Stroke-based, not filled,
`stroke-width` 1.6–2.2 depending on size. Sizes used: 13px (inline
with small text), 15–16px (form fields, buttons), 18–20px (nav/brand
mark). No icon is ever purely decorative without an accessible label
if it's interactive (Section 5 of `01-auth.md`'s accessibility
section — same rule, stated once here as the general case).

---

## 10. Accessibility baseline

- Text contrast meets WCAG AA at minimum for all body/label text
  against its background (`gray-600` on `white`/`gray-50` clears
  this; verify any new color pairing before adding it here).
- Focus rings are never removed, anywhere, on any interactive
  element — `blue-500/25` ring, consistent across buttons, inputs,
  rows, and cards.
- `prefers-reduced-motion` respected globally (Section 6).
- Color never carries information alone (Section 3).
- Real `<label>` elements for every form field, not placeholder-only
  (established in `01-auth.md`, restated here as a system-wide rule).

---

## 11. What's deliberately *not* here

- No dark mode — not requested, not designed. **The semantic token
  layer added in Section 3.2 means this is now a cheaper future
  addition than it would have been** — a dark palette would be a
  second raw-value mapping under the same semantic names, not a
  rewrite of every component. Still not built now; still a new
  section here first if it happens, not an assumption baked into
  component code.
- No component library dependency named yet (shadcn/ui was the
  confirmed direction back when this was discussed) — the values in
  this file are the actual design tokens regardless of which
  component library implements them; if shadcn/ui's defaults drift
  from a value written here, this file is what's authoritative.
