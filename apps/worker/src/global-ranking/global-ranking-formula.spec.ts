import { computeGlobalRanking, type GlobalRankCandidate } from './global-ranking-formula';

function candidate(overrides: Partial<GlobalRankCandidate> & { userId: string }): GlobalRankCandidate {
  return {
    points: 0,
    firstsCount: 0,
    secondsCount: 0,
    thirdsCount: 0,
    eventsCount: 0,
    firstEventDate: null,
    ...overrides,
  };
}

describe('computeGlobalRanking', () => {
  it('ranks purely by points when nothing else is tied', () => {
    const result = computeGlobalRanking([
      candidate({ userId: 'a', points: 10 }),
      candidate({ userId: 'b', points: 20 }),
      candidate({ userId: 'c', points: 5 }),
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.userId, r]));
    expect(byId.b.rank).toBe(1);
    expect(byId.a.rank).toBe(2);
    expect(byId.c.rank).toBe(3);
    expect(result.every((r) => !r.isTied)).toBe(true);
  });

  it('falls through to firsts, then seconds, then thirds when points tie', () => {
    const result = computeGlobalRanking([
      candidate({ userId: 'a', points: 10, firstsCount: 1 }),
      candidate({ userId: 'b', points: 10, firstsCount: 0, secondsCount: 5 }),
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.userId, r]));
    expect(byId.a.rank).toBe(1);
    expect(byId.b.rank).toBe(2);
  });

  it('falls through to eventsCount when points/firsts/seconds/thirds all tie', () => {
    const result = computeGlobalRanking([
      candidate({ userId: 'a', points: 10, eventsCount: 3 }),
      candidate({ userId: 'b', points: 10, eventsCount: 5 }),
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.userId, r]));
    expect(byId.b.rank).toBe(1);
    expect(byId.a.rank).toBe(2);
  });

  it('falls through to earliest firstEventDate as the second-to-last tiebreaker', () => {
    const result = computeGlobalRanking([
      candidate({ userId: 'a', points: 10, firstEventDate: new Date('2026-06-01') }),
      candidate({ userId: 'b', points: 10, firstEventDate: new Date('2026-01-01') }),
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.userId, r]));
    expect(byId.b.rank).toBe(1); // earlier date wins
    expect(byId.a.rank).toBe(2);
  });

  it('shares a rank (dense ranking, isTied) when every level of the cascade ties exactly', () => {
    const result = computeGlobalRanking([
      candidate({ userId: 'a', points: 10, firstEventDate: new Date('2026-01-01') }),
      candidate({ userId: 'b', points: 10, firstEventDate: new Date('2026-01-01') }),
      candidate({ userId: 'c', points: 5 }),
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.userId, r]));
    expect(byId.a.rank).toBe(1);
    expect(byId.b.rank).toBe(1);
    expect(byId.a.isTied).toBe(true);
    expect(byId.b.isTied).toBe(true);
    // Dense ranking: the next distinct group takes rank 2, not 3.
    expect(byId.c.rank).toBe(2);
    expect(byId.c.isTied).toBe(false);
  });

  it('treats a null firstEventDate as "latest" (loses the earliest-wins tiebreaker) rather than crashing', () => {
    const result = computeGlobalRanking([
      candidate({ userId: 'a', points: 10, firstEventDate: null }),
      candidate({ userId: 'b', points: 10, firstEventDate: new Date('2026-01-01') }),
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.userId, r]));
    expect(byId.b.rank).toBe(1);
    expect(byId.a.rank).toBe(2);
  });

  it('returns an empty array for zero candidates', () => {
    expect(computeGlobalRanking([])).toEqual([]);
  });
});
