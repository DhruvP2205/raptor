// Population mean/stddev (divide by N, not N-1) — used for both a
// judge's platform-wide calibration profile and an event's per-run
// baseline (docs/stages/09-normalization.md Sections 3/4). The doc
// doesn't specify sample vs. population variance; population is used
// here since these are treated as the complete record of that judge's
// (or event's) history at this moment, not a sample estimating some
// larger population — a judgment call, not a literal instruction.
export function computeMeanStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}
