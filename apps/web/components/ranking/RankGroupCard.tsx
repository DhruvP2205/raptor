import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { LeaderboardEntry } from '@raptor/shared';
import Link from 'next/link';

// One tied-rank group, rendered as a card. Extracted from the full
// leaderboard page's mobile view so the homepage teaser
// (docs/design/home-page.md Section 2.6) uses the exact same tie
// rendering rather than a simplified copy.
export function RankGroupCard({ group }: { group: LeaderboardEntry[] }) {
  return (
    <Card className="flex flex-col gap-3">
      {group.map((entry, i) => (
        <div key={entry.userId} className="flex items-center justify-between gap-3">
          <Link href={`/users/${entry.userId}`} className="flex items-center gap-2">
            <span className="w-8 shrink-0 font-mono text-sm text-ink-muted">
              {i === 0 ? (entry.isTied ? `=${entry.rank}` : entry.rank) : ''}
            </span>
            <Avatar name={entry.displayName} id={entry.userId} size="small" />
            <span className="text-sm text-ink">{entry.displayName}</span>
          </Link>
          <div className="text-right">
            <p className="font-medium text-ink">{entry.points} pts</p>
            <p className="text-xs text-ink-muted">
              {entry.firstsCount > 0 && <span className="mr-1.5">1st ×{entry.firstsCount}</span>}
              {entry.secondsCount > 0 && <span className="mr-1.5">2nd ×{entry.secondsCount}</span>}
              {entry.thirdsCount > 0 && <span>3rd ×{entry.thirdsCount}</span>}
              {entry.firstsCount === 0 && entry.secondsCount === 0 && entry.thirdsCount === 0 && (
                <span>{entry.eventsCount} events</span>
              )}
            </p>
          </div>
        </div>
      ))}
      {group.length > 1 && <Badge tone="neutral">Tied — sharing this position.</Badge>}
    </Card>
  );
}
