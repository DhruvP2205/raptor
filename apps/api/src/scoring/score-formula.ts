// Module 8 (Rubric & Scoring) — see docs/stages/08-rubric-and-scoring.md
// Section 3. Pure functions, no I/O — the formula itself is testable
// against the doc's three worked examples (Section 3.4) without a
// database. Display rounding/formatting of the resulting numbers is
// deliberately NOT this module's job — these return exact floats; a
// consumer (a future results/UI layer) decides how to round for
// display, which avoids baking a specific rounding policy into the
// arithmetic itself.

export type CriterionKindForScoring = 'SCORING' | 'BONUS' | 'SPECIAL_AWARD';

export interface ScoredCriterion {
  kind: CriterionKindForScoring;
  weightPercent: number | null;
  value: number;
}

export interface JudgeRawTotal {
  generalRaw: number;
  bonusRaw: number;
  rawTotal: number;
}

// Section 3.1 — combine general and bonus while still in raw units.
// SPECIAL_AWARD scores never contribute (Section 2.3 — tallied
// separately by nomination count, entirely outside this formula).
export function computeJudgeRawTotal(scores: ScoredCriterion[]): JudgeRawTotal {
  let generalRaw = 0;
  let bonusRaw = 0;

  for (const score of scores) {
    if (score.kind === 'SCORING') {
      generalRaw += (score.value * (score.weightPercent ?? 0)) / 100;
    } else if (score.kind === 'BONUS') {
      bonusRaw += score.value;
    }
  }

  return { generalRaw, bonusRaw, rawTotal: generalRaw + bonusRaw };
}

export interface FinalScoreResult {
  averageRawTotal: number;
  finalScore: number;
  // Section 3.3 — checked at the averaged level, never per individual
  // judge. Section 3.5's fixed "Overachiever" label applies whenever
  // this is true.
  isOverflow: boolean;
}

// Section 3.2/3.3 — average raw totals across COMPLETED judges only
// (the caller is responsible for that filtering; this function has no
// concept of JudgeAssignment.status, it just averages whatever it's
// given), then scale exactly once, at the very end.
export function computeFinalScore(
  completedJudgeRawTotals: number[],
  finalScoreDisplayScale: number,
): FinalScoreResult {
  if (completedJudgeRawTotals.length === 0) {
    return { averageRawTotal: 0, finalScore: 0, isOverflow: false };
  }

  const averageRawTotal =
    completedJudgeRawTotals.reduce((sum, v) => sum + v, 0) / completedJudgeRawTotals.length;
  const finalScore = (averageRawTotal / 100) * finalScoreDisplayScale;

  return { averageRawTotal, finalScore, isOverflow: averageRawTotal > 100 };
}

// Section 3.5 — flat, not tiered by degree of overflow.
export const OVERFLOW_LABEL = 'Overachiever';
