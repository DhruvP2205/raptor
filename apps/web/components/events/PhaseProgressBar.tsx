import { PHASE_LABELS } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { EventPhase } from '@raptor/shared';

// FRONTEND-MEGA-DOC.md Part 2 — "6-segment lifecycle indicator,
// reused on event cards, event detail, and the timeline view." The
// backend's real EventPhase has 12 values; grouped into the 6 stages
// of the pipeline a participant actually experiences. Voting is a
// real stage here even though not every event uses it — an event
// that skips straight from Results to Complete just never lights that
// segment, same as any other phase an organizer didn't configure.
const STAGE_ORDER = ['registration', 'building', 'judging', 'results', 'voting', 'complete'] as const;
type Stage = (typeof STAGE_ORDER)[number];

const PHASE_TO_STAGE: Record<EventPhase, Stage> = {
  NOT_STARTED: 'registration',
  REGISTRATION_OPEN: 'registration',
  REGISTRATION_CLOSED: 'registration',
  IN_PROGRESS: 'building',
  SUBMISSIONS_OPEN: 'building',
  SUBMISSIONS_CLOSED: 'building',
  JUDGING: 'judging',
  JUDGING_CLOSED: 'judging',
  RESULTS_ANNOUNCED: 'results',
  VOTING_OPEN: 'voting',
  VOTING_CLOSED: 'voting',
  VOTING_WINNER_ANNOUNCED: 'complete',
};

export function PhaseProgressBar({ phase }: { phase: EventPhase | null }) {
  if (!phase) return null;
  const currentStage = PHASE_TO_STAGE[phase];
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  return (
    <div>
      <div className="flex gap-1" role="img" aria-label={`Event stage: ${PHASE_LABELS[phase]}`}>
        {STAGE_ORDER.map((stage, i) => (
          <div
            key={stage}
            className={cn('h-1.5 flex-1 rounded-full', i <= currentIndex ? 'bg-accent' : 'bg-line')}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{PHASE_LABELS[phase]}</p>
    </div>
  );
}
