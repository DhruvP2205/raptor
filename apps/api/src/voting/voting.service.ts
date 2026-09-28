import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Event, type VotingRound } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashIpOrNull } from '../common/ip-hash.util';
import { PrismaService } from '../prisma/prisma.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CorrectShortlistEntryDto } from './dto/correct-shortlist-entry.dto';
import { FinalizeShortlistDto } from './dto/finalize-shortlist.dto';
import { RestartRoundDto } from './dto/restart-round.dto';
import { ReviewAbuseFlagDto } from './dto/review-abuse-flag.dto';
import { SetEligibilityModeDto } from './dto/set-eligibility-mode.dto';
import { PowCaptchaService } from './pow-captcha.service';

// Threshold above which a vote's abuse-signal score is "already
// elevated" (Section 5.1/5.2, docs/stages/11-voting.md) — crossing this
// many distinct voters from the same ipHash in one round both (a)
// flags the vote/accounts for admin review and (b) requires the
// adaptive visible CAPTCHA on this and subsequent votes from that IP in
// this round. Not stated as a fixed number by the doc ("a configurable
// threshold") — env-configurable, defaulting to 3 (two legitimate
// voters sharing a NAT/campus IP is common; a third starts looking like
// more than coincidence).
const ABUSE_IP_THRESHOLD = Number(process.env.VOTE_ABUSE_IP_THRESHOLD ?? 3);

interface TallyEntry {
  submissionId: string;
  voteCount: number;
  votePercentage: number;
  isSharedWin: boolean;
}

// Module 11 (Voting) — see docs/stages/11-voting.md. Rounds, shortlist
// curation, vote casting with anti-abuse checks, and abuse-flag review.
// VotingResultsService (separate file) owns the publish/correction
// lifecycle on top of this service's tally computation, mirroring how
// Module 10 split nothing but keeping this file from growing past a
// reasonable size.
@Injectable()
export class VotingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly powCaptcha: PowCaptchaService,
  ) {}

  // --- Eligibility mode (Section 2) ---

  async setEligibilityMode(eventId: string, userId: string, dto: SetEligibilityModeDto) {
    const event = await this.getEventOrThrow(eventId);
    const existingRound = await this.prisma.votingRound.findFirst({ where: { eventId } });
    if (existingRound) {
      throw new BadRequestException({
        code: 'ELIGIBILITY_MODE_LOCKED',
        message: 'Voting eligibility mode can no longer be changed once round 1 has been created.',
      });
    }

    const updated = await this.prisma.event.update({
      where: { id: event.id },
      data: { votingEligibilityMode: dto.mode },
    });

    await this.audit.record(userId, 'VOTING_ELIGIBILITY_MODE_SET', { eventId, mode: dto.mode });
    return { votingEligibilityMode: updated.votingEligibilityMode };
  }

  // --- Rounds (Section 7/10) ---

  async createInitialRound(eventId: string, userId: string) {
    const event = await this.getEventOrThrow(eventId);
    if (!event.votingEligibilityMode) {
      throw new BadRequestException({
        code: 'ELIGIBILITY_MODE_NOT_SET',
        message: 'Set the voting eligibility mode before creating round 1.',
      });
    }
    const existingRound = await this.prisma.votingRound.findFirst({ where: { eventId } });
    if (existingRound) {
      throw new BadRequestException({
        code: 'ROUND_ALREADY_EXISTS',
        message: 'Round 1 already exists for this event — use the restart flow for a fresh round.',
      });
    }

    const round = await this.prisma.votingRound.create({
      data: {
        eventId,
        roundNumber: 1,
        status: 'ACTIVE',
        votingOpensAt: event.votingOpensAt,
        votingClosesAt: event.votingClosesAt,
        votingWinnerAnnounceAt: event.votingWinnerAnnounceAt,
        createdByUserId: userId,
      },
    });

    await this.audit.record(userId, 'VOTING_ROUND_CREATED', { eventId, roundId: round.id, roundNumber: 1 });
    return round;
  }

  async getCurrentRound(eventId: string) {
    await this.getEventOrThrow(eventId);
    const round = await this.prisma.votingRound.findFirst({
      where: { eventId, status: 'ACTIVE' },
      orderBy: { roundNumber: 'desc' },
    });
    if (!round) {
      throw new NotFoundException({ code: 'NO_ACTIVE_ROUND', message: 'No active voting round for this event.' });
    }
    return round;
  }

  // Section 7 — only actionable between resultsAnnounceAt and
  // eventClosedAt (D49); deactivates the current round (mandatory
  // reason), creates a fresh round+1 from scratch (blank shortlist,
  // fresh organizer-set timeline values — never pre-populated from the
  // dead round). No limit on number of restarts.
  async restartRound(eventId: string, userId: string, dto: RestartRoundDto) {
    const event = await this.getEventOrThrow(eventId);
    const now = Date.now();
    if (now < event.resultsAnnounceAt.getTime() || now > event.eventClosedAt.getTime()) {
      throw new BadRequestException({
        code: 'RESTART_WINDOW_CLOSED',
        message: 'A full round restart is only actionable between resultsAnnounceAt and eventClosedAt.',
      });
    }

    const current = await this.getCurrentRound(eventId);

    const votingOpensAt = new Date(dto.votingOpensAt);
    const votingClosesAt = new Date(dto.votingClosesAt);
    const votingWinnerAnnounceAt = new Date(dto.votingWinnerAnnounceAt);
    if (!(votingOpensAt.getTime() < votingClosesAt.getTime() && votingClosesAt.getTime() < votingWinnerAnnounceAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_ROUND_TIMELINE',
        message: 'votingOpensAt must be strictly before votingClosesAt, which must be strictly before votingWinnerAnnounceAt.',
      });
    }

    const [, newRound] = await this.prisma.$transaction([
      this.prisma.votingRound.update({
        where: { id: current.id },
        data: {
          status: 'DEACTIVATED',
          deactivatedAt: new Date(),
          deactivatedByUserId: userId,
          deactivationReason: dto.reason,
        },
      }),
      this.prisma.votingRound.create({
        data: {
          eventId,
          roundNumber: current.roundNumber + 1,
          status: 'ACTIVE',
          votingOpensAt,
          votingClosesAt,
          votingWinnerAnnounceAt,
          createdByUserId: userId,
        },
      }),
    ]);

    await this.audit.record(userId, 'VOTING_ROUND_RESTARTED', {
      eventId,
      deactivatedRoundId: current.id,
      deactivatedRoundNumber: current.roundNumber,
      newRoundId: newRound.id,
      newRoundNumber: newRound.roundNumber,
      reason: dto.reason,
    });

    return newRound;
  }

  // --- Shortlist (Section 4/6) ---

  // Computed fresh, never persisted — the organizer freely adjusts
  // before calling finalizeShortlist. Reuses the same APPROVED-only
  // gate and NormalizedScore.finalScore ordering Module 10 uses.
  async getShortlistSuggestions(eventId: string, normalizationRunId?: string) {
    await this.getEventOrThrow(eventId);

    let runId = normalizationRunId;
    if (!runId) {
      const mostRecent = await this.prisma.normalizationRun.findFirst({
        where: { eventId },
        orderBy: { runAt: 'desc' },
      });
      if (!mostRecent) {
        throw new BadRequestException({
          code: 'NO_NORMALIZATION_RUN',
          message: 'Run normalization at least once before building a shortlist.',
        });
      }
      runId = mostRecent.id;
    }

    const scores = await this.prisma.normalizedScore.findMany({
      where: { normalizationRunId: runId },
      orderBy: { rank: 'asc' },
      include: { submission: { select: { id: true, title: true, verification: true } } },
    });

    return scores
      .filter((s) => s.submission.verification?.finalDecision === 'APPROVED')
      .map((s) => ({
        submissionId: s.submissionId,
        title: s.submission.title,
        finalScore: s.finalScore,
        rank: s.rank,
      }));
  }

  // Locked once finalized — rejected if the round already has any
  // entries (Section 4's "locked once finalized for round 1," generalized
  // to any round). Corrections afterward go through correctShortlistEntry
  // or a full restart.
  async finalizeShortlist(eventId: string, roundId: string, userId: string, dto: FinalizeShortlistDto) {
    const round = await this.getRoundOrThrow(eventId, roundId);
    const existingCount = await this.prisma.shortlistEntry.count({ where: { votingRoundId: round.id } });
    if (existingCount > 0) {
      throw new BadRequestException({
        code: 'SHORTLIST_ALREADY_FINALIZED',
        message: 'This round\'s shortlist is already finalized — use corrections or a full restart instead.',
      });
    }

    const submissions = await this.prisma.submission.findMany({
      where: { id: { in: dto.submissionIds }, eventId },
      include: { verification: true },
    });
    if (submissions.length !== dto.submissionIds.length) {
      throw new BadRequestException({
        code: 'INVALID_SUBMISSION_IDS',
        message: 'One or more submissionIds do not belong to this event.',
      });
    }

    const suggested = new Set((await this.getShortlistSuggestionsSafe(eventId)).map((s) => s.submissionId));

    await this.prisma.shortlistEntry.createMany({
      data: dto.submissionIds.map((submissionId) => ({
        votingRoundId: round.id,
        submissionId,
        addedByUserId: userId,
        isAutoSuggested: suggested.has(submissionId),
      })),
    });

    await this.audit.record(userId, 'VOTING_SHORTLIST_FINALIZED', {
      eventId,
      roundId: round.id,
      submissionIds: dto.submissionIds,
    });

    return this.prisma.shortlistEntry.findMany({ where: { votingRoundId: round.id } });
  }

  // Section 6 — cosmetic-only; never touches Vote rows or counts.
  async correctShortlistEntry(
    eventId: string,
    roundId: string,
    entryId: string,
    userId: string,
    dto: CorrectShortlistEntryDto,
  ) {
    await this.getRoundOrThrow(eventId, roundId);
    const entry = await this.prisma.shortlistEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.votingRoundId !== roundId) {
      throw new NotFoundException({ code: 'SHORTLIST_ENTRY_NOT_FOUND', message: 'No such shortlist entry on this round.' });
    }
    const newSubmission = await this.prisma.submission.findUnique({ where: { id: dto.newSubmissionId } });
    if (!newSubmission || newSubmission.eventId !== eventId) {
      throw new BadRequestException({ code: 'INVALID_SUBMISSION_ID', message: 'That submission does not belong to this event.' });
    }

    const oldSubmissionId = entry.submissionId;
    const updated = await this.prisma.shortlistEntry.update({
      where: { id: entryId },
      data: { submissionId: dto.newSubmissionId },
    });

    await this.audit.record(userId, 'VOTING_SHORTLIST_ENTRY_CORRECTED', {
      eventId,
      roundId,
      entryId,
      oldSubmissionId,
      newSubmissionId: dto.newSubmissionId,
      reason: dto.reason,
    });

    return updated;
  }

  // Section 4 — public reveal gated on PublishedResultVersion: LIVE
  // existing for this event (Module 10's exact visibility gate), not a
  // separate timestamp. Voting itself remains separately gated by
  // votingOpensAt/votingClosesAt.
  async getPublicShortlist(eventId: string) {
    const live = await this.prisma.publishedResultVersion.findFirst({ where: { eventId, status: 'LIVE' } });
    if (!live) return null;

    const round = await this.prisma.votingRound.findFirst({
      where: { eventId, status: 'ACTIVE' },
      orderBy: { roundNumber: 'desc' },
    });
    if (!round) return null;

    const entries = await this.prisma.shortlistEntry.findMany({
      where: { votingRoundId: round.id },
      include: { submission: { select: { id: true, title: true } } },
    });
    return { roundId: round.id, roundNumber: round.roundNumber, entries };
  }

  // --- Vote casting (Section 2/3/5) ---

  async issuePowChallenge() {
    return this.powCaptcha.issuePowChallenge();
  }

  async issueCaptchaChallenge() {
    return this.powCaptcha.issueCaptchaChallenge();
  }

  async castVote(eventId: string, voter: { id: string; createdAt: Date; emailVerifiedAt: Date | null }, req: { ip?: string }, dto: CastVoteDto) {
    const event = await this.getEventOrThrow(eventId);

    // Account-age gate, both eligibility modes (Section 2, D44) —
    // anchored to eventStartsAt specifically, not votingOpensAt.
    if (voter.createdAt.getTime() >= event.eventStartsAt.getTime()) {
      throw new ForbiddenException({
        code: 'ACCOUNT_TOO_NEW',
        message: 'This account was created too recently to vote in this event.',
      });
    }

    await this.assertEligible(eventId, event, voter.id);

    const round = await this.getCurrentRound(eventId);
    const now = Date.now();
    if (now < round.votingOpensAt.getTime()) {
      throw new BadRequestException({ code: 'VOTING_NOT_OPEN_YET', message: 'Voting has not opened yet for the current round.' });
    }
    if (now > round.votingClosesAt.getTime()) {
      throw new BadRequestException({ code: 'VOTING_CLOSED', message: 'Voting has closed for the current round.' });
    }

    const shortlisted = await this.prisma.shortlistEntry.findFirst({
      where: { votingRoundId: round.id, submissionId: dto.submissionId },
    });
    if (!shortlisted) {
      throw new BadRequestException({ code: 'NOT_SHORTLISTED', message: 'That submission is not on the current shortlist.' });
    }

    const powOk = await this.powCaptcha.verifyAndConsumePow(dto.powChallengeId, dto.powNonce);
    if (!powOk) {
      throw new BadRequestException({ code: 'POW_CHALLENGE_FAILED', message: 'Proof-of-work challenge missing, expired, or incorrect.' });
    }

    const ipHash = hashIpOrNull(req.ip);

    // Adaptive CAPTCHA (Section 5.1) — only required once this IP's
    // existing distinct-voter count in this round is already at/above
    // the abuse threshold; most legitimate voters never hit this path.
    if (ipHash) {
      const priorVoterCount = await this.countDistinctVotersForIp(round.id, ipHash);
      if (priorVoterCount >= ABUSE_IP_THRESHOLD) {
        if (!dto.captchaChallengeId || !dto.captchaAnswer) {
          throw new BadRequestException({
            code: 'CAPTCHA_REQUIRED',
            message: 'Solve the visible CAPTCHA challenge to continue voting from this network.',
          });
        }
        const captchaOk = await this.powCaptcha.verifyAndConsumeCaptcha(dto.captchaChallengeId, dto.captchaAnswer);
        if (!captchaOk) {
          throw new BadRequestException({ code: 'CAPTCHA_INCORRECT', message: 'CAPTCHA challenge missing, expired, or incorrect.' });
        }
      }
    }

    try {
      await this.prisma.vote.create({
        data: { votingRoundId: round.id, submissionId: dto.submissionId, userId: voter.id, ipHash },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ForbiddenException({ code: 'ALREADY_VOTED', message: 'You have already voted in this round.' });
      }
      throw err;
    }

    // Flag for admin review only — never auto-block/ban (D47). Runs
    // after insert so the flag's implicatedUserIds reflects this vote.
    if (ipHash) {
      const voterCount = await this.countDistinctVotersForIp(round.id, ipHash);
      if (voterCount >= ABUSE_IP_THRESHOLD) {
        await this.flagAbuse(round.id, ipHash, voter.id);
      }
    }

    return { ok: true };
  }

  private async assertEligible(eventId: string, event: Event, userId: string): Promise<void> {
    if (event.votingEligibilityMode === 'PARTICIPANTS_ONLY') {
      const membership = await this.prisma.eventMembership.findUnique({
        where: { userId_eventId: { userId, eventId } },
      });
      if (!membership || membership.role !== 'PARTICIPANT' || membership.invitationStatus !== 'ACCEPTED') {
        throw new ForbiddenException({
          code: 'NOT_ELIGIBLE_TO_VOTE',
          message: 'Only participants of this event can vote (PARTICIPANTS_ONLY mode).',
        });
      }
      return;
    }

    // VERIFIED_PLATFORM_USERS (or unset, defensively — createInitialRound
    // never lets a round exist without a mode chosen).
    const voter = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!voter?.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'NOT_ELIGIBLE_TO_VOTE',
        message: 'Only users with a verified email can vote.',
      });
    }
  }

  private async countDistinctVotersForIp(votingRoundId: string, ipHash: string): Promise<number> {
    const votes = await this.prisma.vote.findMany({
      where: { votingRoundId, ipHash },
      select: { userId: true },
      distinct: ['userId'],
    });
    return votes.length;
  }

  private async flagAbuse(votingRoundId: string, ipHash: string, newUserId: string): Promise<void> {
    const existing = await this.prisma.voteAbuseFlag.findUnique({
      where: { votingRoundId_ipHash: { votingRoundId, ipHash } },
    });
    if (existing) {
      if (!existing.implicatedUserIds.includes(newUserId)) {
        await this.prisma.voteAbuseFlag.update({
          where: { id: existing.id },
          data: { implicatedUserIds: [...existing.implicatedUserIds, newUserId] },
        });
      }
      return;
    }
    const implicated = await this.prisma.vote.findMany({
      where: { votingRoundId, ipHash },
      select: { userId: true },
      distinct: ['userId'],
    });
    const flag = await this.prisma.voteAbuseFlag.create({
      data: {
        votingRoundId,
        ipHash,
        implicatedUserIds: implicated.map((v) => v.userId),
        status: 'PENDING',
      },
    });
    await this.audit.record(newUserId, 'VOTE_ABUSE_FLAGGED', { votingRoundId, flagId: flag.id, ipHash, implicatedUserIds: flag.implicatedUserIds });
  }

  // --- Abuse review (Section 5.3) ---

  async listAbuseFlags(eventId: string) {
    await this.getEventOrThrow(eventId);
    return this.prisma.voteAbuseFlag.findMany({
      where: { votingRound: { eventId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewAbuseFlag(eventId: string, flagId: string, userId: string, dto: ReviewAbuseFlagDto) {
    await this.getEventOrThrow(eventId);
    const flag = await this.prisma.voteAbuseFlag.findUnique({ where: { id: flagId }, include: { votingRound: true } });
    if (!flag || flag.votingRound.eventId !== eventId) {
      throw new NotFoundException({ code: 'ABUSE_FLAG_NOT_FOUND', message: 'No such abuse flag on this event.' });
    }
    if (flag.status !== 'PENDING') {
      throw new BadRequestException({ code: 'ALREADY_REVIEWED', message: 'This flag has already been reviewed.' });
    }

    if (dto.action === 'CLEAR') {
      const updated = await this.prisma.voteAbuseFlag.update({
        where: { id: flagId },
        data: { status: 'REVIEWED_CLEARED', reviewedByUserId: userId, reviewedAt: new Date() },
      });
      await this.audit.record(userId, 'VOTE_ABUSE_FLAG_CLEARED', { eventId, flagId, note: dto.clearNote ?? null });
      return updated;
    }

    // BAN — by email (D48), same fields every other part of this
    // platform's signup-rejection check reads (User.bannedAt/bannedReason).
    const banUserIds = dto.banUserIds ?? flag.implicatedUserIds;
    const invalid = banUserIds.filter((id) => !flag.implicatedUserIds.includes(id));
    if (invalid.length > 0) {
      throw new BadRequestException({ code: 'INVALID_BAN_USER_IDS', message: 'banUserIds must be a subset of this flag\'s implicatedUserIds.' });
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.voteAbuseFlag.update({
        where: { id: flagId },
        data: { status: 'REVIEWED_BANNED', reviewedByUserId: userId, reviewedAt: new Date() },
      }),
      this.prisma.user.updateMany({
        where: { id: { in: banUserIds } },
        data: { bannedAt: new Date(), bannedReason: dto.banReason },
      }),
    ]);

    await this.audit.record(userId, 'VOTE_ABUSE_FLAG_BANNED', { eventId, flagId, bannedUserIds: banUserIds, reason: dto.banReason });
    return updated;
  }

  // --- Tally (Section 8 — organizer/admin-only, live, during an active round) ---

  async getLiveTally(eventId: string, roundId: string): Promise<TallyEntry[]> {
    await this.getRoundOrThrow(eventId, roundId);
    return this.computeTally(roundId);
  }

  async computeTally(votingRoundId: string): Promise<TallyEntry[]> {
    const [shortlist, votes] = await Promise.all([
      this.prisma.shortlistEntry.findMany({ where: { votingRoundId } }),
      this.prisma.vote.findMany({ where: { votingRoundId }, select: { submissionId: true } }),
    ]);

    const counts = new Map<string, number>();
    for (const v of votes) {
      counts.set(v.submissionId, (counts.get(v.submissionId) ?? 0) + 1);
    }
    const totalVotes = votes.length;
    const maxCount = Math.max(0, ...shortlist.map((se) => counts.get(se.submissionId) ?? 0));

    return shortlist.map((se) => {
      const voteCount = counts.get(se.submissionId) ?? 0;
      return {
        submissionId: se.submissionId,
        voteCount,
        votePercentage: totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0,
        isSharedWin: maxCount > 0 && voteCount === maxCount,
      };
    });
  }

  // --- Shared helpers ---

  async getEventOrThrow(eventId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
    }
    return event;
  }

  async getRoundOrThrow(eventId: string, roundId: string): Promise<VotingRound> {
    const round = await this.prisma.votingRound.findUnique({ where: { id: roundId } });
    if (!round || round.eventId !== eventId) {
      throw new NotFoundException({ code: 'VOTING_ROUND_NOT_FOUND', message: 'No such voting round on this event.' });
    }
    return round;
  }

  // finalizeShortlist's own suggestion lookup never throws on "no
  // normalization run" — an organizer can still manually build a
  // shortlist with zero runs (suggestions are advisory only).
  private async getShortlistSuggestionsSafe(eventId: string) {
    try {
      return await this.getShortlistSuggestions(eventId);
    } catch {
      return [];
    }
  }
}
