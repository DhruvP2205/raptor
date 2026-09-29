import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SubmissionsService } from './submissions.service';

function makePrisma() {
  const prisma: any = {
    submission: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    eventMembership: { findUnique: jest.fn() },
    teamMembership: { findFirst: jest.fn(), findUnique: jest.fn() },
    event: { findUnique: jest.fn() },
    submissionVerification: { findUnique: jest.fn() },
    team: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    track: { count: jest.fn() },
  };
  return prisma;
}

function makeAudit() {
  return { record: jest.fn() };
}

function makeMarkdown() {
  return { renderToSafeHtml: jest.fn((src: string) => `<p>${src}</p>`) };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

const FUTURE_EVENT = {
  id: 'event-1',
  submissionsCloseAt: new Date(Date.now() + 86_400_000),
  trackAttachmentMode: 'NONE',
};

const PAST_DEADLINE_EVENT = {
  id: 'event-1',
  submissionsCloseAt: new Date(Date.now() - 86_400_000),
  trackAttachmentMode: 'NONE',
};

const ACCEPTED_PARTICIPANT = { role: 'PARTICIPANT', invitationStatus: 'ACCEPTED' };
const ACCEPTED_ORGANIZER = { role: 'ORGANIZER', invitationStatus: 'ACCEPTED' };

describe('SubmissionsService', () => {
  describe('startSubmission', () => {
    it('rejects a caller who is not a registered participant', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.startSubmission('event-1', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects after the submission deadline has passed', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(PAST_DEADLINE_EVENT);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.startSubmission('event-1', 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.submission.create).not.toHaveBeenCalled();
    });

    it('creates a TEAM submission when the caller is on a team for this event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue({ teamId: 'team-1' });
      prisma.submission.create.mockResolvedValue({ id: 'sub-1', description: null });
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await service.startSubmission('event-1', 'u1');

      expect(prisma.submission.create).toHaveBeenCalledWith({
        data: { eventId: 'event-1', submissionType: 'TEAM', teamId: 'team-1' },
      });
    });

    it('creates a SOLO submission when the caller is not on a team', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      prisma.submission.create.mockResolvedValue({ id: 'sub-1', description: null });
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await service.startSubmission('event-1', 'u1');

      expect(prisma.submission.create).toHaveBeenCalledWith({
        data: { eventId: 'event-1', submissionType: 'SOLO', soloUserId: 'u1' },
      });
    });

    it('maps a unique-constraint collision to a 409, not a 500', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      prisma.submission.create.mockRejectedValue(p2002());
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.startSubmission('event-1', 'u1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('patch (draft save)', () => {
    const SOLO_SUBMISSION = {
      id: 'sub-1',
      eventId: 'event-1',
      submissionType: 'SOLO',
      soloUserId: 'u1',
      teamId: null,
      title: null,
      description: null,
      trackIds: [],
      isDraft: true,
    };

    it('rejects a caller who is not the submission owner', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SOLO_SUBMISSION);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.patch('sub-1', 'someone-else', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('saves a partial draft with no completeness requirement', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SOLO_SUBMISSION);
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      prisma.submission.update.mockResolvedValue({ ...SOLO_SUBMISSION, title: 'WIP' });
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await service.patch('sub-1', 'u1', { title: 'WIP' });

      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { title: 'WIP' },
      });
    });

    it('rejects a write after the submission deadline', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SOLO_SUBMISSION);
      prisma.event.findUnique.mockResolvedValue(PAST_DEADLINE_EVENT);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.patch('sub-1', 'u1', { title: 'late' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects track data entirely when trackAttachmentMode is NONE', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SOLO_SUBMISSION);
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(
        service.patch('sub-1', 'u1', { trackIds: ['track-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects more than one track when trackAttachmentMode is SINGLE', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SOLO_SUBMISSION);
      prisma.event.findUnique.mockResolvedValue({ ...FUTURE_EVENT, trackAttachmentMode: 'SINGLE' });
      prisma.track.count.mockResolvedValue(2);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(
        service.patch('sub-1', 'u1', { trackIds: ['track-1', 'track-2'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows more than one track when trackAttachmentMode is MULTIPLE', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SOLO_SUBMISSION);
      prisma.event.findUnique.mockResolvedValue({ ...FUTURE_EVENT, trackAttachmentMode: 'MULTIPLE' });
      prisma.track.count.mockResolvedValue(2);
      prisma.submission.update.mockResolvedValue({ ...SOLO_SUBMISSION, trackIds: ['track-1', 'track-2'] });
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(
        service.patch('sub-1', 'u1', { trackIds: ['track-1', 'track-2'] }),
      ).resolves.toBeDefined();
    });

    it('rejects a track that does not belong to this event', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SOLO_SUBMISSION);
      prisma.event.findUnique.mockResolvedValue({ ...FUTURE_EVENT, trackAttachmentMode: 'MULTIPLE' });
      prisma.track.count.mockResolvedValue(0);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(
        service.patch('sub-1', 'u1', { trackIds: ['track-from-another-event'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('submit', () => {
    const BASE = {
      id: 'sub-1',
      eventId: 'event-1',
      submissionType: 'SOLO',
      soloUserId: 'u1',
      teamId: null,
      trackIds: [],
      isDraft: true,
    };

    it('rejects with the specific missing fields when title/description are empty', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ ...BASE, title: null, description: '   ' });
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.submit('sub-1', 'u1')).rejects.toMatchObject({
        response: { fields: ['title', 'description'] },
      });
      expect(prisma.submission.update).not.toHaveBeenCalled();
    });

    it('requires trackIds when trackAttachmentMode is not NONE', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({
        ...BASE,
        title: 'T',
        description: 'D',
        trackIds: [],
      });
      prisma.event.findUnique.mockResolvedValue({ ...FUTURE_EVENT, trackAttachmentMode: 'SINGLE' });
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.submit('sub-1', 'u1')).rejects.toMatchObject({
        response: { fields: ['trackIds'] },
      });
    });

    it('succeeds once required fields are filled, setting isDraft=false and everSubmitted=true', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ ...BASE, title: 'T', description: 'D' });
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      prisma.submission.update.mockResolvedValue({
        ...BASE,
        title: 'T',
        description: 'D',
        isDraft: false,
        everSubmitted: true,
        submittedAt: new Date(),
      });
      const audit = makeAudit();
      const service = new SubmissionsService(prisma, audit as any, makeMarkdown() as any);

      await service.submit('sub-1', 'u1');

      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ isDraft: false, everSubmitted: true }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        'u1',
        'SUBMISSION_SUBMITTED',
        expect.objectContaining({ submissionId: 'sub-1' }),
      );
    });

    it('rejects a non-owner', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ ...BASE, title: 'T', description: 'D' });
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.submit('sub-1', 'someone-else')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects after the deadline', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ ...BASE, title: 'T', description: 'D' });
      prisma.event.findUnique.mockResolvedValue(PAST_DEADLINE_EVENT);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.submit('sub-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('unsubmit', () => {
    it('flips isDraft back to true without touching submittedAt or everSubmitted', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        eventId: 'event-1',
        submissionType: 'SOLO',
        soloUserId: 'u1',
        isDraft: false,
        everSubmitted: true,
      });
      prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
      prisma.submission.update.mockResolvedValue({
        id: 'sub-1',
        isDraft: true,
        everSubmitted: true,
        description: null,
      });
      const audit = makeAudit();
      const service = new SubmissionsService(prisma, audit as any, makeMarkdown() as any);

      await service.unsubmit('sub-1', 'u1');

      expect(prisma.submission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { isDraft: true },
      });
      expect(audit.record).toHaveBeenCalledWith(
        'u1',
        'SUBMISSION_UNSUBMITTED',
        expect.objectContaining({ submissionId: 'sub-1' }),
      );
    });

    it('rejects a caller who is not on the owning team', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        eventId: 'event-1',
        submissionType: 'TEAM',
        teamId: 'team-1',
        soloUserId: null,
        isDraft: false,
      });
      prisma.teamMembership.findUnique.mockResolvedValue(null);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(service.unsubmit('sub-1', 'not-a-member')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('getById — visibility (Section 6)', () => {
    const DRAFT_SOLO = {
      id: 'sub-1',
      eventId: 'event-1',
      submissionType: 'SOLO',
      soloUserId: 'owner-1',
      teamId: null,
      isDraft: true,
      description: null,
    };
    const SUBMITTED_SOLO = { ...DRAFT_SOLO, isDraft: false };

    it('the owner can see their own draft', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(DRAFT_SOLO);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      const result = await service.getById('sub-1', { id: 'owner-1', siteAdmin: false } as any);
      expect(result.id).toBe('sub-1');
    });

    it('an organizer gets a 404 for a draft — not found, not forbidden', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(DRAFT_SOLO);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(
        service.getById('sub-1', { id: 'organizer-1', siteAdmin: false } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a siteAdmin gets a 404 for a draft too — list-only, no direct detail access', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(DRAFT_SOLO);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await expect(
        service.getById('sub-1', { id: 'admin-1', siteAdmin: true } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('an organizer of this event can see a submitted submission in full', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SUBMITTED_SOLO);
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_ORGANIZER);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      const result = await service.getById('sub-1', { id: 'organizer-1', siteAdmin: false } as any);
      expect(result.id).toBe('sub-1');
    });

    it('a siteAdmin can see a submitted submission in full', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SUBMITTED_SOLO);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      const result = await service.getById('sub-1', { id: 'admin-1', siteAdmin: true } as any);
      expect(result.id).toBe('sub-1');
    });

    // Section 4/6 — once submitted (isDraft: false), a submission is
    // public to anyone at all, stranger included; only a *draft* 404s
    // for a non-owner. A stranger just never gets the organizer/admin
    // -only verification panel alongside it.
    it('a stranger (not owner, not organizer, not admin) can see a submitted submission, but gets no verification panel', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue(SUBMITTED_SOLO);
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      const result: any = await service.getById('sub-1', { id: 'stranger-1', siteAdmin: false } as any);
      expect(result.id).toBe('sub-1');
      expect(result.verification).toBeNull();
    });
  });

  describe('listDraftsInProgressForEvent — admin list, ownership/timestamps only', () => {
    it('selects only identifying fields, never title/description/links', async () => {
      const prisma = makePrisma();
      prisma.submission.findMany.mockResolvedValue([]);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await service.listDraftsInProgressForEvent('event-1');

      const call = prisma.submission.findMany.mock.calls[0][0];
      expect(call.select).toEqual({
        id: true,
        submissionType: true,
        teamId: true,
        soloUserId: true,
        createdAt: true,
        updatedAt: true,
      });
    });
  });

  describe('listSubmittedForEvent — search & filter (Module 24, A7)', () => {
    const PUBLISHED_EVENT = { ...FUTURE_EVENT, status: 'PUBLISHED' };

    it('with no filters, returns the full unfiltered where clause — the acceptance checker relies on this', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(PUBLISHED_EVENT);
      prisma.submission.findMany.mockResolvedValue([]);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await service.listSubmittedForEvent('event-1', null);

      const where = prisma.submission.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ eventId: 'event-1', isDraft: false });
    });

    it('filters by case-insensitive title/description match when q is given', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(PUBLISHED_EVENT);
      prisma.submission.findMany.mockResolvedValue([]);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await service.listSubmittedForEvent('event-1', null, { q: 'Robot' });

      const where = prisma.submission.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { title: { contains: 'Robot', mode: 'insensitive' } },
        { description: { contains: 'Robot', mode: 'insensitive' } },
      ]);
    });

    it('filters by trackId when given', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(PUBLISHED_EVENT);
      prisma.submission.findMany.mockResolvedValue([]);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await service.listSubmittedForEvent('event-1', null, { trackId: 'track-9' });

      const where = prisma.submission.findMany.mock.calls[0][0].where;
      expect(where.trackIds).toEqual({ has: 'track-9' });
    });

    it('combines q and trackId together', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(PUBLISHED_EVENT);
      prisma.submission.findMany.mockResolvedValue([]);
      const service = new SubmissionsService(prisma, makeAudit() as any, makeMarkdown() as any);

      await service.listSubmittedForEvent('event-1', null, { q: 'robot', trackId: 'track-9' });

      const where = prisma.submission.findMany.mock.calls[0][0].where;
      expect(where.trackIds).toEqual({ has: 'track-9' });
      expect(where.OR).toBeDefined();
    });
  });
});
