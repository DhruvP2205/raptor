import { processGlobalRankingRecompute } from './processor';

function soloSubmission(overrides: Partial<any> = {}) {
  return {
    title: 'Project',
    trackIds: [],
    soloUserId: 'user-1',
    soloUser: { id: 'user-1' },
    team: null,
    ...overrides,
  };
}

function teamSubmission(memberIds: string[], overrides: Partial<any> = {}) {
  return {
    title: 'Team Project',
    trackIds: [],
    soloUserId: null,
    soloUser: null,
    team: { name: 'The Bytes', members: memberIds.map((id) => ({ user: { id } })) },
    ...overrides,
  };
}

function makeTx() {
  const created: { entries: any[]; details: any[] } = { entries: [], details: [] };
  return {
    globalRankingSnapshot: {
      updateMany: jest.fn(),
      create: jest.fn((args: any) => Promise.resolve({ id: 'snapshot-1', ...args.data })),
    },
    globalRankingEntry: {
      create: jest.fn((args: any) => {
        const entry = { id: `entry-${created.entries.length + 1}`, ...args.data };
        created.entries.push(entry);
        return Promise.resolve(entry);
      }),
    },
    globalRankingAwardDetail: {
      createMany: jest.fn((args: any) => {
        created.details.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      }),
    },
    __created: created,
  };
}

function makePrisma(opts: {
  pointsConfig?: any[];
  prizes?: any[];
  liveResultVersions?: any[];
  liveVotingVersions?: any[];
  events?: any[];
} = {}) {
  const tx = makeTx();
  return {
    globalPointsConfig: { findMany: jest.fn().mockResolvedValue(opts.pointsConfig ?? []) },
    prize: { findMany: jest.fn().mockResolvedValue(opts.prizes ?? []) },
    publishedResultVersion: { findMany: jest.fn().mockResolvedValue(opts.liveResultVersions ?? []) },
    votingResultVersion: { findMany: jest.fn().mockResolvedValue(opts.liveVotingVersions ?? []) },
    event: { findMany: jest.fn().mockResolvedValue(opts.events ?? []) },
    $transaction: jest.fn((cb: any) => cb(tx)),
    __tx: tx,
  } as any;
}

describe('processGlobalRankingRecompute', () => {
  it('credits every team member the full points and full prizeUsd for a podium win, never split', async () => {
    const prisma = makePrisma({
      prizes: [{ eventId: 'event-1', decidedBy: 'JUDGES', rank: 1, trackId: null, prizeUsd: 500 }],
      liveResultVersions: [
        {
          eventId: 'event-1',
          rankEntries: [
            { rank: 1, submissionId: 'sub-1', displayScore: 95, submission: teamSubmission(['u1', 'u2']) },
          ],
          specialAwardEntries: [],
        },
      ],
    });

    await processGlobalRankingRecompute(prisma, {});

    const entries = prisma.__tx.__created.entries;
    const u1 = entries.find((e: any) => e.userId === 'u1');
    const u2 = entries.find((e: any) => e.userId === 'u2');
    expect(u1.points).toBe(10); // default PODIUM_FIRST
    expect(u2.points).toBe(10);
    expect(u1.prizeUsdTotal).toBe(500);
    expect(u2.prizeUsdTotal).toBe(500); // not split by team size
  });

  it('uses the effective GlobalPointsConfig points instead of the default when a row exists', async () => {
    const prisma = makePrisma({
      pointsConfig: [{ awardKind: 'PODIUM_FIRST', points: 100 }],
      liveResultVersions: [
        { eventId: 'event-1', rankEntries: [{ rank: 1, submissionId: 'sub-1', displayScore: 95, submission: soloSubmission() }], specialAwardEntries: [] },
      ],
    });

    await processGlobalRankingRecompute(prisma, {});

    expect(prisma.__tx.__created.entries[0].points).toBe(100);
  });

  it('both dense-ranked-tied 2nd-place submissions receive full PODIUM_SECOND points, not a split', async () => {
    const prisma = makePrisma({
      liveResultVersions: [
        {
          eventId: 'event-1',
          rankEntries: [
            { rank: 2, submissionId: 'sub-a', displayScore: 80, submission: soloSubmission({ soloUserId: 'user-a', soloUser: { id: 'user-a' } }) },
            { rank: 2, submissionId: 'sub-b', displayScore: 80, submission: soloSubmission({ soloUserId: 'user-b', soloUser: { id: 'user-b' } }) },
          ],
          specialAwardEntries: [],
        },
      ],
    });

    await processGlobalRankingRecompute(prisma, {});

    const entries = prisma.__tx.__created.entries;
    expect(entries.find((e: any) => e.userId === 'user-a').points).toBe(6); // default PODIUM_SECOND
    expect(entries.find((e: any) => e.userId === 'user-b').points).toBe(6);
  });

  it('uses the special-award criterion label, not a generic fallback, and leaves prizeUsd untracked', async () => {
    const prisma = makePrisma({
      liveResultVersions: [
        {
          eventId: 'event-1',
          rankEntries: [],
          specialAwardEntries: [
            { submissionId: 'sub-1', criterion: { label: 'Best Design' }, submission: soloSubmission() },
          ],
        },
      ],
    });

    await processGlobalRankingRecompute(prisma, {});

    const detail = prisma.__tx.__created.details[0];
    expect(detail.awardKind).toBe('SPECIAL_AWARD');
    expect(detail.label).toBe('Best Design');
    expect(detail.prizeUsd).toBeNull();
  });

  it('credits AUDIENCE_CHOICE points only for isSharedWin, isDisqualified: false voting entries', async () => {
    const prisma = makePrisma({
      liveVotingVersions: [
        {
          eventId: 'event-1',
          entries: [
            { submissionId: 'sub-winner', submission: soloSubmission({ soloUserId: 'winner', soloUser: { id: 'winner' } }) },
          ],
        },
      ],
    });
    // The where clause itself (isSharedWin: true, isDisqualified: false) is
    // asserted against the query args — a disqualified/non-winning entry
    // should never even be included in what the mock returns in production.
    await processGlobalRankingRecompute(prisma, {});

    expect(prisma.votingResultVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          entries: expect.objectContaining({ where: { isSharedWin: true, isDisqualified: false } }),
        }),
      }),
    );
    const entries = prisma.__tx.__created.entries;
    expect(entries.find((e: any) => e.userId === 'winner').points).toBe(2); // default AUDIENCE_CHOICE
  });

  it('sums prizeUsd across multiple matching Prize rows (an overall prize plus a track prize)', async () => {
    const prisma = makePrisma({
      prizes: [
        { eventId: 'event-1', decidedBy: 'JUDGES', rank: 1, trackId: null, prizeUsd: 500 },
        { eventId: 'event-1', decidedBy: 'JUDGES', rank: 1, trackId: 'track-1', prizeUsd: 200 },
      ],
      liveResultVersions: [
        {
          eventId: 'event-1',
          rankEntries: [{ rank: 1, submissionId: 'sub-1', displayScore: 95, submission: soloSubmission({ trackIds: ['track-1'] }) }],
          specialAwardEntries: [],
        },
      ],
    });

    await processGlobalRankingRecompute(prisma, {});

    expect(prisma.__tx.__created.entries[0].prizeUsdTotal).toBe(700);
  });

  it('computes eventsCount and the earliest firstEventDate across a person\'s two award-crediting events', async () => {
    const prisma = makePrisma({
      liveResultVersions: [
        {
          eventId: 'event-later',
          rankEntries: [{ rank: 1, submissionId: 'sub-1', displayScore: 90, submission: soloSubmission() }],
          specialAwardEntries: [],
        },
        {
          eventId: 'event-earlier',
          rankEntries: [{ rank: 2, submissionId: 'sub-2', displayScore: 80, submission: soloSubmission() }],
          specialAwardEntries: [],
        },
      ],
      events: [
        { id: 'event-later', eventStartsAt: new Date('2026-06-01') },
        { id: 'event-earlier', eventStartsAt: new Date('2026-01-01') },
      ],
    });

    await processGlobalRankingRecompute(prisma, {});

    const entry = prisma.__tx.__created.entries[0];
    expect(entry.eventsCount).toBe(2);
    expect(entry.firstEventId).toBe('event-earlier');
    expect(entry.firstEventDate).toEqual(new Date('2026-01-01'));
  });

  it('flips the previous current snapshot to isCurrent: false and creates a brand-new one, never mutating old entries', async () => {
    const prisma = makePrisma({
      liveResultVersions: [
        { eventId: 'event-1', rankEntries: [{ rank: 1, submissionId: 'sub-1', displayScore: 90, submission: soloSubmission() }], specialAwardEntries: [] },
      ],
    });

    await processGlobalRankingRecompute(prisma, { triggeredByUserId: 'admin-1', triggerReason: 'manual test' });

    expect(prisma.__tx.globalRankingSnapshot.updateMany).toHaveBeenCalledWith({ where: { isCurrent: true }, data: { isCurrent: false } });
    expect(prisma.__tx.globalRankingSnapshot.create).toHaveBeenCalledWith({
      data: { isCurrent: true, triggeredByUserId: 'admin-1', triggerReason: 'manual test' },
    });
  });

  it('produces no entries at all when nothing is LIVE anywhere', async () => {
    const prisma = makePrisma();

    await processGlobalRankingRecompute(prisma, {});

    expect(prisma.__tx.globalRankingEntry.create).not.toHaveBeenCalled();
    // A snapshot is still created (an empty leaderboard is a real,
    // valid state — not skipped).
    expect(prisma.__tx.globalRankingSnapshot.create).toHaveBeenCalled();
  });
});
