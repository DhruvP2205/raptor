import { computeMeanStdDev } from './stats.util';

describe('computeMeanStdDev', () => {
  it('computes the population mean and stddev of a known set', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] has population stddev exactly 2.
    const result = computeMeanStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result.mean).toBeCloseTo(5, 10);
    expect(result.stdDev).toBeCloseTo(2, 10);
  });

  it('returns stdDev 0 for a set of identical values', () => {
    const result = computeMeanStdDev([10, 10, 10]);
    expect(result.mean).toBe(10);
    expect(result.stdDev).toBe(0);
  });

  it('returns 0/0 for an empty set rather than NaN', () => {
    const result = computeMeanStdDev([]);
    expect(result.mean).toBe(0);
    expect(result.stdDev).toBe(0);
  });
});
