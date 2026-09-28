import type { EventPhase } from '@raptor/shared';

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

// Matches Module 3's phase enum (apps/api/src/events/utils/event-phase.ts)
// — labels only, no behavior. GLOSSARY.md "Status vs. Phase": phase is
// the computed clock-position, distinct from the organizer-set status.
export const PHASE_LABELS: Record<EventPhase, string> = {
  NOT_STARTED: 'Coming soon',
  REGISTRATION_OPEN: 'Registration open',
  REGISTRATION_CLOSED: 'Registration closed',
  IN_PROGRESS: 'Event in progress',
  SUBMISSIONS_OPEN: 'Submissions open',
  SUBMISSIONS_CLOSED: 'Submissions closed',
  JUDGING: 'Judging',
  RESULTS_ANNOUNCED: 'Results announced',
  VOTING_OPEN: 'Voting open',
  VOTING_CLOSED: 'Voting closed',
  VOTING_WINNER_ANNOUNCED: 'Winners announced',
};

export function toDatetimeLocalValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string {
  if (!value) return '';
  return new Date(value).toISOString();
}
