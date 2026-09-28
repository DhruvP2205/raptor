# Stage Spec: README & JUDGING Deliverables

Status: **Design locked, drafts exist, this doc defines what "done"
means for both.**
Not a feature module — this specifies two required root-level
documents, matching the brief's stated deliverable list alongside
`ARCHITECTURE.md`/`DATA-MODEL.md`/`LICENSE`. Written after initial
drafts of both already existed, specifically to pin down what each
must contain rather than leave "looks complete" as a subjective bar.
If a future draft and this doc disagree, this doc wins — update the
file to match it, not the other way around.

---

## 1. Audience — different for each, and that difference drives
everything below

**`README.md`** is read first, by someone deciding whether this is
worth looking at closely at all, and by someone trying to actually
get it running. Two readers, same document: skim-friendly at the top,
detailed enough to actually follow by the middle.

**`JUDGING.md`** is read by someone already convinced it's worth
evaluating, specifically checking whether the scoring/normalization
pipeline is mathematically defensible. This reader wants precision,
not friendliness — exact formulas, exact tie-break order, exact lock
conditions.

---

## 2. `README.md` — required sections

1. **One-paragraph identity** — what this is, in language that
   doesn't require already knowing the brief.
2. **Table of contents** — required once the document exceeds
   roughly one scroll, which this one does.
3. **Prerequisites** — exact tool versions needed (Docker, Compose),
   stated explicitly rather than assumed.
4. **Quickstart** — the actual `docker compose up` path, and what
   happens automatically as a result, enumerated step by step.
5. **First steps after boot** — a concrete narrative (log in as the
   seeded organizer, look at the fixture event, try the demo) — not
   just "the API is now running," which tells a new reader nothing
   about what to actually do next.
6. **Configuration / secrets** — how the Docker-secrets pattern
   (`ARCHITECTURE.md` §5) actually gets filled in by a self-hoster,
   not just a cross-reference with no concrete steps.
7. **Demo environment** — `DEMO_MODE`, what it does, how to turn it
   on and off, and the isolation guarantee (Module 20) stated
   plainly enough that someone doesn't need to read that whole stage
   doc to trust it.
8. **Running the acceptance checker** — the literal command, and
   where `.dogfood.toml`'s values actually come from (Module 19).
9. **Running the test suite** — the actual command, not just a
   claimed pass count with no way to reproduce it.
10. **Tiers claimed** — stated plainly, distinct from a separate
    honest listing of what's built beyond the formal claim (see
    Section 4 of the existing draft's reasoning — kept as-is, this
    section's *shape* was already right, just needed the rest of the
    document built up around it).
11. **Feature status table** — every module, built or not, no
    omissions.
12. **Architecture summary** — enough to orient, with a real pointer
    to `ARCHITECTURE.md` for depth, not a duplicate of it.
13. **Project structure** — the actual monorepo layout
    (`ARCHITECTURE.md` §3), since someone opening the repo for the
    first time benefits from a map before they start clicking through
    directories blind.
14. **Troubleshooting** — the handful of things that actually go
    wrong for a first-time runner (port conflicts, a migration that
    needs a clean volume), stated plainly rather than left for
    someone to discover by trial and error.
15. **Docs map** — pointer to every other doc, what's in each.
16. **License**.

**What "covers every detail" does not mean:** duplicating
`ARCHITECTURE.md`, `DATA-MODEL.md`, or `JUDGING.md`'s actual content
inline. Every section above that touches something documented in
depth elsewhere summarizes and points, rather than re-explaining —
the same "one shared source, not two that could drift" principle
already governing everything else in this project.

---

## 3. `JUDGING.md` — required sections

Already largely satisfied by the existing draft; restated here as the
explicit bar rather than left implicit:

1. The pipeline in order, stated as a diagram or equivalent.
2. Verification, briefly (it's covered in depth elsewhere; this
   document only needs the reader to know it exists and what it
   gates).
3. Assignment: both modes, the per-judge cap and its override, the
   no-show transfer rule, the participant-anonymity guarantee.
4. Scoring: the three criterion kinds, the exact formula, the
   overflow/"Overachiever" display rule, the bonus-guardrail warning,
   unlimited resubmission.
5. Normalization: the calibration profile, the minimum-N fallback,
   the zero-variance flag, the manual-trigger/re-run window, and —
   stated with real emphasis, since it's the single most important
   guarantee in this whole document — the permanent, no-exception
   lock the moment results are announced.
6. Ranking: the exact tie-break cascade, dense ranking, the
   deliberately different special-award cascade, and the "ties share,
   never an arbitrary tiebreaker" rule stated as an absolute.
7. Publishing and correction: the draft/publish gate, and exactly what
   a post-publish correction requires and produces.
8. What this document does not need to re-explain in depth: voting,
   certificates, global ranking — one paragraph each, pointing to
   their own stage docs, since this document's job is the
   judge-decided pipeline specifically, not every feature that
   happens to touch a number.
9. A closing statement of what actually keeps this defensible —
   backend enforcement, mandatory-reason audit trail, no third-party
   dependency in the pipele itself.

---

## 4. What "done" looks like — the actual acceptance bar for both
documents

- **A person who has never seen this project can run
  `docker compose up`, then run the acceptance checker, using only
  `README.md`'s instructions** — no outside knowledge, no needing to
  open a second document to find a missing step.
- **A person skimming only `README.md`'s table of contents and
  headers, without reading a single paragraph, still comes away
  knowing what this is, what's built, and how far it's claimed to
  go.**
- **A person reading only `JUDGING.md` can state, in their own words,
  the exact conditions under which two submissions share a rank, and
  the exact moment normalization becomes unchangeable** — if either
  of those requires cross-referencing a stage doc to actually
  understand, this document hasn't done its job.

---

## 5. Open questions

None blocking.
