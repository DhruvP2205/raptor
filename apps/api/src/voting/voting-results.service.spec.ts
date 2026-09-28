import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VotingResultsService } from './voting-results.service';

function makePrisma() {
  const tx = {
    votingResultVersion: {
      updateMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: any) => Promise.resolve({ id: `version-${Math.random()}`, ...args.data })),
    },
    votingResultEntry: { createMany: jest.fn() },
  };
  return {
    votingResultVersion: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    votingResultEntry: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((cb: any) => cb(tx)),
    __tx: tx,
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

function makeGlobalRankingQueue() {
  return { enqueueRecompute: jest.fn() };
}

function makeVoting(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    getEventOrThrow: jest.fn().mockResolvedValue({ id: 'event-1' }),
    getCurrentRound: jest.fn().mockResolvedValue({ id: 'round-1', eventId: 'event-1', roundNumber: 1 }),
    getRoundOrThrow: jest.fn().mockResolvedValue({ id: 'round-1', eventId: 'event-1', roundNumber: 1 }),
    computeTally: jest.fn().mockResolvedValue([
      { submissionId: 's1', voteCount: 3, votePercentage: 60, isSharedWin: false },
      { submissionId: 's2', voteCount: 2, votePercentage: 40, isSharedWin: false },
    ]),
    ...overrides,
  } as any;
}

describe('VotingResultsService', () => {
  describe('publish', () => {
    it('tallies the current round and persists a new LIVE version', async () => {
      const prisma = makePrisma();
      prisma.votingResultVersion.findUnique.mockResolvedValue({
        id: 'version-1',
        eventId: 'event-1',
        entries: [],
      });
      const voting = makeVoting();
      const service = new VotingResultsService(prisma, makeAudit() as any, voting, makeGlobalRankingQueue() as any);

      const result = await service.publish('event-1', 'organizer-1');

      expect(voting.computeTally).toHaveBeenCalledWith('round-1');
      expect(prisma.__tx.votingResultVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'LIVE', votingRoundId: 'round-1' }) }),
      );
      expect(prisma.__tx.votingResultEntry.createMany).toHaveBeenCalled();
      expect(result.id).toBe('version-1');
    });
  });

  describe('getPublicResults (Section 8 — never leaks per-voter data)', () => {
    it('returns null when no LIVE version exists', async () => {
      const prisma = makePrisma();
      prisma.votingResultVersion.findFirst.mockResolvedValue(null);
      const service = new VotingResultsService(prisma, makeAudit() as any, makeVoting(), makeGlobalRankingQueue() as any);

      expect(await service.getPublicResults('event-1')).toBeNull();
    });

    it('excludes disqualified entries and never selects userId anywhere in the query', async () => {
      const prisma = makePrisma();
      prisma.votingResultVersion.findFirst.mockResolvedValue({ id: 'v1', status: 'LIVE', entries: [] });
      const service = new VotingResultsService(prisma, makeAudit() as any, makeVoting(), makeGlobalRankingQueue() as any);

      await service.getPublicResults('event-1');

      const callArgs = prisma.votingResultVersion.findFirst.mock.calls[0][0];
      expect(callArgs.include.entries.where).toEqual({ isDisqualified: false });
      expect(JSON.stringify(callArgs)).not.toMatch(/userId/);
    });
  });

  describe('unpublish', () => {
    it('rejects unpublishing a version that is not currently LIVE', async () => {
      const prisma = makePrisma();
      prisma.votingResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'SUPERSEDED' });
      const service = new VotingResultsService(prisma, makeAudit() as any, makeVoting(), makeGlobalRankingQueue() as any);

      await expect(service.unpublish('event-1', 'v1', 'organizer-1', 'mistake')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s for a version belonging to a different event', async () => {
      const prisma = makePrisma();
      prisma.votingResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'OTHER_EVENT', status: 'LIVE' });
      const service = new VotingResultsService(prisma, makeAudit() as any, makeVoting(), makeGlobalRankingQueue() as any);

      await expect(service.unpublish('event-1', 'v1', 'organizer-1', 'mistake')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createCorrection (Section 9 — reuses Module 10\'s pattern)', () => {
    it('DISQUALIFY marks the entry disqualified without altering its recorded vote count', async () => {
      const prisma = makePrisma();
      prisma.votingResultVersion.findUnique.mockResolvedValueOnce({ id: 'v1', eventId: 'event-1', status: 'LIVE', votingRoundId: 'round-1' });
      prisma.votingResultEntry.findMany.mockResolvedValue([
        { submissionId: 's1', voteCount: 5, votePercentage: 100, isSharedWin: true, isDisqualified: false },
      ]);
      prisma.votingResultVersion.findUnique.mockResolvedValueOnce({ id: 'v2', eventId: 'event-1', entries: [] });
      const service = new VotingResultsService(prisma, makeAudit() as any, makeVoting(), makeGlobalRankingQueue() as any);

      await service.createCorrection('event-1', 'v1', 'organizer-1', {
        type: 'DISQUALIFY',
        submissionId: 's1',
        reason: 'rules violation',
      });

      const createdEntries = prisma.__tx.votingResultEntry.createMany.mock.calls[0][0].data;
      expect(createdEntries).toEqual([
        expect.objectContaining({ submissionId: 's1', voteCount: 5, isDisqualified: true }),
      ]);
    });

    it('rejects REASSIGN_CREDIT when the target submission already has its own entry in this version', async () => {
      const prisma = makePrisma();
      prisma.votingResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'LIVE', votingRoundId: 'round-1' });
      prisma.votingResultEntry.findMany.mockResolvedValue([
        { submissionId: 's1', voteCount: 5, votePercentage: 60, isSharedWin: false, isDisqualified: false },
        { submissionId: 's2', voteCount: 3, votePercentage: 40, isSharedWin: false, isDisqualified: false },
      ]);
      const service = new VotingResultsService(prisma, makeAudit() as any, makeVoting(), makeGlobalRankingQueue() as any);

      await expect(
        service.createCorrection('event-1', 'v1', 'organizer-1', {
          type: 'REASSIGN_CREDIT',
          submissionId: 's1',
          newSubmissionId: 's2',
          reason: 'duplicate project merge',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
