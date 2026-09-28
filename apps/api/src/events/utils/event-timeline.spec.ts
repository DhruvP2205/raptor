import { BadRequestException } from '@nestjs/common';
import {
  validateTimelineEdit,
  validateTimelineOrdering,
  type EventTimeline,
} from './event-timeline';

function validTimeline(): EventTimeline {
  const base = Date.UTC(2027, 0, 1);
  const day = 24 * 60 * 60 * 1000;
  return {
    registrationOpensAt: new Date(base),
    registrationClosesAt: new Date(base + day),
    eventStartsAt: new Date(base + day), // equal to registrationClosesAt — allowed (<=)
    submissionsOpenAt: new Date(base + 2 * day),
    submissionsCloseAt: new Date(base + 3 * day),
    eventEndsAt: new Date(base + 3 * day), // equal to submissionsCloseAt — allowed (<=)
    judgingClosesAt: new Date(base + 4 * day),
    resultsAnnounceAt: new Date(base + 4 * day), // equal to judgingClosesAt — allowed (<=)
    votingOpensAt: new Date(base + 5 * day),
    votingClosesAt: new Date(base + 6 * day),
    votingWinnerAnnounceAt: new Date(base + 7 * day),
    eventClosedAt: new Date(base + 8 * day),
  };
}

describe('validateTimelineOrdering', () => {
  it('accepts a fully valid, strictly-ordered timeline', () => {
    expect(() => validateTimelineOrdering(validTimeline())).not.toThrow();
  });

  it('allows registrationClosesAt to equal eventStartsAt (the one documented <=)', () => {
    const t = validTimeline();
    t.eventStartsAt = t.registrationClosesAt;
    expect(() => validateTimelineOrdering(t)).not.toThrow();
  });

  it('allows submissionsCloseAt to equal eventEndsAt (the other documented <=)', () => {
    const t = validTimeline();
    t.eventEndsAt = t.submissionsCloseAt;
    expect(() => validateTimelineOrdering(t)).not.toThrow();
  });

  it('allows judgingClosesAt to equal resultsAnnounceAt (Module 8\'s documented <=, zero-gap results)', () => {
    const t = validTimeline();
    t.resultsAnnounceAt = t.judgingClosesAt;
    expect(() => validateTimelineOrdering(t)).not.toThrow();
  });

  it('rejects eventEndsAt equal to judgingClosesAt (strict <, not <=)', () => {
    const t = validTimeline();
    t.judgingClosesAt = t.eventEndsAt;
    expect(() => validateTimelineOrdering(t)).toThrow(BadRequestException);
  });

  it('rejects registrationOpensAt equal to registrationClosesAt (strict <, not <=)', () => {
    const t = validTimeline();
    t.registrationClosesAt = t.registrationOpensAt;
    expect(() => validateTimelineOrdering(t)).toThrow(BadRequestException);
  });

  it('rejects an out-of-order pair and names the specific fields violated', () => {
    const t = validTimeline();
    t.votingOpensAt = t.votingClosesAt; // must be strictly before, not equal
    try {
      validateTimelineOrdering(t);
      fail('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as any).response.fields).toEqual(['votingOpensAt', 'votingClosesAt']);
    }
  });

  it('rejects votingWinnerAnnounceAt equal to eventClosedAt (Module 11\'s strict <)', () => {
    const t = validTimeline();
    t.eventClosedAt = t.votingWinnerAnnounceAt;
    expect(() => validateTimelineOrdering(t)).toThrow(BadRequestException);
  });

  it('rejects a timeline that is reversed at any single point in the chain', () => {
    const t = validTimeline();
    t.eventEndsAt = new Date(t.registrationOpensAt.getTime() - 1);
    expect(() => validateTimelineOrdering(t)).toThrow(BadRequestException);
  });
});

describe('validateTimelineEdit (PUBLISHED-only rules)', () => {
  it('allows extending a not-yet-passed field to a later value', () => {
    const current = validTimeline();
    const future = new Date(current.votingWinnerAnnounceAt.getTime() + 1000 * 60 * 60 * 24);
    expect(() =>
      validateTimelineEdit(current, { votingWinnerAnnounceAt: future }),
    ).not.toThrow();
  });

  it('rejects moving a not-yet-passed field earlier than its current value', () => {
    const current = validTimeline();
    const earlier = new Date(current.votingWinnerAnnounceAt.getTime() - 1000);
    expect(() =>
      validateTimelineEdit(current, { votingWinnerAnnounceAt: earlier }),
    ).toThrow(BadRequestException);
  });

  it('rejects editing a field at all once its own boundary has passed', () => {
    const current = validTimeline();
    current.registrationOpensAt = new Date(Date.now() - 1000 * 60 * 60 * 24); // in the past relative to real now()
    const anyNewValue = new Date(Date.now() + 1000 * 60 * 60 * 24);
    expect(() =>
      validateTimelineEdit(current, { registrationOpensAt: anyNewValue }),
    ).toThrow(BadRequestException);
  });

  it('ignores fields not present in the proposed edit', () => {
    const current = validTimeline();
    expect(() => validateTimelineEdit(current, {})).not.toThrow();
  });
});
