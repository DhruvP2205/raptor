import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { sha256Hex } from '../common/crypto.util';
import { MembershipService } from './membership.service';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    event: {
      findUniqueOrThrow: jest.fn(),
    },
    eventMembership: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function makeAudit() {
  return { record: jest.fn() };
}

function makeMail() {
  return { isConfigured: jest.fn().mockReturnValue(false), sendMail: jest.fn() };
}

describe('MembershipService', () => {
  describe('assertAccountTypeMatchesRole', () => {
    it('rejects a PARTICIPANT-track account from ever holding a JUDGE/ORGANIZER membership', () => {
      const service = new MembershipService(
        makePrisma() as any,
        makeAudit() as any,
        makeMail() as any,
      );
      expect(() =>
        service.assertAccountTypeMatchesRole('PARTICIPANT' as any, 'ORGANIZER'),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertAccountTypeMatchesRole('PARTICIPANT' as any, 'JUDGE'),
      ).toThrow(ForbiddenException);
    });

    it('allows a matching account type through', () => {
      const service = new MembershipService(
        makePrisma() as any,
        makeAudit() as any,
        makeMail() as any,
      );
      expect(() =>
        service.assertAccountTypeMatchesRole('ORGANIZER' as any, 'ORGANIZER'),
      ).not.toThrow();
    });
  });

  describe('createOrganizerMembership', () => {
    it('creates an immediately-ACCEPTED row, no intermediate state', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.create.mockResolvedValue({ id: 'm1', invitationStatus: 'ACCEPTED' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await service.createOrganizerMembership('event-1', 'user-1', 'ORGANIZER' as any, null);

      expect(prisma.eventMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          role: 'ORGANIZER',
          invitationStatus: 'ACCEPTED',
          invitedByUserId: null,
          invitedAt: null,
        }),
      });
    });
  });

  describe('addOrganizerDirect', () => {
    it('rejects when no organizer-track account exists with that email', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.addOrganizerDirect('event-1', 'actor-1', 'nobody@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a target whose account type is not ORGANIZER', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', accountType: 'JUDGE' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.addOrganizerDirect('event-1', 'actor-1', 'judge@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects if the target already has any membership on this event', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', accountType: 'ORGANIZER' });
      prisma.eventMembership.findUnique.mockResolvedValue({ id: 'existing' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.addOrganizerDirect('event-1', 'actor-1', 'org@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('inviteJudgeDirect', () => {
    it('rejects when no judge-track account exists with that email', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', accountType: 'PARTICIPANT' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.inviteJudgeDirect('event-1', 'actor-1', 'participant@example.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects re-inviting a judge who already ACCEPTED', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'j@example.com', accountType: 'JUDGE' });
      prisma.eventMembership.findUnique.mockResolvedValue({ id: 'm1', invitationStatus: 'ACCEPTED' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.inviteJudgeDirect('event-1', 'actor-1', 'j@example.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a fresh PENDING row with a hashed token when none exists', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'j@example.com', accountType: 'JUDGE' });
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      prisma.eventMembership.create.mockResolvedValue({ id: 'm1' });
      prisma.eventMembership.update.mockResolvedValue({ id: 'm1', invitationStatus: 'PENDING' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await service.inviteJudgeDirect('event-1', 'actor-1', 'j@example.com');

      expect(prisma.eventMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventId: 'event-1', userId: 'u2', role: 'JUDGE', invitationStatus: 'PENDING' }),
      });
      expect(prisma.eventMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm1' },
          data: expect.objectContaining({ invitationStatus: 'PENDING', invitedByUserId: 'actor-1' }),
        }),
      );
    });
  });

  describe('resendInvitation', () => {
    it('rejects a membership that belongs to a different event (cross-event isolation)', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue({ id: 'm1', eventId: 'event-OTHER', role: 'JUDGE' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.resendInvitation('event-1', 'm1', 'actor-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects resending an already-ACCEPTED invitation', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue({ id: 'm1', eventId: 'event-1', role: 'JUDGE', invitationStatus: 'ACCEPTED' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.resendInvitation('event-1', 'm1', 'actor-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('overwrites invitationTokenHash and resets status/response state on resend', async () => {
      // The DB-level guarantee that the OLD raw token stops resolving
      // is structural (invitationTokenHash is the single column a
      // lookup matches against, and this overwrites it) rather than
      // something mockable meaningfully here — proved for real against
      // a live database instead (see docs/DECISIONS.md).
      const prisma = makePrisma();
      const membership = { id: 'm1', eventId: 'event-1', userId: 'u2', role: 'JUDGE', invitationStatus: 'EXPIRED' };
      prisma.eventMembership.findUnique.mockResolvedValue(membership);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u2', email: 'j@example.com' });
      prisma.eventMembership.update.mockResolvedValue({ ...membership, invitationStatus: 'PENDING' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await service.resendInvitation('event-1', 'm1', 'actor-1');

      expect(prisma.eventMembership.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({
          invitationStatus: 'PENDING',
          invitedByUserId: 'actor-1',
          respondedAt: null,
          invitationTokenHash: expect.any(String),
        }),
      });
    });
  });

  describe('respondToInvitation', () => {
    it('rejects an unknown token', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.respondToInvitation('bogus', 'u2', true),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token that belongs to a different user, identically to an unknown token', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue({ id: 'm1', userId: 'someone-else', invitationStatus: 'PENDING' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.respondToInvitation('token', 'u2', true),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects accept/decline once the deadline has passed, flipping the row to EXPIRED', async () => {
      const prisma = makePrisma();
      const membership = { id: 'm1', eventId: 'event-1', userId: 'u2', invitationStatus: 'PENDING' };
      prisma.eventMembership.findUnique.mockResolvedValue(membership);
      prisma.event.findUniqueOrThrow.mockResolvedValue({ eventStartsAt: new Date(Date.now() - 1000) });
      prisma.eventMembership.update.mockResolvedValue({ ...membership, invitationStatus: 'EXPIRED' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.respondToInvitation('token', 'u2', true),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.eventMembership.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { invitationStatus: 'EXPIRED' },
      });
    });

    it('rejects responding to an invitation that was already resolved', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue({ id: 'm1', eventId: 'event-1', userId: 'u2', invitationStatus: 'DECLINED' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      await expect(
        service.respondToInvitation('token', 'u2', true),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a valid, unexpired, still-PENDING invitation', async () => {
      const prisma = makePrisma();
      const membership = { id: 'm1', eventId: 'event-1', userId: 'u2', invitationStatus: 'PENDING' };
      prisma.eventMembership.findUnique.mockResolvedValue(membership);
      prisma.event.findUniqueOrThrow.mockResolvedValue({ eventStartsAt: new Date(Date.now() + 1000 * 60 * 60) });
      prisma.eventMembership.update.mockResolvedValue({ ...membership, invitationStatus: 'ACCEPTED' });
      const audit = makeAudit();
      const service = new MembershipService(prisma as any, audit as any, makeMail() as any);

      const result = await service.respondToInvitation('token', 'u2', true);

      expect(result.invitationStatus).toBe('ACCEPTED');
      expect(audit.record).toHaveBeenCalledWith('u2', 'JUDGE_INVITATION_ACCEPTED', expect.any(Object));
    });
  });

  describe('expireIfPastDeadline', () => {
    it('leaves a non-PENDING membership untouched without even looking up the event', async () => {
      const prisma = makePrisma();
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      const result = await service.expireIfPastDeadline({ invitationStatus: 'ACCEPTED' } as any);

      expect(result.invitationStatus).toBe('ACCEPTED');
      expect(prisma.event.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('leaves a PENDING membership untouched before the deadline', async () => {
      const prisma = makePrisma();
      prisma.event.findUniqueOrThrow.mockResolvedValue({ eventStartsAt: new Date(Date.now() + 1000 * 60 * 60) });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      const result = await service.expireIfPastDeadline({ eventId: 'event-1', invitationStatus: 'PENDING' } as any);

      expect(result.invitationStatus).toBe('PENDING');
      expect(prisma.eventMembership.update).not.toHaveBeenCalled();
    });

    it('flips a PENDING membership to EXPIRED once the deadline has passed', async () => {
      const prisma = makePrisma();
      prisma.event.findUniqueOrThrow.mockResolvedValue({ eventStartsAt: new Date(Date.now() - 1000) });
      prisma.eventMembership.update.mockResolvedValue({ invitationStatus: 'EXPIRED' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      const result = await service.expireIfPastDeadline({ id: 'm1', eventId: 'event-1', invitationStatus: 'PENDING' } as any);

      expect(result.invitationStatus).toBe('EXPIRED');
    });
  });

  // Regression guard for the invitationTokenHash leak: every method a
  // controller calls directly must never return it, even though it's
  // stored in the row. See docs/DECISIONS.md.
  describe('invitationTokenHash is never returned to a caller', () => {
    it('addOrganizerDirect', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', accountType: 'ORGANIZER' });
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      prisma.eventMembership.create.mockResolvedValue({ id: 'm1', invitationTokenHash: 'secret-hash' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      const result = await service.addOrganizerDirect('event-1', 'actor-1', 'org@example.com');
      expect(result).not.toHaveProperty('invitationTokenHash');
    });

    it('inviteJudgeDirect', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'j@example.com', accountType: 'JUDGE' });
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      prisma.eventMembership.create.mockResolvedValue({ id: 'm1' });
      prisma.eventMembership.update.mockResolvedValue({ id: 'm1', invitationTokenHash: 'secret-hash' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      const result = await service.inviteJudgeDirect('event-1', 'actor-1', 'j@example.com');
      expect(result).not.toHaveProperty('invitationTokenHash');
    });

    it('resendInvitation', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue({ id: 'm1', eventId: 'event-1', role: 'JUDGE', invitationStatus: 'PENDING' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u2', email: 'j@example.com' });
      prisma.eventMembership.update.mockResolvedValue({ id: 'm1', invitationTokenHash: 'secret-hash' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      const result = await service.resendInvitation('event-1', 'm1', 'actor-1');
      expect(result).not.toHaveProperty('invitationTokenHash');
    });

    it('respondToInvitation', async () => {
      const prisma = makePrisma();
      const membership = { id: 'm1', eventId: 'event-1', userId: 'u2', invitationStatus: 'PENDING' };
      prisma.eventMembership.findUnique.mockResolvedValue(membership);
      prisma.event.findUniqueOrThrow.mockResolvedValue({ eventStartsAt: new Date(Date.now() + 1000 * 60 * 60) });
      prisma.eventMembership.update.mockResolvedValue({ ...membership, invitationStatus: 'ACCEPTED', invitationTokenHash: 'secret-hash' });
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      const result = await service.respondToInvitation('token', 'u2', true);
      expect(result).not.toHaveProperty('invitationTokenHash');
    });

    it('listJudgeInvitations', async () => {
      const prisma = makePrisma();
      prisma.event.findUniqueOrThrow.mockResolvedValue({ eventStartsAt: new Date(Date.now() + 1000 * 60 * 60) });
      prisma.eventMembership.findMany.mockResolvedValue([
        { id: 'm1', invitationTokenHash: 'secret-hash-1', user: { id: 'u1', email: 'a@example.com', displayName: 'A' } },
        { id: 'm2', invitationTokenHash: 'secret-hash-2', user: { id: 'u2', email: 'b@example.com', displayName: 'B' } },
      ]);
      const service = new MembershipService(prisma as any, makeAudit() as any, makeMail() as any);

      const result = await service.listJudgeInvitations('event-1');
      expect(result).toHaveLength(2);
      for (const row of result) {
        expect(row).not.toHaveProperty('invitationTokenHash');
      }
      // The nested user object (a legitimate, intentional field) must
      // survive the sanitization untouched.
      expect(result[0].user).toEqual({ id: 'u1', email: 'a@example.com', displayName: 'A' });
    });
  });
});

describe('sha256Hex sanity (used for invitation tokens)', () => {
  it('is deterministic', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
  });
});
