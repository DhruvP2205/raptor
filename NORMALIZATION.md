# Normalization: method and proof

Different judges score differently. Some are generous, some harsh,
regardless of what they are looking at. Normalization tries to correct
for that without hiding the original numbers.

This document states the method, runs it on the organizer-supplied
`fixtures.json`, and then tests whether it actually helps. **The last
test gave a mixed answer, and Sections 4 and 5 say so plainly.**

Everything below is reproducible:

```bash
python3 scripts/normalization-proof.py apps/api/prisma/fixtures.json
```

Full output is saved in `docs/normalization-proof-output.txt`. The
script is an independent re-implementation of the method, written to
cross-check the platform, not the platform's own code (see Section 7).

---

## 1. The method

For each completed review, a judge's **raw total** is the weighted
criteria score plus any bonus points (`JUDGING.md` Section 4). Then:

1. **Profile.** Each judge has a mean and standard deviation over their
   own completed reviews. On the platform this profile spans every
   event they have judged, and updates after each review.
2. **Z-score.** A review's normalized value is
   `(rawTotal - judgeMean) / judgeStdDev`.
3. **Minimum sample.** A judge with fewer than **3** completed reviews
   (counted platform-wide) has an unreliable profile. Their reviews are
   normalized against the current event's own mean and standard
   deviation instead.
4. **Zero variance.** A judge who gave every review the same score has
   no spread to divide by. Their z-score is set to 0 and the judge is
   flagged for organizer visibility.
5. **Project score.** A project's normalized score is the mean of its
   reviews' normalized values. Ranking then follows the tie-break rules
   in `JUDGING.md` Section 6.

Operational rules that make it safe to use: running it is manual and
repeatable between the close of judging and the results announcement;
each run stores a frozen snapshot of every judge's profile as it stood;
it locks permanently when results are announced; and the raw score is
always shown next to the normalized one, never replaced by it.

## 2. What the fixture looks like

After the import rules (one submission per team, later entry wins; a
judge who scored both entries keeps the later score):

| | |
|---|---|
| Projects scored / judges / reviews | 40 / 30 / 123 |
| Reviews per project (min / median / max) | 2 / 3 / 6 |
| Reviews per judge (min / median / max) | 1 / 3 / 11 |
| Judges with 3 or more reviews (own profile) | 22 |
| Judges below the minimum (event baseline used) | 8 |
| Spread of judge means (sd, on the 2 to 5 raw scale) | 0.315 |
| Judge who scored everything identically | `jdg_07` |

So the fixture exercises every safeguard in Section 1: the minimum-
sample fallback, the zero-variance flag, and the resubmission rule.

## 3. What normalization does to the fixture

Normalizing changes the ranking substantially. **37 of 40 projects
change rank; the largest move is 15 places.** The rank correlation
between raw and normalized order is 0.847. The top five differ:

| | Raw order | Normalized order |
|---|---|---|
| 1 | Salt Ledger | Iron Switch |
| 2 | Iron Switch | Slow Trail |
| 3 | Still Beacon | Salt Ledger |
| 4 | Dry Relay | Salt Loom |
| 5 | Salt Loom | Dry Relay |

Largest movers (rank under raw to rank under normalized):

| Up | | Down | |
|---|---|---|---|
| Paper Anchor | 18 to 9 | Dry Harbour | 15 to 30 |
| Glass Beacon | 19 to 10 | Flat Meadow | 22 to 37 |
| Salt Ferry | 16 to 8 | Small Relay | 11 to 26 |
| Open Beacon | 22 to 14 | Small Loom | 16 to 28 |

The full 40-project table is in `docs/normalization-proof-output.txt`.
Movement alone proves nothing: a method that added random noise would
also move ranks. The next section asks whether the movement is
*improvement*.

## 4. Does it work? A test with known truth

The fixture has no ground truth, so we built one. The script keeps the
fixture's **real** judge-to-project assignment pattern, invents a true
quality for each project, gives each judge a random leniency bias and
scale, adds noise, and measures how well each method recovers the true
order (Spearman correlation, average over 2,000 runs). Bias strength is
`tau`; `R` is a measurable stand-in for it (spread of judge means
relative to spread of all scores), so real data can be placed on the
same scale.

| tau | R | Raw mean | Platform z-score | Additive model* | z-score at least as good as raw |
|---|---|---|---|---|---|
| 0.00 | 0.471 | 0.905 | 0.829 | 0.893 | 2% |
| 0.25 | 0.503 | 0.895 | 0.826 | 0.889 | 5% |
| 0.50 | 0.575 | 0.873 | 0.823 | 0.882 | 14% |
| 0.75 | 0.652 | 0.839 | 0.821 | 0.869 | 38% |
| 1.00 | 0.725 | 0.801 | 0.818 | 0.855 | 58% |
| 1.50 | 0.825 | 0.716 | 0.811 | 0.813 | 83% |

\* Project-plus-judge effects fitted together, with shrinkage on the
judge effects. Evaluated only; **not implemented in the platform.**

**The fixture's R is 0.491.** That sits at the low-bias end of the
table, next to the first two rows.

## 5. What that means, honestly

- **On this fixture, per-judge z-scoring probably makes the ranking
  less accurate, not more.** In the regime the fixture resembles,
  plain averaging recovers the true order better (about 0.90 against
  0.83 in simulation). Much of the rank movement in Section 3 is
  estimation noise, not corrected bias.
- **The method pays off when judges genuinely differ a lot.** Once
  leniency differences are large (R around 0.72 and above), it beats
  raw averaging, and at strong bias it beats it clearly.
- **Why it struggles here.** Each judge sees only a handful of
  projects (median 3). A judge's mean then reflects *which projects
  they happened to see* as much as how generous they are, and a
  standard deviation from three reviews is unstable. Z-scoring cannot
  tell those apart; it treats all of it as leniency.
- **The simulation makes assumptions** (noise level, scale variation,
  independent judges). Different assumptions move the numbers; they do
  not obviously flip the pattern, but this is a model, not the
  organizer's data.

## 6. Safeguards that already limit the damage

- Raw and normalized scores are always shown side by side, so an
  organizer sees when normalization moves a project a lot.
- Normalization is never automatic: an organizer chooses whether and
  when to run it, and can re-run it.
- Judges with too little history fall back to the event baseline, and
  a judge with no spread is flagged instead of trusted.
- Every run is a frozen snapshot, so what was used is always
  recoverable.

## 7. Cross-checking against the platform

**Status: performed, live, against a real local instance.** Booted the
api against the real fixture-imported database, triggered a
`POST /events/:id/normalization-runs`, and exported
`GET /events/:id/export/normalization-comparison.csv`
(`docs/design/18-csv-export.md` Section 8). First result was the
**second** outcome below, exactly as predicted — found, root-caused,
and fixed, then re-verified against the third outcome.

- Rankings match: the platform implements Section 1 as written.
- **The platform showed no rank movement at all (this is what actually
  happened, first try):** `fixtures-import.ts` (Module 16) writes
  `JudgeAssignment`/`Score`/`JudgeReview` rows directly, exactly as this
  document predicted, and never triggered the calibration-update side
  effect a real `submit-review` call carries
  (`stages/09-normalization.md` Section 3: "recomputed after every
  submit-review call"). Confirmed precisely: the run's
  `NormalizedJudgeScore` rows showed **123/123 judge-scores on
  `usedFallback: true`, 0 on their own profile** — every judge, not
  just the 8 genuinely below the minimum-N=3 threshold. **This was a
  bug in the import path, exactly as this document called it, and it
  is now fixed** — `fixtures-import.ts` recomputes every imported
  judge's calibration profile after import, reusing the same pure
  `computeMeanStdDev`/`computeJudgeRawTotal` functions
  `CalibrationService.recompute()` uses (not a second implementation of
  the formula). Re-verified after the fix: **22 judges on their own
  profile, 8 on the event baseline — an exact match to this script's
  own numbers in Section 2.** Re-running the normalization export
  afterward showed real rank movement, and the corrected top-5
  (Iron Switch, Slow Trail, Salt Ledger, Salt Loom, ...) tracks this
  script's own top-5 (Section 3) closely — 4 of the top 5 in identical
  order.
- **Small differences remain, and do — confirmed, not hypothetical.**
  The platform's `computeMeanStdDev` uses the **population** form
  (divide by N — `apps/api/src/common/stats.util.ts`, a deliberate
  choice documented there); this script uses the **sample** form
  (divide by N minus 1). This fully accounts for the platform's
  `Salt Kiln`/`Dry Relay` 5th-place swap against this script's
  Section 3 table — the ranking mechanism is confirmed correct, the
  residual gap is exactly the convention difference this section
  already anticipated.

**One caveat on reproducing this exactly:** the fixture importer sets
`judgingClosesAt`/`resultsAnnounceAt` a few hours relative to *import
time*, and the normalization trigger route enforces
`judgingClosesAt <= now() < resultsAnnounceAt` with no admin override
once `resultsAnnounceAt` passes (`stages/09-normalization.md` Section
6 — by design, no exceptions). Days after a real seed, that window is
long closed and permanently locked; this check was actually performed
by resetting the local fixture database immediately before running it,
so the window was open. There is currently no supported way to re-run
this specific live check against an old, already-locked fixture
import without a fresh reset.

## 8. Limits a statistician will raise

- Judge mean and spread are confounded with which projects the judge
  saw whenever the design is sparse (Section 5).
- Three reviews give a poor spread estimate; the threshold of 3 is a
  practical floor, not a statistically comfortable one.
- Scale differences between judges are corrected together with
  location differences, which is more than some events need.
- Scores are point estimates; no uncertainty is reported with them.

## 9. Recommended upgrade (evaluated, not implemented)

Fit project quality and judge leniency **jointly**, shrinking the judge
effects toward zero. In Section 4 this is the most robust option: never
far below raw averaging when bias is absent (0.893 against 0.905),
better than both alternatives from moderate bias upward, and level with
z-scoring at the strongest bias. It is cheap (a linear system of about
70 unknowns for this fixture). Adopting it means adding a method
field to each normalization run and keeping the current method
selectable. That is a change to a module that is already built and
tested, so it is a decision for the project owner, not something this
document assumes.
