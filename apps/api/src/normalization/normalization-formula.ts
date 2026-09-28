// Module 9 (Normalization) — see docs/stages/09-normalization.md
// Section 5. Pure functions, no I/O.

export interface JudgeZScoreInput {
  rawTotal: number;
  judgeMean: number;
  judgeStdDev: number;
  judgeSampleCount: number;
  eventMean: number;
  eventStdDev: number;
  minimumN: number;
}

export interface JudgeZScoreResult {
  zScore: number;
  usedFallback: boolean;
  uniformScoringFlagged: boolean;
}

// Section 5's three-way formula. below-minimum-N judges fall back to
// the event baseline (Section 4); at-or-above-minimum-N judges use
// their own personal mean/stddev, unless that stddev is exactly 0
// ("uniform scoring", Section 5.1) — flagged, z forced to 0 (neutral).
export function computeJudgeZScore(input: JudgeZScoreInput): JudgeZScoreResult {
  const { rawTotal, judgeMean, judgeStdDev, judgeSampleCount, eventMean, eventStdDev, minimumN } = input;

  if (judgeSampleCount >= minimumN) {
    if (judgeStdDev > 0) {
      return { zScore: (rawTotal - judgeMean) / judgeStdDev, usedFallback: false, uniformScoringFlagged: false };
    }
    return { zScore: 0, usedFallback: false, uniformScoringFlagged: true };
  }

  // Fallback branch (Section 4). eventStdDev = 0 isn't addressed by the
  // doc's formula (it assumes a real spread exists across the event) —
  // defensively treated the same as judge-level zero-variance (neutral
  // z = 0) rather than producing NaN/Infinity, since a divide-by-zero
  // here would silently corrupt every downstream average/rescale.
  const zScore = eventStdDev > 0 ? (rawTotal - eventMean) / eventStdDev : 0;
  return { zScore, usedFallback: true, uniformScoringFlagged: false };
}

// Section 5 — "take every submission's averaged z value and linearly
// rescale that entire set onto 0-100, using the actual min and max of
// the set as the rescale bounds." A degenerate set (every value
// identical, including the single-submission case) has no spread to
// rescale — the midpoint avoids a divide-by-zero NaN rather than the
// doc addressing this edge case explicitly.
export function rescaleToZeroHundred(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) {
    return values.map(() => 50);
  }
  return values.map((v) => ((v - min) / (max - min)) * 100);
}
