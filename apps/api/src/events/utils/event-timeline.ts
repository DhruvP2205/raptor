import { BadRequestException } from '@nestjs/common';

// Section 3.3, docs/stages/03-event-management.md.
export interface EventTimeline {
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  eventStartsAt: Date;
  submissionsOpenAt: Date;
  submissionsCloseAt: Date;
  eventEndsAt: Date;
  judgingClosesAt: Date;
  resultsAnnounceAt: Date;
  votingOpensAt: Date;
  votingClosesAt: Date;
  votingWinnerAnnounceAt: Date;
  eventClosedAt: Date;
}

export const TIMELINE_FIELDS: (keyof EventTimeline)[] = [
  'registrationOpensAt',
  'registrationClosesAt',
  'eventStartsAt',
  'submissionsOpenAt',
  'submissionsCloseAt',
  'eventEndsAt',
  'judgingClosesAt',
  'resultsAnnounceAt',
  'votingOpensAt',
  'votingClosesAt',
  'votingWinnerAnnounceAt',
  'eventClosedAt',
];

// registrationOpensAt < registrationClosesAt <= eventStartsAt
//   < submissionsOpenAt < submissionsCloseAt <= eventEndsAt
//   < judgingClosesAt <= resultsAnnounceAt < votingOpensAt
//   < votingClosesAt < votingWinnerAnnounceAt < eventClosedAt
// Three deliberate <= (not <): registrationClosesAt/eventStartsAt and
// submissionsCloseAt/eventEndsAt are allowed to coincide, and so is
// judgingClosesAt/resultsAnnounceAt (Module 8, docs/stages/08-rubric-
// and-scoring.md Section 7 — an organizer can announce results the
// instant judging closes, zero gap) — everything else must be
// strictly ordered. votingWinnerAnnounceAt < eventClosedAt (Module 11,
// D49) is strict: eventClosedAt is the upper bound of the
// voting-round-restart window (Section 7, docs/stages/11-voting.md),
// which only makes sense as a real window after the winner has
// actually been announced.
const ORDERING_CHAIN: [keyof EventTimeline, '<' | '<=', keyof EventTimeline][] = [
  ['registrationOpensAt', '<', 'registrationClosesAt'],
  ['registrationClosesAt', '<=', 'eventStartsAt'],
  ['eventStartsAt', '<', 'submissionsOpenAt'],
  ['submissionsOpenAt', '<', 'submissionsCloseAt'],
  ['submissionsCloseAt', '<=', 'eventEndsAt'],
  ['eventEndsAt', '<', 'judgingClosesAt'],
  ['judgingClosesAt', '<=', 'resultsAnnounceAt'],
  ['resultsAnnounceAt', '<', 'votingOpensAt'],
  ['votingOpensAt', '<', 'votingClosesAt'],
  ['votingClosesAt', '<', 'votingWinnerAnnounceAt'],
  ['votingWinnerAnnounceAt', '<', 'eventClosedAt'],
];

// Enforced on every create AND every edit (Section 3.3), regardless of
// status — DRAFT included. Rejects with a specific error naming the
// violated pair, never a generic 400.
export function validateTimelineOrdering(timeline: EventTimeline): void {
  for (const [a, op, b] of ORDERING_CHAIN) {
    const va = timeline[a].getTime();
    const vb = timeline[b].getTime();
    const ok = op === '<' ? va < vb : va <= vb;
    if (!ok) {
      throw new BadRequestException({
        code: 'INVALID_TIMELINE_ORDER',
        message: `${a} must be ${op === '<' ? 'strictly before' : 'before or equal to'} ${b}.`,
        fields: [a, b],
      });
    }
  }
}

// PUBLISHED-only editing rules (Section 3.2) — DRAFT has none of this,
// by design ("nobody has registered, submitted, or been invited against
// any of these values yet"). Two rules, checked per field:
//   1. A field whose own boundary has already passed (now() > current
//      value) becomes fully immutable.
//   2. A field that hasn't passed yet can be pushed later, but never
//      pulled earlier than its current value.
// Caller is responsible for re-validating the full ordering chain
// against the merged (current + proposed) result afterward — this only
// checks the two PUBLISHED-specific constraints above.
export function validateTimelineEdit(
  current: EventTimeline,
  proposed: Partial<EventTimeline>,
  now: Date = new Date(),
): void {
  for (const field of TIMELINE_FIELDS) {
    if (!(field in proposed)) continue;
    const currentValue = current[field];
    const newValue = proposed[field]!;

    if (now.getTime() > currentValue.getTime()) {
      throw new BadRequestException({
        code: 'TIMELINE_FIELD_IMMUTABLE',
        message: `${field} can no longer be edited — its phase has already passed.`,
        field,
      });
    }
    if (newValue.getTime() < currentValue.getTime()) {
      throw new BadRequestException({
        code: 'TIMELINE_FIELD_CANNOT_MOVE_EARLIER',
        message: `${field} cannot be moved earlier than its current value.`,
        field,
      });
    }
  }
}
