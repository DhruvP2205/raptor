import { Badge } from '@/components/ui/Badge';
import { PHASE_LABELS } from '@/lib/format';
import type { EventPhase, EventStatus } from '@raptor/shared';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const PHASE_TONE: Record<EventPhase, Tone> = {
  NOT_STARTED: 'neutral',
  REGISTRATION_OPEN: 'success',
  REGISTRATION_CLOSED: 'neutral',
  IN_PROGRESS: 'accent',
  SUBMISSIONS_OPEN: 'accent',
  SUBMISSIONS_CLOSED: 'warning',
  JUDGING: 'warning',
  RESULTS_ANNOUNCED: 'success',
  VOTING_OPEN: 'accent',
  VOTING_CLOSED: 'neutral',
  VOTING_WINNER_ANNOUNCED: 'success',
};

export function PhaseBadge({ phase }: { phase: EventPhase | null }) {
  if (!phase) return null;
  return <Badge tone={PHASE_TONE[phase]}>{PHASE_LABELS[phase]}</Badge>;
}

const STATUS_TONE: Record<EventStatus, Tone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  ARCHIVED: 'warning',
  DELETED: 'danger',
};

// Status (organizer-set) vs. phase (computed clock position) are
// distinct axes — GLOSSARY.md "Status vs. Phase". Shown together on
// organizer-facing views, phase alone on the public event card.
export function StatusBadge({ status }: { status: EventStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}
