import { Card } from '@/components/ui/Card';
import { resolveMediaUrl } from '@/lib/api';
import type { PublicEvent } from '@raptor/shared';
import Link from 'next/link';

// Results/prizes shown here are the event's *defined* Prize structure
// (name + rank), not an actual winner assignment — there's no judging
// /voting data model yet (T2, no stage doc). Labeled "Prizes", never
// "Winner", so this doesn't imply data that doesn't exist.
export function EventResultCard({ event }: { event: PublicEvent }) {
  const poster = resolveMediaUrl(event.posterUrl);
  const prizes = (event.prizes ?? []).slice().sort((a, b) => a.rank - b.rank);

  return (
    <Link href={`/events/${event.slug}`} className="block">
      <Card className="flex h-full flex-col gap-0 overflow-hidden p-0 transition-colors hover:border-ink-faint">
        <div className="aspect-[16/9] w-full overflow-hidden bg-ink">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="font-display text-3xl text-white/25">
                {event.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h2 className="font-display text-base text-ink">{event.name}</h2>
          {prizes.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1">
              {prizes.slice(0, 3).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-xs text-ink-muted">
                  <span>
                    #{p.rank} {p.name}
                  </span>
                  <span className="font-mono text-ink-faint">
                    {p.decidedBy === 'JUDGES' ? 'Judged' : 'Public vote'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-faint">No prizes configured for this event.</p>
          )}
        </div>
      </Card>
    </Link>
  );
}
