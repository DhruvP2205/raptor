import { computeJudgeZScore, rescaleToZeroHundred } from './normalization-formula';

describe('computeJudgeZScore', () => {
  it('uses the judge\'s own mean/stddev once they meet minimum-N with real variance', () => {
    const result = computeJudgeZScore({
      rawTotal: 90,
      judgeMean: 70,
      judgeStdDev: 10,
      judgeSampleCount: 5,
      eventMean: 50,
      eventStdDev: 20,
      minimumN: 3,
    });
    expect(result.zScore).toBeCloseTo(2, 10); // (90-70)/10
    expect(result.usedFallback).toBe(false);
    expect(result.uniformScoringFlagged).toBe(false);
  });

  it('falls back to the event baseline below minimum-N, producing a different z than the (unreliable) personal figures would', () => {
    const belowMinimumN = computeJudgeZScore({
      rawTotal: 90,
      judgeMean: 70, // if used directly, would give z=2 — wrong, too small a sample
      judgeStdDev: 10,
      judgeSampleCount: 2, // below minimumN
      eventMean: 50,
      eventStdDev: 20,
      minimumN: 3,
    });
    expect(belowMinimumN.usedFallback).toBe(true);
    expect(belowMinimumN.zScore).toBeCloseTo(2, 10); // (90-50)/20, using event baseline
    // Confirm this genuinely differs from what the personal (too-small
    // -sample) figures would have produced with a different event mean.
    const withDifferentEventBaseline = computeJudgeZScore({
      rawTotal: 90,
      judgeMean: 70,
      judgeStdDev: 10,
      judgeSampleCount: 2,
      eventMean: 30,
      eventStdDev: 10,
      minimumN: 3,
    });
    expect(withDifferentEventBaseline.zScore).not.toBeCloseTo(belowMinimumN.zScore, 5);
  });

  it('flags uniform scoring and forces z=0 when a qualified judge has zero variance', () => {
    const result = computeJudgeZScore({
      rawTotal: 77,
      judgeMean: 77,
      judgeStdDev: 0,
      judgeSampleCount: 10,
      eventMean: 50,
      eventStdDev: 20,
      minimumN: 3,
    });
    expect(result.zScore).toBe(0);
    expect(result.uniformScoringFlagged).toBe(true);
    expect(result.usedFallback).toBe(false);
  });

  it('never produces NaN/Infinity when the event baseline itself has zero variance', () => {
    const result = computeJudgeZScore({
      rawTotal: 60,
      judgeMean: 0,
      judgeStdDev: 0,
      judgeSampleCount: 1,
      eventMean: 60,
      eventStdDev: 0,
      minimumN: 3,
    });
    expect(result.zScore).toBe(0);
    expect(Number.isFinite(result.zScore)).toBe(true);
  });
});

describe('rescaleToZeroHundred', () => {
  it('rescales linearly using the actual min/max of the set', () => {
    const result = rescaleToZeroHundred([-2, 0, 2]);
    expect(result[0]).toBeCloseTo(0, 10);
    expect(result[1]).toBeCloseTo(50, 10);
    expect(result[2]).toBeCloseTo(100, 10);
  });

  it('returns the midpoint for a degenerate (all-identical) set instead of NaN', () => {
    const result = rescaleToZeroHundred([5, 5, 5]);
    expect(result).toEqual([50, 50, 50]);
  });

  it('returns the midpoint for a single-submission event', () => {
    expect(rescaleToZeroHundred([3.14])).toEqual([50]);
  });

  it('returns an empty array for an empty input', () => {
    expect(rescaleToZeroHundred([])).toEqual([]);
  });
});
