import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VerificationService } from './verification.service';

function makePrisma() {
  return {
    event: { findUnique: jest.fn() },
    submission: { findUnique: jest.fn(), findMany: jest.fn() },
    submissionVerification: { upsert: jest.fn() },
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

function makeQueue() {
  return { enqueue: jest.fn() };
}

const EVENT = { id: 'event-1' };

describe('VerificationService', () => {
  describe('review', () => {
    it('rejects DISQUALIFIED with no remarks', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await expect(
        service.review('event-1', 'sub-1', 'organizer-1', { finalDecision: 'DISQUALIFIED' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.submissionVerification.upsert).not.toHaveBeenCalled();
    });

    it('rejects DISQUALIFIED with only whitespace remarks', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await expect(
        service.review('event-1', 'sub-1', 'organizer-1', {
          finalDecision: 'DISQUALIFIED',
          remarks: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows DISQUALIFIED with non-empty remarks', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      prisma.submissionVerification.upsert.mockResolvedValue({ finalDecision: 'DISQUALIFIED' });
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await service.review('event-1', 'sub-1', 'organizer-1', {
        finalDecision: 'DISQUALIFIED',
        remarks: 'Repo still private at review time.',
      });
      expect(prisma.submissionVerification.upsert).toHaveBeenCalled();
    });

    it('allows APPROVED with no remarks (optional, not mandatory)', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      prisma.submissionVerification.upsert.mockResolvedValue({ finalDecision: 'APPROVED' });
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await expect(
        service.review('event-1', 'sub-1', 'organizer-1', { finalDecision: 'APPROVED' }),
      ).resolves.toBeDefined();
    });

    it('404s (not 403) when the submission belongs to a different event — cross-event isolation', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'OTHER_EVENT' });
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await expect(
        service.review('event-1', 'sub-1', 'organizer-1', { finalDecision: 'APPROVED' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when the submission does not exist at all', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(null);
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await expect(
        service.review('event-1', 'sub-1', 'organizer-1', { finalDecision: 'APPROVED' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('triggerRun', () => {
    it('ALL scope only enqueues submissions never checked, by default', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([{ id: 'sub-1' }, { id: 'sub-2' }]);
      const queue = makeQueue();
      const service = new VerificationService(prisma, makeAudit() as any, queue as any);

      const result = await service.triggerRun('event-1', 'organizer-1', { scope: 'ALL' });

      expect(prisma.submission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ verification: null }, { verification: { is: { checkStatus: 'NOT_RUN' } } }],
          }),
        }),
      );
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(result.queued).toBe(2);
    });

    it('ALL scope with includeAlreadyChecked re-runs everything, no NOT_RUN filter', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([{ id: 'sub-1' }]);
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await service.triggerRun('event-1', 'organizer-1', { scope: 'ALL', includeAlreadyChecked: true });

      const where = prisma.submission.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
    });

    it('TARGETED scope only enqueues submissions that actually belong to this event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      // The DB query itself enforces eventId scoping — simulate it only
      // returning the one submission that matches.
      prisma.submission.findMany.mockResolvedValue([{ id: 'sub-1' }]);
      const queue = makeQueue();
      const service = new VerificationService(prisma, makeAudit() as any, queue as any);

      const result = await service.triggerRun('event-1', 'organizer-1', {
        scope: 'TARGETED',
        submissionIds: ['sub-1', 'sub-from-other-event'],
      });

      expect(prisma.submission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ eventId: 'event-1' }),
        }),
      );
      expect(result.queued).toBe(1);
    });

    it('TARGETED scope requires at least one submissionId', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await expect(
        service.triggerRun('event-1', 'organizer-1', { scope: 'TARGETED', submissionIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('FILTER scope requires at least one filter field', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await expect(
        service.triggerRun('event-1', 'organizer-1', { scope: 'FILTER', filter: {} }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('FILTER scope only re-enqueues submissions matching the filter at trigger time', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([{ id: 'sub-suspicious' }]);
      const queue = makeQueue();
      const service = new VerificationService(prisma, makeAudit() as any, queue as any);

      const result = await service.triggerRun('event-1', 'organizer-1', {
        scope: 'FILTER',
        filter: { checkStatus: ['SUSPICIOUS'] },
      });

      expect(prisma.submission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            verification: { is: { checkStatus: { in: ['SUSPICIOUS'] } } },
          }),
        }),
      );
      expect(result.queued).toBe(1);
    });

    it('404s for a non-existent event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(null);
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await expect(
        service.triggerRun('no-such-event', 'organizer-1', { scope: 'ALL' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('filters by checkStatus and finalDecision when provided', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([]);
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      await service.list('event-1', 'SUSPICIOUS', 'PENDING_REVIEW');

      expect(prisma.submission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            verification: {
              is: { checkStatus: 'SUSPICIOUS', finalDecision: 'PENDING_REVIEW' },
            },
          }),
        }),
      );
    });

    it('defaults a never-checked submission to NOT_RUN/PENDING_REVIEW in the response shape', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([
        { id: 'sub-1', eventId: 'event-1', title: 't', repoUrl: 'r', submittedAt: null, verification: null },
      ]);
      const service = new VerificationService(prisma, makeAudit() as any, makeQueue() as any);

      const [result] = await service.list('event-1');
      expect(result.checkStatus).toBe('NOT_RUN');
      expect(result.finalDecision).toBe('PENDING_REVIEW');
    });
  });
});
