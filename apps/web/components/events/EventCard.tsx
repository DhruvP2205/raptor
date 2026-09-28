import { Card } from '@/components/ui/Card';
import { resolveMediaUrl } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { PublicEvent } from '@raptor/shared';
import Link from 'next/link';
import { PhaseBadge } from './PhaseBadge';

function PosterPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="flex h-full w-full items-center justify-center bg-ink">
      <span className="font-display text-3xl text-white/25">{initial}</span>
    </div>
  );
}

export function EventCard({ event }: { event: PublicEvent }) {
  const poster = resolveMediaUrl(event.posterUrl);
  return (
    <Link href={`/events/${event.slug}`} className="block">
      <Card className="flex h-full flex-col gap-0 overflow-hidden p-0 transition-colors hover:border-ink-faint">
        <div className="aspect-[16/9] w-full overflow-hidden bg-paper-raised">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" className="h-full w-full object-cover" />
          ) : (
            <PosterPlaceholder name={event.name} />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-base text-ink">{event.name}</h2>
          </div>
          <PhaseBadge phase={event.phase} />
          {event.description && (
            <p className="line-clamp-2 text-sm text-ink-muted">{event.description}</p>
          )}
          <p className="mt-auto pt-2 font-mono text-xs text-ink-faint">
            Starts {formatDate(event.eventStartsAt)}
          </p>
        </div>
      </Card>
    </Link>
  );
}
