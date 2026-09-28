import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';

function makePrisma() {
  return {
    user: { findUnique: jest.fn() },
    submission: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    comment: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    eventMembership: { findUnique: jest.fn().mockResolvedValue(null) },
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

const VERIFIED_USER = { id: 'user-1', emailVerifiedAt: new Date() };
const PUBLIC_SUBMISSION = { id: 'sub-1', eventId: 'event-1', isDraft: false, event: { commentsEnabled: true } };

describe('CommentsService', () => {
  describe('create (Section 2/3)', () => {
    it('rejects a user without emailVerifiedAt, regardless of participation', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', emailVerifiedAt: null });
      const service = new CommentsService(prisma, makeAudit() as any);

      await expect(service.create('sub-1', 'user-1', { body: 'hi' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });

    it('rejects commenting on a submission not currently visible in the gallery (isDraft: true)', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(VERIFIED_USER);
      prisma.submission.findUnique.mockResolvedValue({ ...PUBLIC_SUBMISSION, isDraft: true });
      const service = new CommentsService(prisma, makeAudit() as any);

      await expect(service.create('sub-1', 'user-1', { body: 'hi' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the event has comments disabled', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(VERIFIED_USER);
      prisma.submission.findUnique.mockResolvedValue({ ...PUBLIC_SUBMISSION, event: { commentsEnabled: false } });
      const service = new CommentsService(prisma, makeAudit() as any);

      await expect(service.create('sub-1', 'user-1', { body: 'hi' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('succeeds for a verified user on a publicly visible submission with comments enabled', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(VERIFIED_USER);
      prisma.submission.findUnique.mockResolvedValue(PUBLIC_SUBMISSION);
      prisma.comment.create.mockResolvedValue({ id: 'c1', body: 'hi' });
      const service = new CommentsService(prisma, makeAudit() as any);

      await service.create('sub-1', 'user-1', { body: 'hi' });

      expect(prisma.comment.create).toHaveBeenCalledWith({ data: { submissionId: 'sub-1', userId: 'user-1', body: 'hi' } });
    });
  });

  describe('listForSubmission — visibility (Section 6/9)', () => {
    it('excludes soft-deleted comments for an anonymous/non-privileged caller', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      const service = new CommentsService(prisma, makeAudit() as any);

      await service.listForSubmission('sub-1', null, true); // even if they ask for it

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { submissionId: 'sub-1', deletedAt: null } }),
      );
    });

    it('includes soft-deleted comments for an organizer of that event', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue({ role: 'ORGANIZER', invitationStatus: 'ACCEPTED' });
      const service = new CommentsService(prisma, makeAudit() as any);

      await service.listForSubmission('sub-1', { id: 'organizer-1', siteAdmin: false }, true);

      expect(prisma.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { submissionId: 'sub-1' } }));
    });

    it('never fetches or filters by the submission\'s current isDraft state — a comment stays visible even if the submission reverts to draft', async () => {
      const prisma = makePrisma();
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      const service = new CommentsService(prisma, makeAudit() as any);

      await service.listForSubmission('sub-1', null, false);

      const whereArg = prisma.comment.findMany.mock.calls[0][0].where;
      expect(Object.keys(whereArg)).not.toContain('isDraft');
    });
  });

  describe('update (Section 5 — author-only, no time limit)', () => {
    it('rejects anyone other than the comment\'s own author', async () => {
      const prisma = makePrisma();
      const service = new CommentsService(prisma, makeAudit() as any);
      jest.spyOn(service as any, 'getCommentOrThrow').mockResolvedValue({ id: 'c1', userId: 'author-1', deletedAt: null });

      await expect(service.update('c1', 'someone-else', { body: 'edited' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sets editedAt on a successful edit by the real author', async () => {
      const prisma = makePrisma();
      const service = new CommentsService(prisma, makeAudit() as any);
      jest.spyOn(service as any, 'getCommentOrThrow').mockResolvedValue({ id: 'c1', userId: 'author-1', deletedAt: null });

      await service.update('c1', 'author-1', { body: 'edited text' });

      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { body: 'edited text', editedAt: expect.any(Date) },
      });
    });
  });

  describe('remove (Section 6 — self vs. moderation)', () => {
    it('self-deletion succeeds with no reason at all', async () => {
      const prisma = makePrisma();
      const service = new CommentsService(prisma, makeAudit() as any);
      jest.spyOn(service as any, 'getCommentOrThrow').mockResolvedValue({ id: 'c1', userId: 'author-1', submissionId: 'sub-1', deletedAt: null });

      await service.remove('c1', { id: 'author-1', siteAdmin: false }, undefined);

      expect(prisma.comment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletionReason: null }) }),
      );
    });

    it('rejects a moderation delete with no reason', async () => {
      const prisma = makePrisma();
      prisma.submission.findUniqueOrThrow.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue({ role: 'ORGANIZER', invitationStatus: 'ACCEPTED' });
      const service = new CommentsService(prisma, makeAudit() as any);
      jest.spyOn(service as any, 'getCommentOrThrow').mockResolvedValue({ id: 'c1', userId: 'author-1', submissionId: 'sub-1', deletedAt: null });

      await expect(service.remove('c1', { id: 'organizer-1', siteAdmin: false }, '')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.comment.update).not.toHaveBeenCalled();
    });

    it('rejects deletion by someone who is neither the author nor an organizer/admin of that event', async () => {
      const prisma = makePrisma();
      prisma.submission.findUniqueOrThrow.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      const service = new CommentsService(prisma, makeAudit() as any);
      jest.spyOn(service as any, 'getCommentOrThrow').mockResolvedValue({ id: 'c1', userId: 'author-1', submissionId: 'sub-1', deletedAt: null });

      await expect(service.remove('c1', { id: 'random-user', siteAdmin: false }, 'some reason')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('audits a moderation delete but never audits a self-delete', async () => {
      const prisma = makePrisma();
      prisma.submission.findUniqueOrThrow.mockResolvedValue({ id: 'sub-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue({ role: 'ORGANIZER', invitationStatus: 'ACCEPTED' });
      const audit = makeAudit();
      const service = new CommentsService(prisma, audit as any);
      jest.spyOn(service as any, 'getCommentOrThrow').mockResolvedValue({ id: 'c1', userId: 'author-1', submissionId: 'sub-1', deletedAt: null });

      await service.remove('c1', { id: 'organizer-1', siteAdmin: false }, 'rule violation');

      expect(audit.record).toHaveBeenCalledWith('organizer-1', 'COMMENT_MODERATED_DELETE', expect.objectContaining({ commentId: 'c1', reason: 'rule violation' }));

      audit.record.mockClear();
      jest.spyOn(service as any, 'getCommentOrThrow').mockResolvedValue({ id: 'c2', userId: 'author-1', submissionId: 'sub-1', deletedAt: null });
      await service.remove('c2', { id: 'author-1', siteAdmin: false }, undefined);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects deleting an already-deleted comment', async () => {
      const prisma = makePrisma();
      const service = new CommentsService(prisma, makeAudit() as any);
      jest.spyOn(service as any, 'getCommentOrThrow').mockResolvedValue({ id: 'c1', userId: 'author-1', submissionId: 'sub-1', deletedAt: new Date() });

      await expect(service.remove('c1', { id: 'author-1', siteAdmin: false })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('not found handling', () => {
    it('404s creating on a nonexistent submission', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(VERIFIED_USER);
      prisma.submission.findUnique.mockResolvedValue(null);
      const service = new CommentsService(prisma, makeAudit() as any);

      await expect(service.create('nope', 'user-1', { body: 'hi' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
