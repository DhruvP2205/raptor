import { computeRankResults, computeSpecialAwardWinners } from './results-formula';

describe('computeRankResults', () => {
  it('uses dense ranking, not skip-ranking — exact A > B=C > D fixture from the stage doc', () => {
    const results = computeRankResults([
      { submissionId: 'A', finalScore: 4.5, averageRawTotal: 90, bonusRaw: 0 },
      { submissionId: 'B', finalScore: 4.0, averageRawTotal: 80, bonusRaw: 0 },
      { submissionId: 'C', finalScore: 4.0, averageRawTotal: 80, bonusRaw: 0 },
      { submissionId: 'D', finalScore: 3.5, averageRawTotal: 70, bonusRaw: 0 },
    ]);
    const byId = new Map(results.map((r) => [r.submissionId, r]));

    expect(byId.get('A')).toEqual({ submissionId: 'A', rank: 1, isShared: false });
    expect(byId.get('B')).toEqual({ submissionId: 'B', rank: 2, isShared: true });
    expect(byId.get('C')).toEqual({ submissionId: 'C', rank: 2, isShared: true });
    // D takes 3rd, not 4th — the position is not skipped after the tie.
    expect(byId.get('D')).toEqual({ submissionId: 'D', rank: 3, isShared: false });
  });

  it('breaks a finalScore tie using averageRawTotal', () => {
    const results = computeRankResults([
      { submissionId: 'X', finalScore: 4.0, averageRawTotal: 85, bonusRaw: 0 },
      { submissionId: 'Y', finalScore: 4.0, averageRawTotal: 90, bonusRaw: 0 },
    ]);
    const byId = new Map(results.map((r) => [r.submissionId, r]));
    expect(byId.get('Y')!.rank).toBe(1);
    expect(byId.get('X')!.rank).toBe(2);
    expect(byId.get('Y')!.isShared).toBe(false);
  });

  it('breaks a finalScore + averageRawTotal tie using bonusRaw', () => {
    const results = computeRankResults([
      { submissionId: 'X', finalScore: 4.0, averageRawTotal: 85, bonusRaw: 2 },
      { submissionId: 'Y', finalScore: 4.0, averageRawTotal: 85, bonusRaw: 5 },
    ]);
    const byId = new Map(results.map((r) => [r.submissionId, r]));
    expect(byId.get('Y')!.rank).toBe(1);
    expect(byId.get('X')!.rank).toBe(2);
  });

  it('a three-way tie surviving every cascade level shares one rank, never an arbitrary 4th tiebreaker', () => {
    const results = computeRankResults([
      { submissionId: 'X', finalScore: 4.0, averageRawTotal: 85, bonusRaw: 3 },
      { submissionId: 'Y', finalScore: 4.0, averageRawTotal: 85, bonusRaw: 3 },
      { submissionId: 'Z', finalScore: 4.0, averageRawTotal: 85, bonusRaw: 3 },
    ]);
    expect(results.every((r) => r.rank === 1)).toBe(true);
    expect(results.every((r) => r.isShared)).toBe(true);
  });

  it('treats near-identical floats (trailing precision error) as a genuine tie', () => {
    const results = computeRankResults([
      { submissionId: 'X', finalScore: 4 + 1e-10, averageRawTotal: 85, bonusRaw: 0 },
      { submissionId: 'Y', finalScore: 4 - 1e-10, averageRawTotal: 85, bonusRaw: 0 },
    ]);
    expect(results[0].rank).toBe(results[1].rank);
    expect(results[0].isShared).toBe(true);
  });

  it('returns an empty array for no candidates', () => {
    expect(computeRankResults([])).toEqual([]);
  });
});

describe('computeSpecialAwardWinners', () => {
  it('winner is whoever has the highest nomination count', () => {
    const winners = computeSpecialAwardWinners([
      { submissionId: 'A', nominationCount: 3, bonusRaw: 0, finalScore: 3 },
      { submissionId: 'B', nominationCount: 5, bonusRaw: 0, finalScore: 3 },
    ]);
    expect(winners).toEqual([{ submissionId: 'B', isShared: false }]);
  });

  it('breaks a nomination-count tie using bonusRaw BEFORE finalScore (reverse of the rank cascade)', () => {
    const winners = computeSpecialAwardWinners([
      { submissionId: 'A', nominationCount: 4, bonusRaw: 2, finalScore: 4.9 }, // higher finalScore
      { submissionId: 'B', nominationCount: 4, bonusRaw: 8, finalScore: 3.1 }, // higher bonusRaw
    ]);
    // B must win on bonusRaw despite a lower finalScore — proves bonus
    // is checked first, not finalScore.
    expect(winners).toEqual([{ submissionId: 'B', isShared: false }]);
  });

  it('falls back to finalScore only once nomination count AND bonusRaw both tie', () => {
    const winners = computeSpecialAwardWinners([
      { submissionId: 'A', nominationCount: 4, bonusRaw: 5, finalScore: 4.9 },
      { submissionId: 'B', nominationCount: 4, bonusRaw: 5, finalScore: 3.1 },
    ]);
    expect(winners).toEqual([{ submissionId: 'A', isShared: false }]);
  });

  it('shares the award when every cascade level ties', () => {
    const winners = computeSpecialAwardWinners([
      { submissionId: 'A', nominationCount: 4, bonusRaw: 5, finalScore: 4.0 },
      { submissionId: 'B', nominationCount: 4, bonusRaw: 5, finalScore: 4.0 },
    ]);
    expect(winners).toHaveLength(2);
    expect(winners.every((w) => w.isShared)).toBe(true);
  });

  it('returns no winner when nobody was nominated at all', () => {
    const winners = computeSpecialAwardWinners([
      { submissionId: 'A', nominationCount: 0, bonusRaw: 5, finalScore: 4.0 },
      { submissionId: 'B', nominationCount: 0, bonusRaw: 3, finalScore: 3.0 },
    ]);
    expect(winners).toEqual([]);
  });

  it('returns an empty array for no candidates', () => {
    expect(computeSpecialAwardWinners([])).toEqual([]);
  });
});
