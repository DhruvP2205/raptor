'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { RankGroupCard } from '@/components/ranking/RankGroupCard';
import { getGlobalLeaderboard } from '@/lib/api';
import { groupByRank } from '@/lib/ranking';
import type { LeaderboardPage } from '@raptor/shared';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';

const LIMIT = 20;

export default function LeaderboardPageRoute() {
  const [data, setData] = useState<LeaderboardPage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setData(null);
    getGlobalLeaderboard(page, LIMIT, search).then(setData).catch(setError);
  }, [page, search]);

  if (error) {
    return (
      <Container className="py-16">
        <p className="text-sm text-danger">Couldn&apos;t load the leaderboard.</p>
      </Container>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.limit)) : 1;
  const groups = data ? groupByRank(data.entries) : [];

  return (
    <Container className="py-10">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Leaderboard</h1>
        <p className="mt-1 text-sm text-ink-muted">Points earned across every published event on this instance.</p>
      </div>

      <div className="mb-4">
        <Input
          type="search"
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              setSearch(query);
            }
          }}
          className="sm:w-64"
        />
      </div>

      {data === null ? (
        <Card>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : data.snapshotId === null ? (
        <EmptyState title="No results yet — check back once events start publishing." />
      ) : data.entries.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search term." />
      ) : (
        <>
          {/* FRONTEND-MEGA-DOC.md Part 2 — Table→Card: table at md+,
              stacked cards below it, same data, never horizontal
              scroll as the only mobile adaptation. */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-3">Rank</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Points</th>
                  <th className="py-2 pr-3">Breakdown</th>
                  <th className="py-2 pr-3">Events</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group[0].rank}>
                    {group.map((entry, i) => (
                      <tr key={entry.userId} className="border-b border-line last:border-0">
                        <td className="py-2 pr-3 font-mono text-ink-muted">
                          {i === 0 ? (entry.isTied ? `=${entry.rank}` : entry.rank) : ''}
                        </td>
                        <td className="py-2 pr-3">
                          <Link href={`/users/${entry.userId}`} className="flex items-center gap-2 hover:text-accent">
                            <Avatar name={entry.displayName} id={entry.userId} size="small" />
                            <span className="text-ink">{entry.displayName}</span>
                          </Link>
                        </td>
                        <td className="py-2 pr-3 font-medium text-ink">{entry.points}</td>
                        <td className="py-2 pr-3 text-xs text-ink-muted">
                          {entry.firstsCount > 0 && <span className="mr-2">1st ×{entry.firstsCount}</span>}
                          {entry.secondsCount > 0 && <span className="mr-2">2nd ×{entry.secondsCount}</span>}
                          {entry.thirdsCount > 0 && <span>3rd ×{entry.thirdsCount}</span>}
                        </td>
                        <td className="py-2 pr-3 text-ink-muted">{entry.eventsCount}</td>
                      </tr>
                    ))}
                    {group.length > 1 && (
                      <tr key={`${group[0].rank}-tie-note`} className="border-b border-line last:border-0">
                        <td colSpan={5} className="pb-2 pl-1 text-xs text-ink-faint">
                          <Badge tone="neutral">Tied — sharing this position.</Badge>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="flex flex-col gap-3 md:hidden">
            {groups.map((group) => (
              <RankGroupCard key={group[0].rank} group={group} />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-ink-muted">
              Page {data.page} of {totalPages}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
    </Container>
  );
}
