import type { EventTimeline } from './event-timeline';

// Section 2.2, docs/stages/03-event-management.md — fully computed,
// never stored, never manually set.
export type EventPhase =
  | 'NOT_STARTED'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'IN_PROGRESS'
  | 'SUBMISSIONS_OPEN'
  | 'SUBMISSIONS_CLOSED'
  | 'JUDGING'
  | 'JUDGING_CLOSED'
  | 'RESULTS_ANNOUNCED'
  | 'VOTING_OPEN'
  | 'VOTING_CLOSED'
  | 'VOTING_WINNER_ANNOUNCED';

// JUDGING_CLOSED — Module 8, docs/stages/08-rubric-and-scoring.md
// Section 7. Runs from judgingClosesAt to resultsAnnounceAt: scores are
// frozen (no more PATCH/submit-review, Section 4.2), normalization/
// organizer review happens, nothing judge-facing is writable anymore.
const PHASE_BOUNDARIES: { field: keyof EventTimeline; phase: EventPhase }[] = [
  { field: 'registrationOpensAt', phase: 'REGISTRATION_OPEN' },
  { field: 'registrationClosesAt', phase: 'REGISTRATION_CLOSED' },
  { field: 'eventStartsAt', phase: 'IN_PROGRESS' },
  { field: 'submissionsOpenAt', phase: 'SUBMISSIONS_OPEN' },
  { field: 'submissionsCloseAt', phase: 'SUBMISSIONS_CLOSED' },
  { field: 'eventEndsAt', phase: 'JUDGING' },
  { field: 'judgingClosesAt', phase: 'JUDGING_CLOSED' },
  { field: 'resultsAnnounceAt', phase: 'RESULTS_ANNOUNCED' },
  { field: 'votingOpensAt', phase: 'VOTING_OPEN' },
  { field: 'votingClosesAt', phase: 'VOTING_CLOSED' },
  { field: 'votingWinnerAnnounceAt', phase: 'VOTING_WINNER_ANNOUNCED' },
];

// NOT_STARTED: a gap-fill not named anywhere in the stage doc's phase
// list, which starts at REGISTRATION_OPEN. The doc explicitly supports
// a PUBLISHED event sitting before registrationOpensAt ("an organizer
// wanting an upcoming event visible for early hype, before registration
// even opens, is a legitimate and supported use case" — Section 8), so
// that window needs *some* value. Reusing NOT_STARTED (the same term
// the doc already uses for a DRAFT event's phase, "NOT_STARTED / null")
// distinguishes it from a DRAFT event (phase: null, never even visible)
// without inventing a new vocabulary term. Flagged as an inference, not
// a literal instruction — see D69 in docs/DECISIONS.md.
export function computeEventPhase(
  event: { status: string } & EventTimeline,
  now: Date = new Date(),
): EventPhase | null {
  if (event.status !== 'PUBLISHED') {
    return null;
  }

  let phase: EventPhase = 'NOT_STARTED';
  for (const boundary of PHASE_BOUNDARIES) {
    if (now.getTime() >= event[boundary.field].getTime()) {
      phase = boundary.phase;
    } else {
      break;
    }
  }
  return phase;
}
