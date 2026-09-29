import { Card } from '@/components/ui/Card';
import { resolveMediaUrl } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { PublicEvent } from '@raptor/shared';
import Link from 'next/link';
import { PhaseProgressBar } from './PhaseProgressBar';

// The single most decision-relevant date for whatever phase the event
// is actually in right now — "when do I need to act by," not just
// "when does it start." Matches how real hackathon listings (Devpost,
// Unstop) surface a deadline on every card, not a fixed field.
function deadlineLabel(event: PublicEvent): string {
  switch (event.phase) {
    case 'NOT_STARTED':
      return `Registration opens ${formatDate(event.registrationOpensAt)}`;
    case 'REGISTRATION_OPEN':
      return `Registration closes ${formatDate(event.registrationClosesAt)}`;
    case 'REGISTRATION_CLOSED':
    case 'IN_PROGRESS':
      return `Submissions open ${formatDate(event.submissionsOpenAt)}`;
    case 'SUBMISSIONS_OPEN':
      return `Submissions close ${formatDate(event.submissionsCloseAt)}`;
    case 'SUBMISSIONS_CLOSED':
    case 'JUDGING':
      return `Results ${formatDate(event.resultsAnnounceAt)}`;
    default:
      return `Started ${formatDate(event.eventStartsAt)}`;
  }
}

// Deterministic (by name, not random) so a card doesn't change color on
// every re-render — a grid of no-poster events still reads as varied
// rather than a wall of identical placeholders. Restricted to the
// system's own restrained palette (DESIGN-SYSTEM.md 3 has no separate
// decorative-hue set) rather than the dropped violet/teal/rose trio.
const PLACEHOLDER_TONES = ['bg-ink', 'bg-accent', 'bg-ink-muted', 'bg-success', 'bg-warning'];

function PosterPlaceholder({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const tone = PLACEHOLDER_TONES[hash % PLACEHOLDER_TONES.length];
  return (
    <div className={`flex h-full w-full items-center justify-center ${tone}`}>
      <span className="font-display text-3xl text-white/30">{initial}</span>
    </div>
  );
}

export function EventCard({ event }: { event: PublicEvent }) {
  const poster = resolveMediaUrl(event.posterUrl);
  return (
    <Link href={`/events/${event.slug}`} className="block">
      <Card className="flex h-full flex-col gap-0 overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-accent-to hover:shadow-raised">
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
          <PhaseProgressBar phase={event.phase} />
          {event.description && (
            <p className="line-clamp-2 text-sm text-ink-muted">{event.description}</p>
          )}
          <p className="mt-auto pt-2 font-mono text-xs text-ink-faint">{deadlineLabel(event)}</p>
        </div>
      </Card>
    </Link>
  );
}
