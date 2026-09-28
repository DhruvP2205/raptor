import { ExportService } from './export.service';

function makePrisma() {
  return {
    eventMembership: { findMany: jest.fn().mockResolvedValue([]) },
    teamMembership: { findMany: jest.fn().mockResolvedValue([]) },
    team: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findUniqueOrThrow: jest.fn() },
    judgeAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    judgeReliabilityNote: { findMany: jest.fn().mockResolvedValue([]) },
    submission: { findMany: jest.fn().mockResolvedValue([]) },
    track: { findMany: jest.fn().mockResolvedValue([]) },
    publishedResultVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    rankResultEntry: { findMany: jest.fn().mockResolvedValue([]) },
    normalizationRun: { findMany: jest.fn().mockResolvedValue([]) },
    votingResultVersion: { findMany: jest.fn().mockResolvedValue([]) },
    certificate: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('ExportService.exportTeams — Section 4a correction', () => {
  it('sources admin name/email from Team.admin (adminUserId), not a nonexistent TeamMembership.isAdmin field', async () => {
    const prisma = makePrisma();
    prisma.team.findMany.mockResolvedValue([
      {
        name: 'Team Rocket',
        admin: { displayName: 'Jessie', email: 'jessie@example.org' },
        members: [{ user: { email: 'jessie@example.org' } }, { user: { email: 'james@example.org' } }],
        submission: { everSubmitted: true },
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const service = new ExportService(prisma);

    const { rows } = await service.exportTeams('event-1');

    expect(rows[0]).toEqual(['Team Rocket', 'Jessie', 'jessie@example.org', 2, 'jessie@example.org;james@example.org', true, '2026-01-01T00:00:00.000Z']);
  });
});

describe('ExportService.exportScores — Rank gating (Section 7)', () => {
  const baseSubmission = {
    id: 'sub-1',
    title: 'Project X',
    team: { name: 'Team X' },
    soloUser: null,
    trackIds: [],
    judgeAssignments: [
      { status: 'COMPLETED', scores: [{ value: 80, criterion: { kind: 'SCORING' } }] },
    ],
    normalizedScores: [],
    specialAwardResultEntries: [],
  };

  it('leaves Rank blank when no PublishedResultVersion is LIVE yet', async () => {
    const prisma = makePrisma();
    prisma.submission.findMany.mockResolvedValue([baseSubmission]);
    prisma.publishedResultVersion.findFirst.mockResolvedValue(null);
    const service = new ExportService(prisma);

    const { columns, rows } = await service.exportScores('event-1');

    expect(rows[0][columns.indexOf('Rank')]).toBe('');
    expect(prisma.rankResultEntry.findMany).not.toHaveBeenCalled();
  });

  it('populates Rank once a PublishedResultVersion is LIVE', async () => {
    const prisma = makePrisma();
    prisma.submission.findMany.mockResolvedValue([baseSubmission]);
    prisma.publishedResultVersion.findFirst.mockResolvedValue({ id: 'version-1' });
    prisma.rankResultEntry.findMany.mockResolvedValue([{ submissionId: 'sub-1', rank: 2 }]);
    const service = new ExportService(prisma);

    const { columns, rows } = await service.exportScores('event-1');

    expect(rows[0][columns.indexOf('Rank')]).toBe(2);
  });

  it('computes Reviews Completed/Assigned as "completed/total", not just total', async () => {
    const prisma = makePrisma();
    prisma.submission.findMany.mockResolvedValue([
      {
        ...baseSubmission,
        judgeAssignments: [
          { status: 'COMPLETED', scores: [{ value: 80, criterion: { kind: 'SCORING' } }] },
          { status: 'PENDING', scores: [] },
        ],
      },
    ]);
    const service = new ExportService(prisma);

    const { columns, rows } = await service.exportScores('event-1');

    expect(rows[0][columns.indexOf('Reviews Completed/Assigned')]).toBe('1/2');
  });
});

describe('ExportService.exportVotingResults (Section 9)', () => {
  it('produces one row per round from its latest non-retracted version, "Won" mapped straight from isSharedWin', async () => {
    const prisma = makePrisma();
    prisma.votingResultVersion.findMany.mockResolvedValue([
      {
        votingRoundId: 'round-1',
        versionNumber: 1,
        status: 'LIVE',
        votingRound: { roundNumber: 1 },
        entries: [
          {
            isDisqualified: false,
            voteCount: 5,
            votePercentage: 100,
            isSharedWin: true,
            submission: { title: 'Winner Project', team: { name: 'Team W' }, soloUser: null },
          },
        ],
      },
    ]);
    const service = new ExportService(prisma);

    const { columns, rows } = await service.exportVotingResults('event-1');

    expect(rows).toHaveLength(1);
    expect(rows[0][columns.indexOf('Round')]).toBe(1);
    expect(rows[0][columns.indexOf('Won')]).toBe(true);
  });

  it('returns an empty, header-only CSV when no round has a published version yet', async () => {
    const prisma = makePrisma();
    prisma.votingResultVersion.findMany.mockResolvedValue([]);
    const service = new ExportService(prisma);

    const { columns, rows } = await service.exportVotingResults('event-1');

    expect(columns.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(0);
  });

  it('skips a round whose only version was fully retracted (UNPUBLISHED)', async () => {
    const prisma = makePrisma();
    prisma.votingResultVersion.findMany.mockResolvedValue([
      {
        votingRoundId: 'round-1',
        versionNumber: 1,
        status: 'UNPUBLISHED',
        votingRound: { roundNumber: 1 },
        entries: [{ isDisqualified: false, voteCount: 1, votePercentage: 100, isSharedWin: true, submission: { title: 'X', team: null, soloUser: { displayName: 'Solo' } } }],
      },
    ]);
    const service = new ExportService(prisma);

    const { rows } = await service.exportVotingResults('event-1');

    expect(rows).toHaveLength(0);
  });

  it('only ever keeps the latest version per round when multiple exist', async () => {
    const prisma = makePrisma();
    prisma.votingResultVersion.findMany.mockResolvedValue([
      // Ordered by [votingRoundId asc, versionNumber desc] as the query does
      { votingRoundId: 'round-1', versionNumber: 2, status: 'LIVE', votingRound: { roundNumber: 1 }, entries: [{ isDisqualified: false, voteCount: 9, votePercentage: 100, isSharedWin: true, submission: { title: 'Corrected', team: null, soloUser: { displayName: 'S' } } }] },
      { votingRoundId: 'round-1', versionNumber: 1, status: 'SUPERSEDED', votingRound: { roundNumber: 1 }, entries: [{ isDisqualified: false, voteCount: 1, votePercentage: 100, isSharedWin: true, submission: { title: 'Original', team: null, soloUser: { displayName: 'S' } } }] },
    ]);
    const service = new ExportService(prisma);

    const { rows } = await service.exportVotingResults('event-1');

    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe('Corrected');
  });
});

describe('ExportService.exportNormalizationComparison (Section 8)', () => {
  it('returns one row set per run (full history), each with independent dense-ranked raw/normalized columns', async () => {
    const prisma = makePrisma();
    prisma.normalizationRun.findMany.mockResolvedValue([
      {
        runAt: new Date('2026-01-01T00:00:00Z'),
        normalizedScores: [
          { id: 'ns-1', submissionId: 'sub-1', finalScore: 90, submission: { title: 'A', team: { name: 'TA' }, soloUser: null } },
          { id: 'ns-2', submissionId: 'sub-2', finalScore: 70, submission: { title: 'B', team: { name: 'TB' }, soloUser: null } },
        ],
      },
      {
        runAt: new Date('2026-01-02T00:00:00Z'),
        normalizedScores: [
          { id: 'ns-3', submissionId: 'sub-1', finalScore: 60, submission: { title: 'A', team: { name: 'TA' }, soloUser: null } },
        ],
      },
    ]);
    prisma.judgeAssignment.findMany.mockResolvedValue([
      { submissionId: 'sub-1', scores: [{ value: 100, criterion: { kind: 'SCORING' } }] },
      { submissionId: 'sub-2', scores: [{ value: 50, criterion: { kind: 'SCORING' } }] },
    ]);
    const service = new ExportService(prisma);

    const { columns, rows } = await service.exportNormalizationComparison('event-1');

    expect(rows).toHaveLength(3); // 2 from run 1, 1 from run 2 — full history, not just latest
    const run1Rows = rows.filter((r) => r[columns.indexOf('Run Timestamp')] === '2026-01-01T00:00:00.000Z');
    expect(run1Rows).toHaveLength(2);
    // Submission A (normalized 90, raw 100) should rank 1st in both orders within run 1
    const rowA = run1Rows.find((r) => r[columns.indexOf('Title')] === 'A')!;
    expect(rowA[columns.indexOf('Rank (raw order)')]).toBe(1);
    expect(rowA[columns.indexOf('Rank (normalized order)')]).toBe(1);
  });
});
