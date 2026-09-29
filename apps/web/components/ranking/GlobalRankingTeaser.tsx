'use client';

import { RankGroupCard } from './RankGroupCard';
import { getGlobalLeaderboard } from '@/lib/api';
import { groupByRank } from '@/lib/ranking';
import type { LeaderboardPage } from '@raptor/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const TEASER_LIMIT = 5;

// docs/design/home-page.md Section 2.6 — top 3-5 rows, linking to the
// full leaderboard. Section 4: hidden entirely (not an empty-state
// card) when there's no ranking data yet — a leaderboard with nothing
// on it isn't worth a section of its own the way an empty events list
// is.
export function GlobalRankingTeaser() {
  const [data, setData] = useState<LeaderboardPage | null>(null);

  useEffect(() => {
    getGlobalLeaderboard(1, TEASER_LIMIT).then(setData).catch(() => setData(null));
  }, []);

  if (data !== null && data.snapshotId === null) return null;

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-xl text-ink">Global Ranking</h2>
        <Link href="/leaderboard" className="text-sm font-medium text-accent hover:text-accent-hover">
          View full leaderboard →
        </Link>
      </div>
      {data === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-line bg-paper-raised" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupByRank(data.entries).map((group) => (
            <RankGroupCard key={group[0].rank} group={group} />
          ))}
        </div>
      )}
    </section>
  );
}
