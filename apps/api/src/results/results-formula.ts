// Module 10 (Results & Rankings) — see
// docs/stages/10-results-and-rankings.md Sections 3/4. Pure functions,
// no I/O. Every comparison uses a small epsilon rather than strict
// `===` — these values arrive after several chained float operations
// upstream (division, normalization's rescale), so two numbers the
// domain considers "the same" can differ by a trailing bit of float
// error. A strict-equality tie check would then wrongly treat a real
// tie as broken, a genuine (if subtle) bug class here, not a
// hypothetical one — the doc's own test list requires exact-tie
// detection to work ("identical finalScore, identical
// averageRawTotal, identical bonus").
const EPSILON = 1e-9;

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

export interface RankCandidate {
  submissionId: string;
  finalScore: number;
  averageRawTotal: number;
  bonusRaw: number;
}

export interface RankResult {
  submissionId: string;
  rank: number;
  // True whenever another submission shares this exact rank — a tie
  // that survived all three cascade levels resolves by sharing, never
  // an arbitrary fourth-level tiebreaker (Section 3).
  isShared: boolean;
}

// Section 3 — three-level cascade (finalScore -> averageRawTotal ->
// bonusRaw), dense ranking (not skip-ranking): a tied pair takes the
// same rank, and the next distinct-scoring submission takes the very
// next sequential rank, never skipping ahead by the tied group's size.
export function computeRankResults(candidates: RankCandidate[]): RankResult[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => {
    if (!nearlyEqual(a.finalScore, b.finalScore)) return b.finalScore - a.finalScore;
    if (!nearlyEqual(a.averageRawTotal, b.averageRawTotal)) return b.averageRawTotal - a.averageRawTotal;
    if (!nearlyEqual(a.bonusRaw, b.bonusRaw)) return b.bonusRaw - a.bonusRaw;
    return 0;
  });

  const sameGroup = (a: RankCandidate, b: RankCandidate) =>
    nearlyEqual(a.finalScore, b.finalScore) &&
    nearlyEqual(a.averageRawTotal, b.averageRawTotal) &&
    nearlyEqual(a.bonusRaw, b.bonusRaw);

  const rows: { submissionId: string; rank: number }[] = [];
  let rank = 0;
  let prev: RankCandidate | null = null;
  for (const c of sorted) {
    if (prev === null || !sameGroup(c, prev)) {
      rank += 1;
    }
    rows.push({ submissionId: c.submissionId, rank });
    prev = c;
  }

  const countByRank = new Map<number, number>();
  for (const r of rows) {
    countByRank.set(r.rank, (countByRank.get(r.rank) ?? 0) + 1);
  }
  return rows.map((r) => ({ ...r, isShared: (countByRank.get(r.rank) ?? 0) > 1 }));
}

export interface SpecialAwardCandidate {
  submissionId: string;
  nominationCount: number;
  bonusRaw: number;
  finalScore: number;
}

export interface SpecialAwardWinner {
  submissionId: string;
  isShared: boolean;
}

// Section 4 — nominationCount -> bonusRaw -> finalScore -> share. Bonus
// is checked *before* the general final score, the reverse order from
// computeRankResults's cascade — deliberate, per the doc's own
// reasoning (a special category like "Most Unique Feature" correlates
// more directly with a topically-relevant bonus track than the overall
// weighted rubric does).
export function computeSpecialAwardWinners(candidates: SpecialAwardCandidate[]): SpecialAwardWinner[] {
  if (candidates.length === 0) return [];

  const maxNominationCount = Math.max(...candidates.map((c) => c.nominationCount));
  // Nobody nominated anyone for this award at all — no winner, not a
  // degenerate all-tied winner set.
  if (maxNominationCount === 0) return [];

  let pool = candidates.filter((c) => c.nominationCount === maxNominationCount);

  if (pool.length > 1) {
    const maxBonus = Math.max(...pool.map((c) => c.bonusRaw));
    pool = pool.filter((c) => nearlyEqual(c.bonusRaw, maxBonus));
  }
  if (pool.length > 1) {
    const maxFinal = Math.max(...pool.map((c) => c.finalScore));
    pool = pool.filter((c) => nearlyEqual(c.finalScore, maxFinal));
  }

  const isShared = pool.length > 1;
  return pool.map((c) => ({ submissionId: c.submissionId, isShared }));
}
