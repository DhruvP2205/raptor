import type { LeaderboardEntry } from '@raptor/shared';

// docs/design/14-global-ranking.md Section 2 — dense ranking, shared
// positions grouped under one marker. Shared between the full
// leaderboard page and the homepage teaser (docs/design/home-page.md
// Section 2.6: "a shared row that happens to be tied renders exactly
// as it would on the full leaderboard, not a simplified version that
// drops the tie") — one implementation, not two that could drift.
export function groupByRank(entries: LeaderboardEntry[]): LeaderboardEntry[][] {
  const groups: LeaderboardEntry[][] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last[0].rank === entry.rank) last.push(entry);
    else groups.push([entry]);
  }
  return groups;
}
