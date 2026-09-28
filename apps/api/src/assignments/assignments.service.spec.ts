import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';

function makePrisma() {
  const prisma: any = {
    event: { findUnique: jest.fn() },
    submission: { findUnique: jest.fn(), findMany: jest.fn() },
    eventMembership: { findMany: jest.fn(), findUnique: jest.fn() },
    judgeAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((args: any) =>
        Promise.resolve({ id: `assign-${Math.random()}`, status: 'PENDING', ...args.data }),
      ),
      update: jest.fn((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
    },
    judgeReliabilityNote: { create: jest.fn((args: any) => Promise.resolve({ id: 'note-1', ...args.data })) },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  };
  return prisma;
}

function makeAudit() {
  return { record: jest.fn() };
}

const EVENT = { id: 'event-1', maxProjectsPerJudge: 3, trackAttachmentMode: 'SINGLE' };

const APPROVED_SUBMISSION = {
  id: 'sub-1',
  eventId: 'event-1',
  everSubmitted: true,
  trackIds: ['track-a'],
  verification: { finalDecision: 'APPROVED' },
};

describe('AssignmentsService', () => {
  describe('manualAssign', () => {
    it('rejects assigning to a non-APPROVED submission', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        eventId: 'event-1',
        verification: { finalDecision: 'PENDING_REVIEW' },
      });
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.manualAssign('event-1', 'organizer-1', { submissionId: 'sub-1', judgeIds: ['judge-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.judgeAssignment.create).not.toHaveBeenCalled();
    });

    it('rejects a submission with no verification row at all (NOT_RUN default)', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'event-1', verification: null });
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.manualAssign('event-1', 'organizer-1', { submissionId: 'sub-1', judgeIds: ['judge-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects assigning a judge who is not ACCEPTED on this event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findUnique.mockResolvedValue(APPROVED_SUBMISSION);
      prisma.eventMembership.findMany.mockResolvedValue([]); // no matching ACCEPTED judge
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.manualAssign('event-1', 'organizer-1', { submissionId: 'sub-1', judgeIds: ['judge-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the assignment would exceed maxProjectsPerJudge', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findUnique.mockResolvedValue(APPROVED_SUBMISSION);
      prisma.eventMembership.findMany.mockResolvedValue([
        { userId: 'judge-1', role: 'JUDGE', invitationStatus: 'ACCEPTED', projectLimitOverride: null },
      ]);
      prisma.judgeAssignment.count.mockResolvedValue(3); // already at EVENT.maxProjectsPerJudge (3)
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.manualAssign('event-1', 'organizer-1', { submissionId: 'sub-1', judgeIds: ['judge-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.judgeAssignment.create).not.toHaveBeenCalled();
    });

    it('allows exceeding the event default when projectLimitOverride raises it', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findUnique.mockResolvedValue(APPROVED_SUBMISSION);
      prisma.eventMembership.findMany.mockResolvedValue([
        { userId: 'judge-1', role: 'JUDGE', invitationStatus: 'ACCEPTED', projectLimitOverride: 10 },
      ]);
      prisma.judgeAssignment.count.mockResolvedValue(3); // over the event default, under the override
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.manualAssign('event-1', 'organizer-1', { submissionId: 'sub-1', judgeIds: ['judge-1'] }),
      ).resolves.toBeDefined();
      expect(prisma.judgeAssignment.create).toHaveBeenCalled();
    });

    it('rejects assigning a judge already assigned to this submission', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findUnique.mockResolvedValue(APPROVED_SUBMISSION);
      prisma.eventMembership.findMany.mockResolvedValue([
        { userId: 'judge-1', role: 'JUDGE', invitationStatus: 'ACCEPTED', projectLimitOverride: null },
      ]);
      prisma.judgeAssignment.findMany.mockResolvedValue([{ judgeId: 'judge-1', status: 'PENDING' }]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.manualAssign('event-1', 'organizer-1', { submissionId: 'sub-1', judgeIds: ['judge-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s (not a leaked 403) for a submission belonging to a different event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'OTHER_EVENT' });
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.manualAssign('event-1', 'organizer-1', { submissionId: 'sub-1', judgeIds: ['judge-1'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listAssignableSubmissions', () => {
    it('only ever queries finalDecision: APPROVED submissions', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await service.listAssignableSubmissions('event-1');

      expect(prisma.submission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            verification: { is: { finalDecision: 'APPROVED' } },
          }),
        }),
      );
    });
  });

  describe('autoAssign', () => {
    it('rejects BY_TRACK on an event with no tracks configured', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT, trackAttachmentMode: 'NONE' });
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.autoAssign('event-1', 'organizer-1', { reviewsPerProject: 3, strategy: 'BY_TRACK' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('BY_TRACK never assigns a judge outside their trackIds scope', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([
        { id: 'sub-a', trackIds: ['track-a'], judgeAssignments: [] },
        { id: 'sub-b', trackIds: ['track-b'], judgeAssignments: [] },
      ]);
      prisma.eventMembership.findMany.mockResolvedValue([
        { userId: 'judge-a-only', role: 'JUDGE', invitationStatus: 'ACCEPTED', trackIds: ['track-a'], projectLimitOverride: null },
        { userId: 'judge-b-only', role: 'JUDGE', invitationStatus: 'ACCEPTED', trackIds: ['track-b'], projectLimitOverride: null },
      ]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      const result = await service.autoAssign('event-1', 'organizer-1', {
        reviewsPerProject: 1,
        strategy: 'BY_TRACK',
      });

      expect(prisma.judgeAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ submissionId: 'sub-a', judgeId: 'judge-a-only' }) }),
      );
      expect(prisma.judgeAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ submissionId: 'sub-b', judgeId: 'judge-b-only' }) }),
      );
      expect(prisma.judgeAssignment.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ submissionId: 'sub-a', judgeId: 'judge-b-only' }) }),
      );
      expect(result.created).toBe(2);
    });

    it('RANDOM strategy ignores track scoping entirely', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([
        { id: 'sub-a', trackIds: ['track-a'], judgeAssignments: [] },
      ]);
      prisma.eventMembership.findMany.mockResolvedValue([
        { userId: 'judge-b-only', role: 'JUDGE', invitationStatus: 'ACCEPTED', trackIds: ['track-b'], projectLimitOverride: null },
      ]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      const result = await service.autoAssign('event-1', 'organizer-1', {
        reviewsPerProject: 1,
        strategy: 'RANDOM',
      });

      expect(result.created).toBe(1);
    });

    it('excludes a PENDING (not yet ACCEPTED) judge invitation from eligibility', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([{ id: 'sub-a', trackIds: [], judgeAssignments: [] }]);
      // The service's own query already filters invitationStatus: ACCEPTED
      // at the DB level — a PENDING row simply never comes back from it.
      prisma.eventMembership.findMany.mockResolvedValue([]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      const result = await service.autoAssign('event-1', 'organizer-1', {
        reviewsPerProject: 1,
        strategy: 'RANDOM',
      });

      expect(prisma.eventMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'JUDGE', invitationStatus: 'ACCEPTED' }),
        }),
      );
      expect(result.created).toBe(0);
      expect(result.shortfalls).toEqual([{ submissionId: 'sub-a', assigned: 0, needed: 1 }]);
    });

    it('produces exactly reviewsPerProject reviews with load balanced within 1', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT, maxProjectsPerJudge: 100 });
      const submissions = Array.from({ length: 6 }, (_, i) => ({
        id: `sub-${i}`,
        trackIds: [],
        judgeAssignments: [],
      }));
      prisma.submission.findMany.mockResolvedValue(submissions);
      const judges = Array.from({ length: 3 }, (_, i) => ({
        userId: `judge-${i}`,
        role: 'JUDGE',
        invitationStatus: 'ACCEPTED',
        trackIds: [],
        projectLimitOverride: null,
      }));
      prisma.eventMembership.findMany.mockResolvedValue(judges);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      const result = await service.autoAssign('event-1', 'organizer-1', {
        reviewsPerProject: 1,
        strategy: 'RANDOM',
      });

      expect(result.created).toBe(6);
      expect(result.shortfalls).toHaveLength(0);

      const loadPerJudge = new Map<string, number>();
      for (const call of prisma.judgeAssignment.create.mock.calls) {
        const judgeId = call[0].data.judgeId;
        loadPerJudge.set(judgeId, (loadPerJudge.get(judgeId) ?? 0) + 1);
      }
      const loads = [...loadPerJudge.values()];
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
    });

    it('does not duplicate or overwrite an existing manual assignment on the same submission', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findMany.mockResolvedValue([
        { id: 'sub-a', trackIds: [], judgeAssignments: [{ judgeId: 'judge-manual' }] },
      ]);
      prisma.eventMembership.findMany.mockResolvedValue([
        { userId: 'judge-manual', role: 'JUDGE', invitationStatus: 'ACCEPTED', trackIds: [], projectLimitOverride: null },
        { userId: 'judge-algo', role: 'JUDGE', invitationStatus: 'ACCEPTED', trackIds: [], projectLimitOverride: null },
      ]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      const result = await service.autoAssign('event-1', 'organizer-1', {
        reviewsPerProject: 2,
        strategy: 'RANDOM',
      });

      // Only 1 more needed (2 target - 1 already manually assigned) —
      // and it must go to the judge NOT already on this submission.
      expect(result.created).toBe(1);
      expect(prisma.judgeAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ judgeId: 'judge-algo' }) }),
      );
    });
  });

  describe('transfer', () => {
    it('marks the original TRANSFERRED and creates a new row for the receiving judge', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.judgeAssignment.findUnique.mockResolvedValue({
        id: 'assign-1',
        eventId: 'event-1',
        judgeId: 'judge-noshow',
        submissionId: 'sub-1',
        status: 'PENDING',
      });
      prisma.eventMembership.findUnique.mockResolvedValue({
        userId: 'judge-new',
        eventId: 'event-1',
        role: 'JUDGE',
        invitationStatus: 'ACCEPTED',
        projectLimitOverride: null,
      });
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await service.transfer('event-1', 'assign-1', 'organizer-1', {
        toJudgeId: 'judge-new',
        remark: 'Never started their reviews.',
      });

      expect(prisma.judgeAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assign-1' },
        data: { status: 'TRANSFERRED' },
      });
      expect(prisma.judgeReliabilityNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ judgeUserId: 'judge-noshow', authorUserId: 'organizer-1' }),
        }),
      );
      expect(prisma.judgeAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            judgeId: 'judge-new',
            submissionId: 'sub-1',
            transferredFromAssignmentId: 'assign-1',
          }),
        }),
      );
    });

    it('rejects transferring an assignment that is already COMPLETED, unconditionally', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.judgeAssignment.findUnique.mockResolvedValue({
        id: 'assign-1',
        eventId: 'event-1',
        judgeId: 'judge-1',
        submissionId: 'sub-1',
        status: 'COMPLETED',
      });
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.transfer('event-1', 'assign-1', 'organizer-1', { toJudgeId: 'judge-new', remark: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.judgeAssignment.update).not.toHaveBeenCalled();
      expect(prisma.judgeReliabilityNote.create).not.toHaveBeenCalled();
    });

    it('404s for an assignment id belonging to a different event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.judgeAssignment.findUnique.mockResolvedValue({
        id: 'assign-1',
        eventId: 'OTHER_EVENT',
        judgeId: 'judge-1',
        submissionId: 'sub-1',
        status: 'PENDING',
      });
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await expect(
        service.transfer('event-1', 'assign-1', 'organizer-1', { toJudgeId: 'judge-new', remark: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listMine', () => {
    it("only ever returns the calling judge's own assignments", async () => {
      const prisma = makePrisma();
      prisma.judgeAssignment.findMany.mockResolvedValue([{ id: 'a1', judgeId: 'judge-1' }]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      await service.listMine('event-1', 'judge-1');

      expect(prisma.judgeAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: 'event-1', judgeId: 'judge-1' } }),
      );
    });
  });

  describe('progress (Module 8 Section 6 — live dashboard)', () => {
    it('includes every ACCEPTED judge, even one with zero assignments so far', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.eventMembership.findMany.mockResolvedValue([
        { userId: 'judge-busy', user: { id: 'judge-busy', displayName: 'Busy', email: 'b@x.com' } },
        { userId: 'judge-idle', user: { id: 'judge-idle', displayName: 'Idle', email: 'i@x.com' } },
      ]);
      prisma.judgeAssignment.findMany.mockResolvedValue([
        { judgeId: 'judge-busy', status: 'COMPLETED' },
        { judgeId: 'judge-busy', status: 'PENDING' },
        { judgeId: 'judge-busy', status: 'IN_PROGRESS' },
      ]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      const result = await service.progress('event-1');

      const busy = result.find((r) => r.judgeId === 'judge-busy')!;
      expect(busy).toEqual(
        expect.objectContaining({ total: 3, completed: 1, inProgress: 1, pending: 1 }),
      );
      const idle = result.find((r) => r.judgeId === 'judge-idle')!;
      expect(idle).toEqual(
        expect.objectContaining({ total: 0, completed: 0, inProgress: 0, pending: 0 }),
      );
    });

    it('counts reflect live table state exactly, with no separate cached count path', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.eventMembership.findMany.mockResolvedValue([
        { userId: 'judge-1', user: { id: 'judge-1', displayName: 'J', email: 'j@x.com' } },
      ]);
      prisma.judgeAssignment.findMany.mockResolvedValue([{ judgeId: 'judge-1', status: 'COMPLETED' }]);
      const service = new AssignmentsService(prisma, makeAudit() as any);

      const [result] = await service.progress('event-1');
      expect(result.total).toBe(1);
      expect(result.completed).toBe(1);

      // The query only ever looks at "active" statuses live from the
      // table — TRANSFERRED rows must never inflate a count.
      expect(prisma.judgeAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] } }),
        }),
      );
    });
  });
});
