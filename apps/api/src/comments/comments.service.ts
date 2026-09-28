import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

// Module 13 (Comments) — see docs/stages/13-comments.md. A
// deliberately small module: flat (no threading), soft-delete only,
// no automated content filtering — most decisions here are
// consistent, low-risk defaults drawn from patterns already
// established elsewhere in this platform (Section 10).
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Creation (Section 2/3) ---

  async create(submissionId: string, userId: string, dto: CreateCommentDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Only users with a verified email can comment.',
      });
    }

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { event: true },
    });
    if (!submission) {
      throw new NotFoundException({ code: 'SUBMISSION_NOT_FOUND', message: 'No such submission.' });
    }
    // Gallery visibility gates CREATION only — an existing comment
    // stays visible even if the submission later reverts to draft
    // (Section 9's own explicit test, easy to get backwards by
    // accident).
    if (submission.isDraft) {
      throw new BadRequestException({
        code: 'SUBMISSION_NOT_PUBLIC',
        message: 'This submission is not currently visible in the public gallery.',
      });
    }
    if (!submission.event.commentsEnabled) {
      throw new BadRequestException({
        code: 'COMMENTS_DISABLED',
        message: 'Comments are disabled for this event.',
      });
    }

    return this.prisma.comment.create({
      data: { submissionId, userId, body: dto.body },
    });
  }

  // --- Reading (Section 6 — deleted comments are admin-only) ---

  async listForSubmission(submissionId: string, caller: { id: string; siteAdmin: boolean } | null, includeDeleted: boolean) {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException({ code: 'SUBMISSION_NOT_FOUND', message: 'No such submission.' });
    }

    const canSeeDeleted = includeDeleted && caller && (await this.isOrganizerOrAdmin(submission.eventId, caller));

    return this.prisma.comment.findMany({
      where: canSeeDeleted ? { submissionId } : { submissionId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, displayName: true } } },
    });
  }

  // --- Editing (Section 5 — author-only, no time limit) ---

  async update(commentId: string, userId: string, dto: UpdateCommentDto) {
    const comment = await this.getCommentOrThrow(commentId);
    if (comment.userId !== userId) {
      throw new ForbiddenException({ code: 'NOT_YOUR_COMMENT', message: 'Only the comment\'s own author can edit it.' });
    }
    if (comment.deletedAt) {
      throw new BadRequestException({ code: 'COMMENT_DELETED', message: 'A deleted comment cannot be edited.' });
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { body: dto.body, editedAt: new Date() },
    });
  }

  // --- Deletion (Section 6 — two actors, two requirements) ---

  async remove(commentId: string, requester: { id: string; siteAdmin: boolean }, reason?: string) {
    const comment = await this.getCommentOrThrow(commentId);
    if (comment.deletedAt) {
      throw new BadRequestException({ code: 'ALREADY_DELETED', message: 'This comment has already been deleted.' });
    }

    const isSelfDelete = comment.userId === requester.id;

    if (!isSelfDelete) {
      const submission = await this.prisma.submission.findUniqueOrThrow({ where: { id: comment.submissionId } });
      const allowed = await this.isOrganizerOrAdmin(submission.eventId, requester);
      if (!allowed) {
        throw new ForbiddenException({
          code: 'MODERATION_FORBIDDEN',
          message: 'Only the comment\'s own author, or an organizer/admin scoped to this event, can delete it.',
        });
      }
      if (!reason || reason.trim().length === 0) {
        throw new BadRequestException({
          code: 'REASON_REQUIRED',
          message: 'A moderation deletion requires a non-empty reason.',
        });
      }
    }

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        deletedByUserId: requester.id,
        deletionReason: isSelfDelete ? (reason ?? null) : reason!,
      },
    });

    if (!isSelfDelete) {
      // Moderation deletion is exactly the kind of action CLAUDE.md's
      // principle 5 calls out by name — self-deletion is not (a person
      // removing their own content needs no audit trail).
      await this.audit.record(requester.id, 'COMMENT_MODERATED_DELETE', {
        commentId,
        authorUserId: comment.userId,
        reason,
      });
    }

    return updated;
  }

  private async isOrganizerOrAdmin(eventId: string, caller: { id: string; siteAdmin: boolean }): Promise<boolean> {
    if (caller.siteAdmin) return true;
    const membership = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: caller.id, eventId } },
    });
    return membership?.role === 'ORGANIZER' && membership.invitationStatus === 'ACCEPTED';
  }

  private async getCommentOrThrow(commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException({ code: 'COMMENT_NOT_FOUND', message: 'No such comment.' });
    }
    return comment;
  }
}
