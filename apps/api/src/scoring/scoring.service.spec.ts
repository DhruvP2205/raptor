import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScoringService } from './scoring.service';

function makePrisma() {
  return {
    judgeAssignment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    rubricCriterion: { findMany: jest.fn().mockResolvedValue([]) },
    score: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    judgeReview: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn(), update: jest.fn() },
    scoreRevision: { create: jest.fn() },
    event: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn((ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops())),
  } as any;
}

function makeCalibration() {
  return { recompute: jest.fn() } as any;
}

const ASSIGNMENT = { id: 'assign-1', eventId: 'event-1', judgeId: 'judge-1', submissionId: 'sub-1', completedAt: null };
const FUTURE_EVENT = { id: 'event-1', judgingClosesAt: new Date(Date.now() + 86_400_000) };
const PAST_EVENT = { id: 'event-1', judgingClosesAt: new Date(Date.now() - 86_400_000) };

const SCORING_CRITERION = { id: 'c1', kind: 'SCORING', weightPercent: 100, maxPoints: null, label: 'Quality' };
const BONUS_CRITERION = { id: 'c2', kind: 'BONUS', weightPercent: null, maxPoints: 10, label: 'Bonus' };

describe('ScoringService', () => {
  describe('ownership', () => {
    it('404s for a non-existent assignment', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(null);
      const service = new ScoringService(prisma, makeCalibration());

      await expect(service.getForScoring('assign-1', 'judge-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403s when the caller is not the assigned judge', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      const service = new ScoringService(prisma, makeCalibration());

      await expect(service.getForScoring('assign-1', 'someone-else')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('saveDraft', () => {
    it('saves a partial subset of scores with no completeness requirement', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION]);
      const service = new ScoringService(prisma, makeCalibration());

      await service.saveDraft('assign-1', 'judge-1', { scores: [{ criterionId: 'c1', value: 80 }] });

      expect(prisma.score.upsert).toHaveBeenCalled();
      expect(prisma.scoreRevision.create).not.toHaveBeenCalled();
    });

    it('never creates a ScoreRevision on a draft save', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      const service = new ScoringService(prisma, makeCalibration());

      await service.saveDraft('assign-1', 'judge-1', { overallFeedback: 'still drafting' });

      expect(prisma.scoreRevision.create).not.toHaveBeenCalled();
      expect(prisma.judgeReview.upsert).toHaveBeenCalled();
    });

    it('rejects a value outside a SCORING criterion\'s 0-100 range', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION]);
      const service = new ScoringService(prisma, makeCalibration());

      await expect(
        service.saveDraft('assign-1', 'judge-1', { scores: [{ criterionId: 'c1', value: 150 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a BONUS value above that criterion\'s maxPoints', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([BONUS_CRITERION]);
      const service = new ScoringService(prisma, makeCalibration());

      await expect(
        service.saveDraft('assign-1', 'judge-1', { scores: [{ criterionId: 'c2', value: 20 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects any write after judgingClosesAt, server time only', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      prisma.event.findUniqueOrThrow.mockResolvedValue(PAST_EVENT);
      const service = new ScoringService(prisma, makeCalibration());

      await expect(
        service.saveDraft('assign-1', 'judge-1', { overallFeedback: 'too late' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('submitReview', () => {
    it('rejects if a SCORING criterion has no value', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION]);
      prisma.score.findMany.mockResolvedValue([]); // no scores saved
      prisma.judgeReview.findUnique.mockResolvedValue({ overallFeedback: 'feedback', revisionCount: 0 });
      const service = new ScoringService(prisma, makeCalibration());

      await expect(service.submitReview('assign-1', 'judge-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects if overallFeedback is empty, even with all SCORING criteria filled', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION]);
      prisma.score.findMany.mockResolvedValue([{ criterionId: 'c1', value: 80 }]);
      prisma.judgeReview.findUnique.mockResolvedValue(null);
      const service = new ScoringService(prisma, makeCalibration());

      await expect(service.submitReview('assign-1', 'judge-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('succeeds with every BONUS track left completely unscored', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT);
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION, BONUS_CRITERION]);
      prisma.score.findMany.mockResolvedValue([{ criterionId: 'c1', value: 80 }]); // bonus untouched
      prisma.judgeReview.findUnique.mockResolvedValue({ overallFeedback: 'great work', revisionCount: 0 });
      const service = new ScoringService(prisma, makeCalibration());

      await expect(service.submitReview('assign-1', 'judge-1')).resolves.toBeDefined();
    });

    it('sets status COMPLETED and stamps completedAt on first submit only', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue(ASSIGNMENT); // completedAt: null
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION]);
      prisma.score.findMany.mockResolvedValue([{ criterionId: 'c1', value: 80 }]);
      prisma.judgeReview.findUnique.mockResolvedValue({ overallFeedback: 'great', revisionCount: 0 });
      const service = new ScoringService(prisma, makeCalibration());

      await service.submitReview('assign-1', 'judge-1');

      const updateCall = prisma.judgeAssignment.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('COMPLETED');
      expect(updateCall.data.completedAt).toBeInstanceOf(Date);
    });

    it('does not re-stamp completedAt on a resubmit after already COMPLETED', async () => {
      const prisma = makePrisma();
      const alreadyCompleted = { ...ASSIGNMENT, completedAt: new Date('2026-01-01T00:00:00Z') };
      prisma.judgeAssignment.findUnique.mockResolvedValue(alreadyCompleted);
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION]);
      prisma.score.findMany.mockResolvedValue([{ criterionId: 'c1', value: 90 }]);
      prisma.judgeReview.findUnique.mockResolvedValue({ overallFeedback: 'revised', revisionCount: 1 });
      const service = new ScoringService(prisma, makeCalibration());

      await service.submitReview('assign-1', 'judge-1');

      const updateCall = prisma.judgeAssignment.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('completedAt');
    });

    it('creates exactly one new ScoreRevision per submit-review call, incrementing revisionNumber', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue({ ...ASSIGNMENT, completedAt: new Date() });
      prisma.event.findUniqueOrThrow.mockResolvedValue(FUTURE_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION]);
      prisma.score.findMany.mockResolvedValue([{ criterionId: 'c1', value: 90 }]);
      prisma.judgeReview.findUnique.mockResolvedValue({ overallFeedback: 'revised', revisionCount: 2 });
      const service = new ScoringService(prisma, makeCalibration());

      await service.submitReview('assign-1', 'judge-1');

      expect(prisma.scoreRevision.create).toHaveBeenCalledTimes(1);
      const revisionData = prisma.scoreRevision.create.mock.calls[0][0].data;
      expect(revisionData.revisionNumber).toBe(3);
    });

    it('allows a resubmit right up until judgingClosesAt, and rejects after', async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findUnique.mockResolvedValue({ ...ASSIGNMENT, completedAt: new Date() });
      prisma.event.findUniqueOrThrow.mockResolvedValue(PAST_EVENT);
      prisma.rubricCriterion.findMany.mockResolvedValue([SCORING_CRITERION]);
      prisma.score.findMany.mockResolvedValue([{ criterionId: 'c1', value: 90 }]);
      prisma.judgeReview.findUnique.mockResolvedValue({ overallFeedback: 'revised', revisionCount: 1 });
      const service = new ScoringService(prisma, makeCalibration());

      await expect(service.submitReview('assign-1', 'judge-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
