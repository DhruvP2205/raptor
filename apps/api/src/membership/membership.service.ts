import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AccountType, EventMembership } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { generateRawToken, sha256Hex } from '../common/crypto.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

// Event-level attachment of staff to a specific event — organizer
// (direct, no acceptance step) vs. judge (invite, accept/decline,
// expiry). See docs/stages/02-roles-and-membership.md Sections 3 & 5.
//
// Deliberately NOT implemented here: the shareable, not-yet-bound
// invitation link variant (Section 3.2, bullet 2). The doc describes
// direct-add and the link variant as producing "the same underlying
// record either way," but a link isn't addressed to a specific user at
// creation time — there's no userId to put on an EventMembership row
// until someone actually claims it. That's a real data-model question
// the doc doesn't resolve (no "unclaimed invitation" shape is shown
// anywhere), not an implementation detail — flagged rather than
// invented under time pressure. Direct-add (by known email) is fully
// implemented below.
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  // D9/D10 (docs/DECISIONS.md): a PARTICIPANT-track account can never
  // hold a JUDGE/ORGANIZER membership row. No DB constraint ties
  // accountType to EventMembership.role, so every creation path must
  // call this first.
  assertAccountTypeMatchesRole(
    accountType: AccountType,
    role: 'JUDGE' | 'ORGANIZER',
  ): void {
    if (accountType !== role) {
      throw new ForbiddenException({
        code: 'ACCOUNT_TYPE_MISMATCH',
        message: `Only a ${role}-track account can hold a ${role} membership.`,
      });
    }
  }

  // Organizer attachment is direct and immediate — no accept/decline
  // step, ever (Section 3.1). Used both for the event creator's own
  // first-organizer row (invitedByUserId: null — nobody added them,
  // they created the event) and for an existing organizer adding
  // another organizer-track account (invitedByUserId: the acting
  // organizer, for traceability, even though there's no consent step).
  async createOrganizerMembership(
    eventId: string,
    userId: string,
    userAccountType: AccountType,
    invitedByUserId: string | null,
  ): Promise<EventMembership> {
    this.assertAccountTypeMatchesRole(userAccountType, 'ORGANIZER');
    return this.prisma.eventMembership.create({
      data: {
        eventId,
        userId,
        role: 'ORGANIZER',
        invitationStatus: 'ACCEPTED',
        invitedByUserId,
        invitedAt: invitedByUserId ? new Date() : null,
      },
    });
  }

  async addOrganizerDirect(
    eventId: string,
    actingUserId: string,
    targetEmail: string,
  ): Promise<EventMembership> {
    const target = await this.prisma.user.findUnique({
      where: { email: targetEmail.trim().toLowerCase() },
    });
    if (!target || target.accountType !== 'ORGANIZER') {
      throw new NotFoundException({
        code: 'ORGANIZER_NOT_FOUND',
        message: 'No organizer-track account with that email.',
      });
    }

    const existing = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: target.id, eventId } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_A_MEMBER',
        message: 'This user already has a membership on this event.',
      });
    }

    const membership = await this.createOrganizerMembership(
      eventId,
      target.id,
      target.accountType,
      actingUserId,
    );
    await this.audit.record(actingUserId, 'ORGANIZER_ADDED', {
      eventId,
      targetUserId: target.id,
    });
    return membership;
  }

  async inviteJudgeDirect(
    eventId: string,
    actingUserId: string,
    targetEmail: string,
  ): Promise<EventMembership> {
    const normalizedEmail = targetEmail.trim().toLowerCase();
    const target = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!target || target.accountType !== 'JUDGE') {
      throw new NotFoundException({
        code: 'JUDGE_NOT_FOUND',
        message: 'No judge-track account with that email.',
      });
    }

    const existing = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: target.id, eventId } },
    });
    if (existing?.invitationStatus === 'ACCEPTED') {
      throw new ConflictException({
        code: 'ALREADY_A_MEMBER',
        message: 'This judge is already a member of this event.',
      });
    }

    // No existing row: create it fresh, PENDING. An existing
    // PENDING/DECLINED/EXPIRED row: direct-adding again is the same
    // operation as a resend (see issueInvitationToken) — fresh token,
    // back to PENDING either way.
    const membershipId = existing
      ? existing.id
      : (
          await this.prisma.eventMembership.create({
            data: {
              eventId,
              userId: target.id,
              role: 'JUDGE',
              invitationStatus: 'PENDING',
            },
          })
        ).id;

    const { membership, rawToken } = await this.issueInvitationToken(
      membershipId,
      actingUserId,
    );
    await this.sendInvitationEmail(target.email, rawToken);
    await this.audit.record(actingUserId, 'JUDGE_INVITED', {
      eventId,
      targetUserId: target.id,
    });
    return membership;
  }

  async resendInvitation(
    eventId: string,
    membershipId: string,
    actingUserId: string,
  ): Promise<EventMembership> {
    const membership = await this.prisma.eventMembership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.eventId !== eventId) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'No such invitation on this event.',
      });
    }
    if (membership.role !== 'JUDGE') {
      throw new BadRequestException({
        code: 'NOT_A_JUDGE_INVITATION',
        message: 'Resend only applies to judge invitations.',
      });
    }
    // "No resend action on ACCEPTED rows" (Section 3.2) — nothing to
    // resend.
    if (membership.invitationStatus === 'ACCEPTED') {
      throw new BadRequestException({
        code: 'ALREADY_ACCEPTED',
        message: 'Nothing to resend — already accepted.',
      });
    }

    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id: membership.userId },
    });
    const { membership: updated, rawToken } = await this.issueInvitationToken(
      membershipId,
      actingUserId,
    );
    await this.sendInvitationEmail(target.email, rawToken);
    await this.audit.record(actingUserId, 'JUDGE_INVITATION_RESENT', {
      eventId,
      membershipId,
      targetUserId: membership.userId,
    });
    return updated;
  }

  async respondToInvitation(
    rawToken: string,
    userId: string,
    accept: boolean,
  ): Promise<EventMembership> {
    const tokenHash = sha256Hex(rawToken);
    const membership = await this.prisma.eventMembership.findUnique({
      where: { invitationTokenHash: tokenHash },
    });

    // Same generic error whether the token is unknown or belongs to a
    // different user — never reveal that a token was valid but
    // addressed to someone else.
    if (!membership || membership.userId !== userId) {
      throw new UnauthorizedException({
        code: 'INVALID_INVITATION_TOKEN',
        message: 'This invitation link is invalid.',
      });
    }

    const current = await this.expireIfPastDeadline(membership);
    if (current.invitationStatus === 'EXPIRED') {
      throw new BadRequestException({
        code: 'INVITATION_EXPIRED',
        message: 'This invitation has expired.',
      });
    }
    if (current.invitationStatus !== 'PENDING') {
      throw new BadRequestException({
        code: 'INVITATION_ALREADY_RESOLVED',
        message: 'This invitation has already been responded to.',
      });
    }

    const updated = await this.prisma.eventMembership.update({
      where: { id: membership.id },
      data: {
        invitationStatus: accept ? 'ACCEPTED' : 'DECLINED',
        respondedAt: new Date(),
      },
    });

    await this.audit.record(
      userId,
      accept ? 'JUDGE_INVITATION_ACCEPTED' : 'JUDGE_INVITATION_DECLINED',
      { eventId: membership.eventId, membershipId: membership.id },
    );

    return updated;
  }

  // A real, enforced state transition checked server-side against
  // event.eventStartsAt (Section 3.2) — not just a UI label. Called
  // lazily wherever a PENDING judge membership is about to be read or
  // acted on, rather than via a background job.
  async expireIfPastDeadline(
    membership: EventMembership,
  ): Promise<EventMembership> {
    if (membership.invitationStatus !== 'PENDING') {
      return membership;
    }
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: membership.eventId },
    });
    if (Date.now() <= event.eventStartsAt.getTime()) {
      return membership;
    }
    return this.prisma.eventMembership.update({
      where: { id: membership.id },
      data: { invitationStatus: 'EXPIRED' },
    });
  }

  private async expireStalePendingJudgeInvitations(
    eventId: string,
  ): Promise<void> {
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    if (Date.now() <= event.eventStartsAt.getTime()) {
      return;
    }
    await this.prisma.eventMembership.updateMany({
      where: { eventId, role: 'JUDGE', invitationStatus: 'PENDING' },
      data: { invitationStatus: 'EXPIRED' },
    });
  }

  // Organizer/admin-facing invitation dashboard (Section 3.2).
  async listJudgeInvitations(eventId: string) {
    await this.expireStalePendingJudgeInvitations(eventId);
    return this.prisma.eventMembership.findMany({
      where: { eventId, role: 'JUDGE' },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Shared by inviteJudgeDirect (first invite) and resendInvitation
  // (re-invite) — one code path issues/refreshes a token, same
  // invalidate-old-issue-new pattern as every other token in this
  // project. Resets the response clock implicitly: a DECLINED/EXPIRED
  // row goes back to PENDING with a clean respondedAt, still bounded by
  // the same live event.eventStartsAt deadline.
  private async issueInvitationToken(
    membershipId: string,
    actingUserId: string,
  ): Promise<{ membership: EventMembership; rawToken: string }> {
    const rawToken = generateRawToken();
    const invitationTokenHash = sha256Hex(rawToken);
    const membership = await this.prisma.eventMembership.update({
      where: { id: membershipId },
      data: {
        invitationStatus: 'PENDING',
        invitedByUserId: actingUserId,
        invitedAt: new Date(),
        respondedAt: null,
        invitationTokenHash,
      },
    });
    return { membership, rawToken };
  }

  private async sendInvitationEmail(
    email: string,
    rawToken: string,
  ): Promise<void> {
    const webUrl = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
    const link = `${webUrl}/invitations/respond?token=${rawToken}`;

    if (!this.mail.isConfigured()) {
      this.logger.warn(
        `SMTP not configured — judge invitation email to ${email} not sent (link: ${link})`,
      );
      return;
    }

    try {
      await this.mail.sendMail(
        email,
        'You have been invited to judge a Raptor event',
        `You've been invited to judge an event. Respond here: ${link}`,
      );
    } catch (err) {
      this.logger.warn(
        `Judge invitation email failed for ${email}: ${(err as Error).message}`,
      );
    }
  }
}
