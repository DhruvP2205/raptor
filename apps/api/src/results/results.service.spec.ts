import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResultsService } from './results.service';

function makePrisma() {
  const tx = {
    publishedResultVersion: {
      updateMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: any) => Promise.resolve({ id: `version-${Math.random()}`, ...args.data })),
    },
    rankResultEntry: { createMany: jest.fn() },
    specialAwardResultEntry: { createMany: jest.fn() },
  };
  return {
    event: { findUnique: jest.fn() },
    resultsDraft: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    normalizationRun: { findUnique: jest.fn(), findFirst: jest.fn() },
    normalizedScore: { findMany: jest.fn().mockResolvedValue([]) },
    normalizedJudgeScore: { findMany: jest.fn().mockResolvedValue([]) },
    submission: { findMany: jest.fn().mockResolvedValue([]) },
    rubricCriterion: { findMany: jest.fn().mockResolvedValue([]) },
    score: { findMany: jest.fn().mockResolvedValue([]) },
    publishedResultVersion: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    rankResultEntry: { findMany: jest.fn().mockResolvedValue([]) },
    specialAwardResultEntry: { findMany: jest.fn().mockResolvedValue([]) },
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

const EVENT = { id: 'event-1', resultsAnnounceAt: new Date(Date.now() - 1000) };
const EVENT_BEFORE_ANNOUNCE = { id: 'event-1', resultsAnnounceAt: new Date(Date.now() + 86_400_000) };

describe('ResultsService', () => {
  describe('computeResults (via previewDraft) — gating', () => {
    it('never includes a PENDING_REVIEW or DISQUALIFIED submission in rank results, even with NormalizedScore rows present', async () => {
      const prisma = makePrisma();
      prisma.resultsDraft.findUnique.mockResolvedValue({ id: 'draft-1', eventId: 'event-1', normalizationRunId: 'run-1' });
      prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'event-1' });
      prisma.normalizedScore.findMany.mockResolvedValue([
        { submissionId: 'sub-approved', finalScore: 4.0 },
        { submissionId: 'sub-disqualified', finalScore: 4.9 },
      ]);
      prisma.submission.findMany.mockResolvedValue([
        { id: 'sub-approved', verification: { finalDecision: 'APPROVED' } },
        { id: 'sub-disqualified', verification: { finalDecision: 'DISQUALIFIED' } },
      ]);
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      const result = await service.previewDraft('event-1', 'draft-1');

      const submissionIds = result.rankRows.map((r) => r.submissionId);
      expect(submissionIds).toEqual(['sub-approved']);
      expect(submissionIds).not.toContain('sub-disqualified');
    });

    it('only tallies special-award nominations from COMPLETED judge assignments', async () => {
      const prisma = makePrisma();
      prisma.resultsDraft.findUnique.mockResolvedValue({ id: 'draft-1', eventId: 'event-1', normalizationRunId: 'run-1' });
      prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'event-1' });
      prisma.rubricCriterion.findMany.mockResolvedValue([{ id: 'crit-1', kind: 'SPECIAL_AWARD' }]);
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await service.previewDraft('event-1', 'draft-1');

      expect(prisma.score.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            criterionId: 'crit-1',
            value: 1,
            judgeAssignment: { status: 'COMPLETED' },
          }),
        }),
      );
    });

    it('404s for a normalization run belonging to a different event', async () => {
      const prisma = makePrisma();
      prisma.resultsDraft.findUnique.mockResolvedValue({ id: 'draft-1', eventId: 'event-1', normalizationRunId: 'run-1' });
      prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'OTHER_EVENT' });
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await expect(service.previewDraft('event-1', 'draft-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getPublicResults / maybeAutoPublish', () => {
    it('reveals nothing when EventPhase could be RESULTS_ANNOUNCED but zero LIVE version exists', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT); // resultsAnnounceAt already passed
      prisma.resultsDraft.findFirst.mockResolvedValue(null); // no AUTO+READY draft either
      prisma.publishedResultVersion.findFirst.mockResolvedValue(null);
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      const result = await service.getPublicResults('event-1');
      expect(result).toBeNull();
    });

    it('does not auto-publish before resultsAnnounceAt, even with a READY AUTO draft', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BEFORE_ANNOUNCE);
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await service.getPublicResults('event-1');

      expect(prisma.resultsDraft.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not auto-publish an IN_PROGRESS draft even after resultsAnnounceAt has passed', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.publishedResultVersion.findFirst.mockResolvedValueOnce(null); // no live yet, for the "alreadyLive" check
      prisma.resultsDraft.findFirst.mockResolvedValue(null); // the query itself only ever looks for READY, so an IN_PROGRESS one is invisible to it
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await service.getPublicResults('event-1');

      expect(prisma.resultsDraft.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: 'event-1', publishMode: 'AUTO', draftStatus: 'READY' } }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('never auto-publishes a MANUAL-mode draft, even after resultsAnnounceAt, even if marked READY', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.publishedResultVersion.findFirst.mockResolvedValueOnce(null);
      // The query itself filters publishMode: 'AUTO' — a MANUAL/READY
      // draft is structurally excluded from ever being returned here.
      prisma.resultsDraft.findFirst.mockResolvedValue(null);
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await service.getPublicResults('event-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('auto-publishes a READY AUTO draft once resultsAnnounceAt has passed', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.publishedResultVersion.findFirst.mockResolvedValueOnce(null); // alreadyLive check
      prisma.resultsDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        eventId: 'event-1',
        normalizationRunId: 'run-1',
        createdByUserId: 'organizer-1',
        publishMode: 'AUTO',
        draftStatus: 'READY',
      });
      prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'event-1' });
      const audit = makeAudit();
      const service = new ResultsService(prisma, audit as any, makeGlobalRankingQueue() as any);

      await service.getPublicResults('event-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.__tx.publishedResultVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ publishedByUserId: 'organizer-1', resultsDraftId: 'draft-1' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith('organizer-1', 'RESULTS_AUTO_PUBLISHED', expect.anything());
    });

    it('does not re-publish once a LIVE version already exists', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.publishedResultVersion.findFirst.mockResolvedValueOnce({ id: 'v1', status: 'LIVE' });
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await service.getPublicResults('event-1');

      expect(prisma.resultsDraft.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('unpublish', () => {
    it('rejects unpublishing a version that is not currently LIVE', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'SUPERSEDED' });
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await expect(service.unpublish('event-1', 'v1', 'organizer-1', 'went live by mistake')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('writes an AuditLog entry with the reason on success', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'LIVE' });
      prisma.publishedResultVersion.update.mockResolvedValue({ id: 'v1', status: 'UNPUBLISHED' });
      const audit = makeAudit();
      const service = new ResultsService(prisma, audit as any, makeGlobalRankingQueue() as any);

      await service.unpublish('event-1', 'v1', 'organizer-1', 'went live by mistake');

      expect(audit.record).toHaveBeenCalledWith('organizer-1', 'RESULTS_UNPUBLISHED', {
        eventId: 'event-1',
        versionId: 'v1',
        reason: 'went live by mistake',
      });
    });
  });

  describe('createCorrection', () => {
    it('rejects correcting a version that is not the current LIVE one', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'SUPERSEDED' });
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await expect(
        service.createCorrection('event-1', 'v1', 'organizer-1', {
          type: 'DISQUALIFY',
          submissionId: 'sub-1',
          reason: 'cheating found',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a new version and never mutates the previous one in place', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'LIVE', versionNumber: 1 });
      prisma.rankResultEntry.findMany.mockResolvedValue([
        { submissionId: 'sub-1', rank: 1, displayScore: 5, isScoreOverridden: false, isDisqualified: false },
        { submissionId: 'sub-2', rank: 2, displayScore: 4, isScoreOverridden: false, isDisqualified: false },
      ]);
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await service.createCorrection('event-1', 'v1', 'organizer-1', {
        type: 'DISQUALIFY',
        submissionId: 'sub-1',
        reason: 'cheating found',
      } as any);

      // The old version row itself is never touched with .update() —
      // only superseded via the bulk updateMany inside persistNewVersion,
      // and a brand new version row is created.
      expect(prisma.publishedResultVersion.update).not.toHaveBeenCalled();
      expect(prisma.__tx.publishedResultVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: 'event-1', status: 'LIVE' } }),
      );
      expect(prisma.__tx.publishedResultVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ correctionReason: 'cheating found' }) }),
      );
      const rankRows = prisma.__tx.rankResultEntry.createMany.mock.calls[0][0].data;
      expect(rankRows.find((r: any) => r.submissionId === 'sub-1').isDisqualified).toBe(true);
      expect(rankRows.find((r: any) => r.submissionId === 'sub-2').isDisqualified).toBe(false);
    });

    it('applies a REORDER correction to only the targeted submission', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'LIVE', versionNumber: 1 });
      prisma.rankResultEntry.findMany.mockResolvedValue([
        { submissionId: 'sub-1', rank: 1, displayScore: 5, isScoreOverridden: false, isDisqualified: false },
        { submissionId: 'sub-2', rank: 2, displayScore: 4, isScoreOverridden: false, isDisqualified: false },
      ]);
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await service.createCorrection('event-1', 'v1', 'organizer-1', {
        type: 'REORDER',
        submissionId: 'sub-2',
        newRank: 1,
        reason: 'manual reorder',
      } as any);

      const rankRows = prisma.__tx.rankResultEntry.createMany.mock.calls[0][0].data;
      expect(rankRows.find((r: any) => r.submissionId === 'sub-2').rank).toBe(1);
      expect(rankRows.find((r: any) => r.submissionId === 'sub-1').rank).toBe(1); // untouched
    });

    it('applies a SCORE_OVERRIDE correction and flags isScoreOverridden', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'LIVE', versionNumber: 1 });
      prisma.rankResultEntry.findMany.mockResolvedValue([
        { submissionId: 'sub-1', rank: 1, displayScore: 5, isScoreOverridden: false, isDisqualified: false },
      ]);
      const service = new ResultsService(prisma, makeAudit() as any, makeGlobalRankingQueue() as any);

      await service.createCorrection('event-1', 'v1', 'organizer-1', {
        type: 'SCORE_OVERRIDE',
        submissionId: 'sub-1',
        displayScore: 3.5,
        reason: 'manual override after review',
      } as any);

      const rankRows = prisma.__tx.rankResultEntry.createMany.mock.calls[0][0].data;
      expect(rankRows[0].displayScore).toBe(3.5);
      expect(rankRows[0].isScoreOverridden).toBe(true);
    });

    it('writes a complete AuditLog entry for the correction', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findUnique.mockResolvedValue({ id: 'v1', eventId: 'event-1', status: 'LIVE', versionNumber: 1 });
      prisma.rankResultEntry.findMany.mockResolvedValue([]);
      const audit = makeAudit();
      const service = new ResultsService(prisma, audit as any, makeGlobalRankingQueue() as any);

      await service.createCorrection('event-1', 'v1', 'organizer-1', {
        type: 'DISQUALIFY',
        submissionId: 'sub-1',
        reason: 'cheating found',
      } as any);

      expect(audit.record).toHaveBeenCalledWith(
        'organizer-1',
        'RESULTS_CORRECTED',
        expect.objectContaining({ type: 'DISQUALIFY', submissionId: 'sub-1', reason: 'cheating found' }),
      );
    });
  });
});
