import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/format';
import type { PublicEvent } from '@raptor/shared';
import Link from 'next/link';
import { PhaseBadge } from './PhaseBadge';

export function EventCard({ event }: { event: PublicEvent }) {
  return (
    <Link href={`/events/${event.slug}`} className="block">
      <Card className="flex h-full flex-col gap-3 transition-colors hover:border-ink-faint">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg text-ink">{event.name}</h2>
          <PhaseBadge phase={event.phase} />
        </div>
        {event.description && (
          <p className="line-clamp-2 text-sm text-ink-muted">{event.description}</p>
        )}
        <p className="mt-auto font-mono text-xs text-ink-faint">
          Starts {formatDate(event.eventStartsAt)}
        </p>
      </Card>
    </Link>
  );
}
