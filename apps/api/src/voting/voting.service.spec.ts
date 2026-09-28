import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VotingService } from './voting.service';

function makePrisma() {
  return {
    event: { findUnique: jest.fn(), update: jest.fn() },
    votingRound: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    shortlistEntry: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), createMany: jest.fn(), count: jest.fn().mockResolvedValue(0), update: jest.fn() },
    vote: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    voteAbuseFlag: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    eventMembership: { findUnique: jest.fn() },
    normalizationRun: { findFirst: jest.fn() },
    normalizedScore: { findMany: jest.fn().mockResolvedValue([]) },
    submission: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    publishedResultVersion: { findFirst: jest.fn() },
    $transaction: jest.fn((ops: any) => Promise.all(ops)),
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

function makePowCaptcha(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    issuePowChallenge: jest.fn(),
    issueCaptchaChallenge: jest.fn(),
    verifyAndConsumePow: jest.fn().mockResolvedValue(true),
    verifyAndConsumeCaptcha: jest.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

const EVENT_BASE = {
  id: 'event-1',
  eventStartsAt: new Date('2027-01-05T00:00:00Z'),
  resultsAnnounceAt: new Date('2027-02-01T00:00:00Z'),
  eventClosedAt: new Date('2027-03-01T00:00:00Z'),
  votingEligibilityMode: 'VERIFIED_PLATFORM_USERS',
  votingOpensAt: new Date('2027-01-20T00:00:00Z'),
  votingClosesAt: new Date('2027-01-25T00:00:00Z'),
  votingWinnerAnnounceAt: new Date('2027-01-27T00:00:00Z'),
};

const ROUND_BASE = {
  id: 'round-1',
  eventId: 'event-1',
  roundNumber: 1,
  status: 'ACTIVE',
  votingOpensAt: EVENT_BASE.votingOpensAt,
  votingClosesAt: EVENT_BASE.votingClosesAt,
  votingWinnerAnnounceAt: EVENT_BASE.votingWinnerAnnounceAt,
};

// A voter old enough (createdAt before eventStartsAt) and verified.
const VOTER_OK = { id: 'voter-1', createdAt: new Date('2026-12-01T00:00:00Z'), emailVerifiedAt: new Date() };
const NOW_DURING_VOTING = EVENT_BASE.votingOpensAt.getTime() + 1000 * 60 * 60;

describe('VotingService', () => {
  describe('castVote — account-age gate (Section 2, D44)', () => {
    it('rejects a voter created on/after eventStartsAt, regardless of eligibility mode', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      const tooNew = { id: 'voter-2', createdAt: EVENT_BASE.eventStartsAt, emailVerifiedAt: new Date() };
      await expect(
        service.castVote('event-1', tooNew, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.vote.create).not.toHaveBeenCalled();
    });
  });

  describe('castVote — eligibility mode (Section 2)', () => {
    it('PARTICIPANTS_ONLY rejects a verified but non-participant user', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT_BASE, votingEligibilityMode: 'PARTICIPANTS_ONLY' });
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('PARTICIPANTS_ONLY accepts an ACCEPTED PARTICIPANT membership and proceeds to the round/shortlist checks', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT_BASE, votingEligibilityMode: 'PARTICIPANTS_ONLY' });
      prisma.eventMembership.findUnique.mockResolvedValue({ role: 'PARTICIPANT', invitationStatus: 'ACCEPTED' });
      prisma.votingRound.findFirst.mockResolvedValue(null); // no active round -> distinct failure past eligibility
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toBeInstanceOf(NotFoundException); // NO_ACTIVE_ROUND, proving eligibility passed
    });

    it('VERIFIED_PLATFORM_USERS rejects a user with no emailVerifiedAt', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ id: 'voter-1', emailVerifiedAt: null });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('castVote — timing and shortlist membership', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW_DURING_VOTING);
    });
    afterEach(() => jest.useRealTimers());

    it('rejects a vote cast before votingOpensAt', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      prisma.votingRound.findFirst.mockResolvedValue({ ...ROUND_BASE, votingOpensAt: new Date(NOW_DURING_VOTING + 1000) });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toThrow(/not opened yet/i);
    });

    it('rejects a vote cast after votingClosesAt', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      prisma.votingRound.findFirst.mockResolvedValue({ ...ROUND_BASE, votingClosesAt: new Date(NOW_DURING_VOTING - 1000) });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toThrow(/closed/i);
    });

    it('rejects a submissionId not on the current shortlist', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      prisma.shortlistEntry.findFirst.mockResolvedValue(null);
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.vote.create).not.toHaveBeenCalled();
    });

    it('rejects when the PoW challenge fails verification', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      prisma.shortlistEntry.findFirst.mockResolvedValue({ id: 'se-1' });
      const powCaptcha = makePowCaptcha({ verifyAndConsumePow: jest.fn().mockResolvedValue(false) });
      const service = new VotingService(prisma, makeAudit() as any, powCaptcha);

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.vote.create).not.toHaveBeenCalled();
    });
  });

  describe('castVote — one vote per (round, user) (Section 3)', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW_DURING_VOTING);
    });
    afterEach(() => jest.useRealTimers());

    it('rejects a second vote in the same round with ALREADY_VOTED, mapped from the DB unique-constraint race', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      prisma.shortlistEntry.findFirst.mockResolvedValue({ id: 'se-1' });
      prisma.vote.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique constraint', { code: 'P2002', clientVersion: '5.22.0' }),
      );
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('castVote — adaptive CAPTCHA + IP abuse flagging (Section 5)', () => {
    const ORIGINAL_APP_SECRET = process.env.APP_SECRET;

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW_DURING_VOTING);
      // These tests exercise the IP-based abuse check, which is a
      // no-op (ipHash stays null) with no APP_SECRET configured — same
      // precedent as session.service.spec.ts's own ipHash tests.
      process.env.APP_SECRET = 'test-secret';
    });
    afterEach(() => {
      jest.useRealTimers();
      if (ORIGINAL_APP_SECRET === undefined) delete process.env.APP_SECRET;
      else process.env.APP_SECRET = ORIGINAL_APP_SECRET;
    });

    it('never requires CAPTCHA below the abuse threshold', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      prisma.shortlistEntry.findFirst.mockResolvedValue({ id: 'se-1' });
      prisma.vote.findMany.mockResolvedValue([]); // zero prior voters from this IP
      const powCaptcha = makePowCaptcha();
      const service = new VotingService(prisma, makeAudit() as any, powCaptcha);

      await service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' });

      expect(powCaptcha.verifyAndConsumeCaptcha).not.toHaveBeenCalled();
      expect(prisma.vote.create).toHaveBeenCalled();
    });

    it('requires CAPTCHA once prior distinct voters from this IP hit the threshold, and rejects with CAPTCHA_REQUIRED if absent', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      prisma.shortlistEntry.findFirst.mockResolvedValue({ id: 'se-1' });
      prisma.vote.findMany.mockResolvedValue([{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }]); // at threshold (3)
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.castVote('event-1', VOTER_OK, { ip: '1.2.3.4' }, { submissionId: 's1', powChallengeId: 'c', powNonce: 'n' }),
      ).rejects.toThrow(/CAPTCHA/i);
      expect(prisma.vote.create).not.toHaveBeenCalled();
    });

    it('accepts once a correct CAPTCHA is supplied above threshold, still records and counts the vote (never auto-blocked, D47)', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      prisma.shortlistEntry.findFirst.mockResolvedValue({ id: 'se-1' });
      prisma.vote.findMany.mockResolvedValue([{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }]);
      prisma.voteAbuseFlag.findUnique.mockResolvedValue(null);
      prisma.voteAbuseFlag.create.mockResolvedValue({
        id: 'flag-1',
        status: 'PENDING',
        implicatedUserIds: ['a', 'b', 'c', VOTER_OK.id],
      });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      const result = await service.castVote(
        'event-1',
        VOTER_OK,
        { ip: '1.2.3.4' },
        { submissionId: 's1', powChallengeId: 'c', powNonce: 'n', captchaChallengeId: 'cc', captchaAnswer: 'ABC123' },
      );

      expect(result).toEqual({ ok: true });
      expect(prisma.vote.create).toHaveBeenCalled();
      // Crossing the threshold creates a PENDING abuse flag for admin
      // review — never blocks the vote itself.
      expect(prisma.voteAbuseFlag.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
      );
    });
  });

  describe('setEligibilityMode / createInitialRound (Section 2/7)', () => {
    it('locks the eligibility mode once any round exists', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.setEligibilityMode('event-1', 'organizer-1', { mode: 'PARTICIPANTS_ONLY' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('rejects creating round 1 before an eligibility mode is set', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT_BASE, votingEligibilityMode: null });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(service.createInitialRound('event-1', 'organizer-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.votingRound.create).not.toHaveBeenCalled();
    });
  });

  describe('restartRound (Section 7)', () => {
    it('rejects outside the [resultsAnnounceAt, eventClosedAt] window', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE); // now (real clock) is well before resultsAnnounceAt (2027)
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.restartRound('event-1', 'organizer-1', {
          reason: 'wrong shortlist',
          votingOpensAt: '2027-02-05T00:00:00Z',
          votingClosesAt: '2027-02-10T00:00:00Z',
          votingWinnerAnnounceAt: '2027-02-12T00:00:00Z',
        }),
      ).rejects.toThrow(/restart/i);
    });

    it('deactivates the current round (with reason) and creates a fresh, blank round+1 inside the window', async () => {
      const prisma = makePrisma();
      const insideWindow = EVENT_BASE.resultsAnnounceAt.getTime() + 1000 * 60 * 60;
      jest.useFakeTimers().setSystemTime(insideWindow);
      prisma.event.findUnique.mockResolvedValue(EVENT_BASE);
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      prisma.votingRound.update.mockImplementation((args: any) => Promise.resolve({ ...ROUND_BASE, ...args.data }));
      prisma.votingRound.create.mockImplementation((args: any) => Promise.resolve({ id: 'round-2', ...args.data }));
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      const restarted = await service.restartRound('event-1', 'organizer-1', {
        reason: 'ballot swap error',
        votingOpensAt: '2027-02-05T00:00:00Z',
        votingClosesAt: '2027-02-10T00:00:00Z',
        votingWinnerAnnounceAt: '2027-02-12T00:00:00Z',
      });

      expect(restarted).toEqual(expect.objectContaining({ roundNumber: 2, status: 'ACTIVE' }));
      expect(prisma.votingRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ROUND_BASE.id },
          data: expect.objectContaining({ status: 'DEACTIVATED', deactivationReason: 'ballot swap error' }),
        }),
      );
      jest.useRealTimers();
    });
  });

  describe('correctShortlistEntry (Section 6 — never touches Vote rows)', () => {
    it('updates only the shortlist entry, and never calls into vote/tally tables', async () => {
      const prisma = makePrisma();
      prisma.votingRound.findUnique.mockResolvedValue(ROUND_BASE);
      prisma.shortlistEntry.findUnique.mockResolvedValue({ id: 'se-1', votingRoundId: 'round-1', submissionId: 's-old' });
      prisma.submission.findUnique.mockResolvedValue({ id: 's-new', eventId: 'event-1' });
      prisma.shortlistEntry.update.mockResolvedValue({ id: 'se-1', submissionId: 's-new' });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await service.correctShortlistEntry('event-1', 'round-1', 'se-1', 'organizer-1', {
        newSubmissionId: 's-new',
        reason: 'wrong project linked',
      });

      expect(prisma.shortlistEntry.update).toHaveBeenCalledWith({
        where: { id: 'se-1' },
        data: { submissionId: 's-new' },
      });
      expect(prisma.vote.create).not.toHaveBeenCalled();
      expect(prisma.vote.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getPublicShortlist (Section 4 — reveal gate)', () => {
    it('reveals nothing when no LIVE PublishedResultVersion exists, even if votingOpensAt has passed', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findFirst.mockResolvedValue(null);
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      const result = await service.getPublicShortlist('event-1');

      expect(result).toBeNull();
      expect(prisma.votingRound.findFirst).not.toHaveBeenCalled();
    });

    it('reveals the current round\'s shortlist once a LIVE PublishedResultVersion exists', async () => {
      const prisma = makePrisma();
      prisma.publishedResultVersion.findFirst.mockResolvedValue({ id: 'v1', status: 'LIVE' });
      prisma.votingRound.findFirst.mockResolvedValue(ROUND_BASE);
      prisma.shortlistEntry.findMany.mockResolvedValue([{ id: 'se-1', submissionId: 's1' }]);
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      const result = await service.getPublicShortlist('event-1');

      expect(result).toEqual(expect.objectContaining({ roundId: 'round-1', roundNumber: 1 }));
    });
  });

  describe('computeTally — tie-share (Section 9, D142)', () => {
    it('marks every entry tied for the top vote count as isSharedWin, and no others', async () => {
      const prisma = makePrisma();
      prisma.shortlistEntry.findMany.mockResolvedValue([{ submissionId: 'a' }, { submissionId: 'b' }, { submissionId: 'c' }]);
      prisma.vote.findMany.mockResolvedValue([
        { submissionId: 'a' }, { submissionId: 'a' },
        { submissionId: 'b' }, { submissionId: 'b' },
        { submissionId: 'c' },
      ]);
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      const tally = await service.computeTally('round-1');

      const bySubmission = Object.fromEntries(tally.map((t) => [t.submissionId, t]));
      expect(bySubmission.a.isSharedWin).toBe(true);
      expect(bySubmission.b.isSharedWin).toBe(true);
      expect(bySubmission.c.isSharedWin).toBe(false);
      expect(bySubmission.c.voteCount).toBe(1);
    });

    it('marks nobody as isSharedWin when the round has zero votes', async () => {
      const prisma = makePrisma();
      prisma.shortlistEntry.findMany.mockResolvedValue([{ submissionId: 'a' }, { submissionId: 'b' }]);
      prisma.vote.findMany.mockResolvedValue([]);
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      const tally = await service.computeTally('round-1');

      expect(tally.every((t) => !t.isSharedWin)).toBe(true);
    });
  });

  describe('reviewAbuseFlag (Section 5.3 — never automatic)', () => {
    it('CLEAR marks the flag reviewed without banning anyone', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1' });
      prisma.voteAbuseFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        status: 'PENDING',
        implicatedUserIds: ['u1', 'u2'],
        votingRound: { eventId: 'event-1' },
      });
      prisma.voteAbuseFlag.update.mockResolvedValue({ id: 'flag-1', status: 'REVIEWED_CLEARED' });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await service.reviewAbuseFlag('event-1', 'flag-1', 'admin-1', { action: 'CLEAR' });

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('BAN sets bannedAt/bannedReason on the implicated accounts (D48) and records who reviewed it', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1' });
      prisma.voteAbuseFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        status: 'PENDING',
        implicatedUserIds: ['u1', 'u2'],
        votingRound: { eventId: 'event-1' },
      });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await service.reviewAbuseFlag('event-1', 'flag-1', 'admin-1', { action: 'BAN', banReason: 'confirmed multi-account' });

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['u1', 'u2'] } },
        data: { bannedAt: expect.any(Date), bannedReason: 'confirmed multi-account' },
      });
    });

    it('rejects reviewing an already-reviewed flag', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1' });
      prisma.voteAbuseFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        status: 'REVIEWED_CLEARED',
        implicatedUserIds: [],
        votingRound: { eventId: 'event-1' },
      });
      const service = new VotingService(prisma, makeAudit() as any, makePowCaptcha());

      await expect(
        service.reviewAbuseFlag('event-1', 'flag-1', 'admin-1', { action: 'CLEAR' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
