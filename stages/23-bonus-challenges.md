# Stage Spec: Bonus Challenges

Status: **Threat Model and Normalization Proof both Claimed (Section
3). API First and Pairwise Mode deliberately stopped at Designed, not
built — a project-owner decision, not a gap (Section 7).**
Not a feature module. It specifies four optional deliverables, the
rules for claiming them, and what "done" means for each, so a claim can
never run ahead of the evidence. Written after the first drafts
existed, for the same reason `21-readme-judging.md` was: "looks
complete" is not a bar. If a file and this doc disagree, this doc wins.

---

## 1. What the bonuses are worth, and what they are not

The four challenges are optional: Normalization Proof (+5), Pairwise
Mode (+5), Threat Model (+3), API First (+3). Points **do not change
the project's score**. They only separate projects that finish tied,
and they feed the Best Judging Engine prize. The organizers' own advice
is to do the ones that can be done properly and not to sample all four.

The direct payoff is therefore small. The real value of a bonus is the
work it forces: two of them strengthen Judging Integrity (25% of the
score) and `JUDGING.md`, which feeds it. That is the reason to do them,
and it is also the reason a shaky claim is worse than no claim.

## 2. Claim rules

`.dogfood.toml` only accepts tiers; there is no field for bonuses. So
bonus status lives in the README, in one vocabulary:

| Status | Meaning |
|---|---|
| **Claimed** | The acceptance bar in Section 3 is fully met and verified. |
| **Documented, unverified** | The document exists; some statement in it has not been checked against running code. Not a claim. |
| **Designed, not built** | A spec exists; nothing runs. Not a claim. |
| **Not attempted** | No work. |

Rules:

1. A bonus is **Claimed** only when every item in its "done when" list
   is true. Partial evidence means "Documented, unverified".
2. The README shows the current status column of Section 3 verbatim,
   and is updated in the same change that moves a status.
3. A statement in any bonus document that has not been checked against
   the code stays in that document's "to confirm" section. It is never
   quietly promoted to fact.
4. Nothing may be described as built because it was designed.

## 3. The four deliverables

### 3.1 Threat Model (+3)

Files: `THREAT-MODEL.md` (repository root).

Done when:
- it covers the five abuse classes the brief names (Sybil votes,
  ballot stuffing, submission scraping, judge collusion, deadline
  gaming) and states what was not stopped;
- every control it names has been checked against the code;
- the "to confirm" section (its Section 7) is empty and removed.

To verify, and report back (each changes a sentence in the document):

| Item | Decides |
|---|---|
| Which timestamp repository verification reads (commit metadata or push time) | How strong limit 5.5 really is |
| Whether any read route, including the gallery, is rate-limited | Limit 5.4 |
| Whether login has rate limiting or lockout | Limit 5.8 |
| Whether fixture import can be switched off | Limit 5.7 |
| Session cookie attributes (SameSite, Secure) | Cross-site request forgery exposure |

Current status: **Claimed.** All five abuse classes covered with what
was and wasn't stopped stated; every control in the "to verify" table
above has been checked directly against the running code (commit
timestamp source, gallery/login rate limiting, fixture-import switch,
cookie attributes) and folded into the document; the former Section 7
is empty and has been removed.

### 3.2 Normalization Proof (+5)

Files: `NORMALIZATION.md` (root), `scripts/normalization-proof.py`,
`docs/normalization-proof-output.txt`.

Done when:
- the cross-check in the document's Section 7 has been performed on
  the imported fixture event and its outcome recorded in the document;
- the recorded output file matches a fresh run of the script (the
  script is seeded, so it must reproduce exactly);
- the command in the document points at the real fixture path
  (`apps/api/prisma/fixtures.json`);
- the document's finding about sparse data (that per-judge z-scoring
  is not clearly better than plain averaging on this fixture) is
  carried into `JUDGING.md` Section 5 as a pointer, so the two
  documents do not disagree;
- the project owner has recorded a decision on the joint-model upgrade
  (adopt it, or leave the current method with the limitation stated).

To verify: does the fixture import build the judge calibration
profiles? If it does not, every judge falls back to the event baseline
and a normalization run shows no rank movement. That would be a bug in
the import path, not in the method, and must be fixed before this can
be claimed.

**This is exactly what happened, live, on the first real run**: 123/123
judge-scores fell back to the event baseline, 0 on a real profile — the
import path bug named above, confirmed rather than hypothetical. Fixed
(`fixtures-import.ts` now recomputes calibration profiles after
import, reusing `CalibrationService`'s own math). Re-verified: 22
own-profile / 8 fallback, an exact match to `normalization-proof.py`'s
independent numbers. `docs/normalization-proof-output.txt` reproduces
byte-for-byte against a fresh run (line-ending difference only). Fixture
path in the document is the real one. `JUDGING.md` Section 5.4 carries
the sparse-data pointer.

Current status: **Claimed.** All five "done when" items are met,
including the last: the project owner decided to keep the current
z-score method as-is (D184, `docs/DECISIONS.md`) — the joint-model
upgrade's advantage exists only in simulation, on assumptions the
document itself never claimed as certain, against a method that's
built, tested, and now live-verified to match the independent
reference script exactly. The sparse-data limitation stays documented
(this file, and `JUDGING.md` Section 5.4) rather than engineered away.

### 3.3 API First (+3)

Files: `API.md` (root), `openapi.json` (root, generated).

Done when:
- the running API serves its OpenAPI document, and a single command
  writes it to `openapi.json`;
- the document describes the real cookie security scheme;
- the three checks in `API.md` Section 4 (route coverage, committed
  file is current, UI-to-API traceability) exist and run in the test
  suite;
- the API's base URL and port are the same in `README.md`, `API.md`
  and `.dogfood.toml`.

Current status: **Documented, unverified.** Not to be claimed until
the generated spec and the three checks exist.

### 3.4 Pairwise Mode (+5)

Files: `stages/22-pairwise-mode.md`, `scripts/bradley-terry-reference.py`,
`docs/bradley-terry-reference-output.txt`.

Done when (a future claim only): the mode is implemented, demonstrated
on generated comparisons, and every test in that document's Section 8
passes.

Current status: **Designed, not built.** The README already lists it as
not built, which stays true.

## 4. Where every file goes

```
repo root      THREAT-MODEL.md   NORMALIZATION.md   API.md
scripts/       normalization-proof.py   bradley-terry-reference.py
               requirements.txt   (contains: numpy)
docs/          normalization-proof-output.txt
               bradley-terry-reference-output.txt
stages/        22-pairwise-mode.md   23-bonus-challenges.md (this file)
```

Not committed: the packaging zip and its `bonus/` folder.

The scripts need numpy, unlike the acceptance checker, which needs only
the standard library. The README must say so, or a reader running them
gets an import error.

## 5. Changes to other files

| File | Change |
|---|---|
| `README.md` | Docs map: add the four new documents. Add a "Bonus challenges" table using Section 3's status column, verbatim. |
| `JUDGING.md` | Section 5: a short pointer to `NORMALIZATION.md`'s limits. |
| `NORMALIZATION.md` | Replace the placeholder fixture path with the real one. |
| `DECISIONS.md` | Log the normalization-method decision once the owner makes it. |

## 6. What I'm testing for this module

- Every status in the README matches Section 3 exactly.
- Every file in Section 4 exists at that path, and every path a
  document mentions resolves.
- Re-running each script reproduces its committed output file.
- No document contains a statement about the running system that is
  neither verified nor listed in a "to confirm" section.
- `NORMALIZATION.md`, `JUDGING.md` and the README agree with each other
  about what normalization does and how well it works.

## 7. Open questions

None. Both resolved by the project owner (D184, `docs/DECISIONS.md`):

- **Normalization method:** keep the current z-score method as-is. The
  joint-model upgrade's advantage is simulation-only; the shipped
  method is built, tested, and live-verified.
- **Remaining bonuses:** stop at Threat Model + Normalization Proof.
  Two done properly, matching the organizers' own advice, rather than
  four attempted thin. API First and Pairwise Mode stay
  **Designed, not built** — not a gap, a deliberate stop.
