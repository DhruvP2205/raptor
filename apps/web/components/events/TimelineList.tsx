import { formatDateTime } from '@/lib/format';
import type { PublicEvent } from '@raptor/shared';

const TIMELINE_FIELDS: { key: keyof PublicEvent; label: string }[] = [
  { key: 'registrationOpensAt', label: 'Registration opens' },
  { key: 'registrationClosesAt', label: 'Registration closes' },
  { key: 'eventStartsAt', label: 'Event starts' },
  { key: 'submissionsOpenAt', label: 'Submissions open' },
  { key: 'submissionsCloseAt', label: 'Submissions close' },
  { key: 'eventEndsAt', label: 'Event ends' },
  { key: 'resultsAnnounceAt', label: 'Results announced' },
  { key: 'votingOpensAt', label: 'Voting opens' },
  { key: 'votingClosesAt', label: 'Voting closes' },
  { key: 'votingWinnerAnnounceAt', label: 'Winners announced' },
];

export function TimelineList({ event }: { event: PublicEvent }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {TIMELINE_FIELDS.map(({ key, label }) => (
        <div key={key} className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="font-mono text-xs text-ink">{formatDateTime(event[key] as string)}</dd>
        </div>
      ))}
    </dl>
  );
}
