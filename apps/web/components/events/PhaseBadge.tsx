import { Badge, type Tone } from '@/components/ui/Badge';
import { PHASE_LABELS } from '@/lib/format';
import type { EventPhase, EventStatus } from '@raptor/shared';

// DESIGN-SYSTEM.md 3.2 collapses every status pill to exactly four
// tones — no per-phase rainbow (that was D89's earlier, now-superseded
// call). Mapping follows the doc's own worked examples verbatim:
// "Judging, registration open, voting open" -> live; "Results
// announced ... approved" -> success; "Archived, draft, inactive" ->
// neutral; "disqualified, rejected, error" -> danger.
const PHASE_TONE: Record<EventPhase, Tone> = {
  NOT_STARTED: 'neutral',
  REGISTRATION_OPEN: 'live',
  REGISTRATION_CLOSED: 'neutral',
  IN_PROGRESS: 'live',
  SUBMISSIONS_OPEN: 'live',
  SUBMISSIONS_CLOSED: 'neutral',
  JUDGING: 'live',
  RESULTS_ANNOUNCED: 'success',
  VOTING_OPEN: 'live',
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
  ARCHIVED: 'neutral',
  DELETED: 'danger',
};

// Status (organizer-set) vs. phase (computed clock position) are
// distinct axes — GLOSSARY.md "Status vs. Phase". Shown together on
// organizer-facing views, phase alone on the public event card.
export function StatusBadge({ status }: { status: EventStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}
