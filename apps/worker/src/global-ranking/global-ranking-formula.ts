// Module 14 (Global Ranking) — see docs/stages/14-global-ranking.md
// Section 4. Pure function, no I/O. The global tie-break cascade is
// adopted directly from the reference implementation (D153) and is
// deliberately different from any single event's own cascades
// (results-formula.ts) — it operates across a person's entire platform
// history, not within one event.
export interface GlobalRankCandidate {
  userId: string;
  points: number;
  firstsCount: number;
  secondsCount: number;
  thirdsCount: number;
  eventsCount: number;
  // null if this person has zero award-crediting events (shouldn't
  // happen in practice — every candidate here earned at least one
  // award — but modeled as nullable rather than assumed).
  firstEventDate: Date | null;
}

export interface GlobalRankResult {
  userId: string;
  rank: number;
  isTied: boolean;
}

// points -> firsts -> seconds -> thirds -> events entered -> earliest
// first-event date -> shared position (dense ranking). A true, complete
// tie after all six levels shares the position — never a coin-flip
// ordering (Section 4, step 7).
export function computeGlobalRanking(candidates: GlobalRankCandidate[]): GlobalRankResult[] {
  if (candidates.length === 0) return [];

  const sameGroup = (a: GlobalRankCandidate, b: GlobalRankCandidate) =>
    a.points === b.points &&
    a.firstsCount === b.firstsCount &&
    a.secondsCount === b.secondsCount &&
    a.thirdsCount === b.thirdsCount &&
    a.eventsCount === b.eventsCount &&
    (a.firstEventDate?.getTime() ?? null) === (b.firstEventDate?.getTime() ?? null);

  const sorted = [...candidates].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.firstsCount !== b.firstsCount) return b.firstsCount - a.firstsCount;
    if (a.secondsCount !== b.secondsCount) return b.secondsCount - a.secondsCount;
    if (a.thirdsCount !== b.thirdsCount) return b.thirdsCount - a.thirdsCount;
    if (a.eventsCount !== b.eventsCount) return b.eventsCount - a.eventsCount;
    const aTime = a.firstEventDate?.getTime() ?? Infinity;
    const bTime = b.firstEventDate?.getTime() ?? Infinity;
    if (aTime !== bTime) return aTime - bTime; // earliest wins
    return 0;
  });

  const rows: { userId: string; rank: number }[] = [];
  let rank = 0;
  let prev: GlobalRankCandidate | null = null;
  for (const c of sorted) {
    if (prev === null || !sameGroup(c, prev)) {
      rank += 1;
    }
    rows.push({ userId: c.userId, rank });
    prev = c;
  }

  const countByRank = new Map<number, number>();
  for (const r of rows) {
    countByRank.set(r.rank, (countByRank.get(r.rank) ?? 0) + 1);
  }
  return rows.map((r) => ({ ...r, isTied: (countByRank.get(r.rank) ?? 0) > 1 }));
}
