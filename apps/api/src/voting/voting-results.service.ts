import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVotingCorrectionDto } from './dto/create-voting-correction.dto';
import { VotingService } from './voting.service';

// Module 11, Section 9 — "reuses Module 10's draft/publish/correction
// pattern," lighter-weight since voting has no scoring pipeline to
// select a run from: tallying happens directly from Vote rows, no
// separate draft object. Kept as its own file (not folded into
// VotingService) purely to keep that file's already-large
// rounds/shortlist/votes/abuse surface from growing further — same
// split ResultsService vs. the normalization pipeline draws in Module
// 10, just expressed as two files instead of two modules.
@Injectable()
export class VotingResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly voting: VotingService,
  ) {}

  async publish(eventId: string, userId: string, votingRoundId?: string) {
    const round = votingRoundId
      ? await this.voting.getRoundOrThrow(eventId, votingRoundId)
      : await this.voting.getCurrentRound(eventId);

    const tally = await this.voting.computeTally(round.id);

    const version = await this.prisma.$transaction((tx) =>
      this.persistNewVersion(tx, eventId, round.id, tally, {
        publishedByUserId: userId,
        correctionReason: null,
      }),
    );

    await this.audit.record(userId, 'VOTING_RESULTS_PUBLISHED', {
      eventId,
      votingRoundId: round.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
    });

    return this.getVersionDetail(eventId, version.id);
  }

  async listVersions(eventId: string) {
    await this.voting.getEventOrThrow(eventId);
    return this.prisma.votingResultVersion.findMany({ where: { eventId }, orderBy: { versionNumber: 'desc' } });
  }

  async getVersionDetail(eventId: string, versionId: string) {
    const version = await this.prisma.votingResultVersion.findUnique({
      where: { id: versionId },
      include: { entries: { include: { submission: { select: { id: true, title: true } } } } },
    });
    if (!version || version.eventId !== eventId) {
      throw new NotFoundException({ code: 'VOTING_RESULT_VERSION_NOT_FOUND', message: 'No such voting result version on this event.' });
    }
    return version;
  }

  // Section 8 — hidden during voting, aggregate-only after publish.
  // Gated entirely on a LIVE VotingResultVersion existing, independent
  // of EventPhase, same visibility rule as Module 10's public results.
  async getPublicResults(eventId: string) {
    const live = await this.prisma.votingResultVersion.findFirst({
      where: { eventId, status: 'LIVE' },
      include: {
        entries: {
          where: { isDisqualified: false },
          orderBy: { voteCount: 'desc' },
          include: { submission: { select: { id: true, title: true } } },
        },
      },
    });
    return live ?? null;
  }

  async unpublish(eventId: string, versionId: string, userId: string, reason: string) {
    const version = await this.getVersionOrThrow(eventId, versionId);
    if (version.status !== 'LIVE') {
      throw new BadRequestException({ code: 'NOT_LIVE', message: 'Only a currently LIVE version can be unpublished.' });
    }
    const updated = await this.prisma.votingResultVersion.update({
      where: { id: versionId },
      data: { status: 'UNPUBLISHED', unpublishReason: reason },
    });
    await this.audit.record(userId, 'VOTING_RESULTS_UNPUBLISHED', { eventId, versionId, reason });
    return updated;
  }

  // Mirrors ResultsService.createCorrection: always starts from the
  // CURRENT LIVE version's entries (never an older/superseded one) and
  // copies every entry forward with exactly one change applied.
  async createCorrection(eventId: string, versionId: string, userId: string, dto: CreateVotingCorrectionDto) {
    const current = await this.getVersionOrThrow(eventId, versionId);
    if (current.status !== 'LIVE') {
      throw new BadRequestException({ code: 'NOT_LIVE', message: 'Corrections can only be made against the currently LIVE version.' });
    }

    const entries = await this.prisma.votingResultEntry.findMany({ where: { votingResultVersionId: versionId } });
    let rows = entries.map((e) => ({
      submissionId: e.submissionId,
      voteCount: e.voteCount,
      votePercentage: e.votePercentage,
      isSharedWin: e.isSharedWin,
      isDisqualified: e.isDisqualified,
    }));

    if (dto.type === 'DISQUALIFY') {
      rows = rows.map((r) => (r.submissionId === dto.submissionId ? { ...r, isDisqualified: true } : r));
    } else {
      const targetExists = rows.some((r) => r.submissionId === dto.newSubmissionId);
      if (targetExists) {
        throw new BadRequestException({
          code: 'REASSIGN_TARGET_CONFLICT',
          message: 'newSubmissionId already has its own entry in this version — resolve the conflict manually before reassigning.',
        });
      }
      rows = rows.map((r) => (r.submissionId === dto.submissionId ? { ...r, submissionId: dto.newSubmissionId! } : r));
    }

    const version = await this.prisma.$transaction((tx) =>
      this.persistNewVersion(tx, eventId, current.votingRoundId, rows, {
        publishedByUserId: userId,
        correctionReason: dto.reason,
      }),
    );

    await this.audit.record(userId, 'VOTING_RESULTS_CORRECTED', {
      eventId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      previousVersionId: current.id,
      type: dto.type,
      submissionId: dto.submissionId,
      reason: dto.reason,
    });

    return this.getVersionDetail(eventId, version.id);
  }

  private async persistNewVersion(
    tx: Prisma.TransactionClient,
    eventId: string,
    votingRoundId: string,
    entries: { submissionId: string; voteCount: number; votePercentage: number; isSharedWin: boolean; isDisqualified?: boolean }[],
    meta: { publishedByUserId: string; correctionReason: string | null },
  ) {
    await tx.votingResultVersion.updateMany({
      where: { eventId, status: 'LIVE' },
      data: { status: 'SUPERSEDED' },
    });

    const previous = await tx.votingResultVersion.findFirst({
      where: { eventId },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (previous?.versionNumber ?? 0) + 1;

    const version = await tx.votingResultVersion.create({
      data: {
        eventId,
        votingRoundId,
        versionNumber,
        status: 'LIVE',
        publishedByUserId: meta.publishedByUserId,
        correctionReason: meta.correctionReason,
      },
    });

    if (entries.length > 0) {
      await tx.votingResultEntry.createMany({
        data: entries.map((e) => ({ ...e, votingResultVersionId: version.id })),
      });
    }

    return version;
  }

  private async getVersionOrThrow(eventId: string, versionId: string) {
    const version = await this.prisma.votingResultVersion.findUnique({ where: { id: versionId } });
    if (!version || version.eventId !== eventId) {
      throw new NotFoundException({ code: 'VOTING_RESULT_VERSION_NOT_FOUND', message: 'No such voting result version on this event.' });
    }
    return version;
  }
}
