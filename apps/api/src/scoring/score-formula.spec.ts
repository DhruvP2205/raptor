import { computeFinalScore, computeJudgeRawTotal } from './score-formula';

describe('computeJudgeRawTotal', () => {
  it('computes generalRaw as the weighted sum of SCORING criteria, divided by 100', () => {
    const result = computeJudgeRawTotal([
      { kind: 'SCORING', weightPercent: 60, value: 90 }, // 54
      { kind: 'SCORING', weightPercent: 40, value: 80 }, // 32
    ]);
    expect(result.generalRaw).toBeCloseTo(86, 10); // (60*90 + 40*80)/100
    expect(result.bonusRaw).toBe(0);
    expect(result.rawTotal).toBeCloseTo(86, 10);
  });

  it('adds bonusRaw directly, in the same raw units as generalRaw (not divided)', () => {
    const result = computeJudgeRawTotal([
      { kind: 'SCORING', weightPercent: 100, value: 92.2 },
      { kind: 'BONUS', weightPercent: null, value: 5 },
      { kind: 'BONUS', weightPercent: null, value: 3 },
    ]);
    expect(result.generalRaw).toBeCloseTo(92.2, 10);
    expect(result.bonusRaw).toBe(8);
    expect(result.rawTotal).toBeCloseTo(100.2, 10);
  });

  it('never lets SPECIAL_AWARD nominations contribute to the formula', () => {
    const result = computeJudgeRawTotal([
      { kind: 'SCORING', weightPercent: 100, value: 50 },
      { kind: 'SPECIAL_AWARD', weightPercent: null, value: 1 },
    ]);
    expect(result.rawTotal).toBe(50);
  });

  it('regression: dividing generalRaw down before adding bonus was a rejected, broken variant', () => {
    // A weak project (generalRaw 10) with a large bonus must not beat a
    // strong project (generalRaw 95) with none, when bonus stays small
    // relative to 100 — this only holds if bonus is added while
    // generalRaw is still in its full 0-100 range.
    const weakWithBonus = computeJudgeRawTotal([
      { kind: 'SCORING', weightPercent: 100, value: 10 },
      { kind: 'BONUS', weightPercent: null, value: 8 },
    ]);
    const strongNoBonus = computeJudgeRawTotal([{ kind: 'SCORING', weightPercent: 100, value: 95 }]);
    expect(weakWithBonus.rawTotal).toBeLessThan(strongNoBonus.rawTotal);
  });
});

describe('computeFinalScore — worked examples from the stage doc (Section 3.4)', () => {
  it('Example A: no bonus, two judges', () => {
    const result = computeFinalScore([83.75, 67.5], 5);
    expect(result.averageRawTotal).toBeCloseTo(75.625, 10);
    expect(result.finalScore).toBeCloseTo(3.78125, 10);
    expect(result.isOverflow).toBe(false);
  });

  it('Example B: with bonus, one non-responding judge excluded entirely (not counted as 0)', () => {
    // Judge C never submitted — the caller simply never includes them
    // in the array; divisor is 2, not 3.
    const result = computeFinalScore([100.2, 60], 5);
    expect(result.averageRawTotal).toBeCloseTo(80.1, 10);
    expect(result.finalScore).toBeCloseTo(4.005, 10);
    expect(result.isOverflow).toBe(false);
  });

  it('Example C: overflow, checked at the averaged level', () => {
    const result = computeFinalScore([108, 105.75], 5);
    expect(result.averageRawTotal).toBeCloseTo(106.875, 10);
    expect(result.finalScore).toBeCloseTo(5.34375, 10);
    expect(result.isOverflow).toBe(true);
  });

  it('a single generous judge alone does not trigger overflow if the average stays <= 100', () => {
    // One judge over 100, one well under — average must land at or
    // below 100 for this case to be meaningful.
    const result = computeFinalScore([120, 70], 5);
    expect(result.averageRawTotal).toBe(95);
    expect(result.isOverflow).toBe(false);
  });

  it('reduces to exactly (generalRaw / 100) * displayScale when there is no bonus at all', () => {
    const result = computeFinalScore([50], 5);
    expect(result.finalScore).toBeCloseTo((50 / 100) * 5, 10);
  });

  it('returns a zero result (not NaN/Infinity) when there are no COMPLETED judges yet', () => {
    const result = computeFinalScore([], 5);
    expect(result.averageRawTotal).toBe(0);
    expect(result.finalScore).toBe(0);
    expect(result.isOverflow).toBe(false);
  });

  it('respects a custom finalScoreDisplayScale, never confusing it with the 0-100 input scale', () => {
    const result = computeFinalScore([80], 10);
    expect(result.finalScore).toBeCloseTo(8, 10);
  });
});
