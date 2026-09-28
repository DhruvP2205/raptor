import { computeEventPhase } from './event-phase';
import type { EventTimeline } from './event-timeline';

function timeline(): EventTimeline {
  const base = Date.UTC(2027, 0, 1);
  const day = 24 * 60 * 60 * 1000;
  return {
    registrationOpensAt: new Date(base),
    registrationClosesAt: new Date(base + day),
    eventStartsAt: new Date(base + 2 * day),
    submissionsOpenAt: new Date(base + 3 * day),
    submissionsCloseAt: new Date(base + 4 * day),
    eventEndsAt: new Date(base + 5 * day),
    judgingClosesAt: new Date(base + 6 * day),
    resultsAnnounceAt: new Date(base + 7 * day),
    votingOpensAt: new Date(base + 8 * day),
    votingClosesAt: new Date(base + 9 * day),
    votingWinnerAnnounceAt: new Date(base + 10 * day),
    eventClosedAt: new Date(base + 11 * day),
  };
}

// Every boundary below is a fixture timestamp manipulated into past or
// future relative to a fixed `now` — never real wall-clock waiting,
// per CLAUDE.md's testing philosophy.
describe('computeEventPhase', () => {
  it('is null for a DRAFT event regardless of timeline', () => {
    const t = timeline();
    expect(computeEventPhase({ status: 'DRAFT', ...t }, t.eventStartsAt)).toBeNull();
  });

  it('is NOT_STARTED for a PUBLISHED event before registration opens', () => {
    const t = timeline();
    const before = new Date(t.registrationOpensAt.getTime() - 1);
    expect(computeEventPhase({ status: 'PUBLISHED', ...t }, before)).toBe('NOT_STARTED');
  });

  it('resolves each boundary to its own named phase, inclusive of the boundary instant itself', () => {
    const t = timeline();
    const cases: [Date, string][] = [
      [t.registrationOpensAt, 'REGISTRATION_OPEN'],
      [t.registrationClosesAt, 'REGISTRATION_CLOSED'],
      [t.eventStartsAt, 'IN_PROGRESS'],
      [t.submissionsOpenAt, 'SUBMISSIONS_OPEN'],
      [t.submissionsCloseAt, 'SUBMISSIONS_CLOSED'],
      [t.eventEndsAt, 'JUDGING'],
      [t.judgingClosesAt, 'JUDGING_CLOSED'],
      [t.resultsAnnounceAt, 'RESULTS_ANNOUNCED'],
      [t.votingOpensAt, 'VOTING_OPEN'],
      [t.votingClosesAt, 'VOTING_CLOSED'],
      [t.votingWinnerAnnounceAt, 'VOTING_WINNER_ANNOUNCED'],
    ];
    for (const [now, expected] of cases) {
      expect(computeEventPhase({ status: 'PUBLISHED', ...t }, now)).toBe(expected);
    }
  });

  it('resolves to the phase just before a boundary, one millisecond prior', () => {
    const t = timeline();
    const justBefore = new Date(t.eventStartsAt.getTime() - 1);
    expect(computeEventPhase({ status: 'PUBLISHED', ...t }, justBefore)).toBe(
      'REGISTRATION_CLOSED',
    );
  });

  it('stays at the final phase indefinitely after the last boundary', () => {
    const t = timeline();
    const farFuture = new Date(t.votingWinnerAnnounceAt.getTime() + 1000 * 60 * 60 * 24 * 365);
    expect(computeEventPhase({ status: 'PUBLISHED', ...t }, farFuture)).toBe(
      'VOTING_WINNER_ANNOUNCED',
    );
  });

  it('does not introduce a new phase at eventClosedAt — Module 11 never names one; it stays VOTING_WINNER_ANNOUNCED even once eventClosedAt has passed', () => {
    const t = timeline();
    expect(computeEventPhase({ status: 'PUBLISHED', ...t }, t.eventClosedAt)).toBe(
      'VOTING_WINNER_ANNOUNCED',
    );
  });
});
