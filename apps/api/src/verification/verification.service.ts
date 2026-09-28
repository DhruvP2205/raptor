import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationQueueService } from '../queues/verification-queue.service';
import type { ReviewVerificationDto } from './dto/review-verification.dto';
import type { TriggerVerificationDto } from './dto/trigger-verification.dto';

// Module 6 (Submission Verification) — see
// docs/stages/06-submission-verification.md. This service only ever
// resolves *which* submissions to (re-)check and enqueues them, plus
// the organizer-facing list/detail/review actions (Section 7). The
// actual GitHub calls and classification (Section 3) run entirely in
// apps/worker — see that app's verification.processor.ts, which is the
// only place a SubmissionVerification row's checkStatus/evidence
// fields are ever written from an automated run.
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: VerificationQueueService,
  ) {}

  async triggerRun(
    eventId: string,
    actingUserId: string,
    dto: TriggerVerificationDto,
  ): Promise<{ queued: number }> {
    await this.getEventOrThrow(eventId);

    const submissionIds = await this.resolveScope(eventId, dto);

    for (const submissionId of submissionIds) {
      await this.queue.enqueue(submissionId);
    }

    const metadata: Record<string, unknown> = {
      eventId,
      scope: dto.scope,
      queuedCount: submissionIds.length,
    };
    if (dto.scope === 'FILTER') metadata.filter = dto.filter;
    if (dto.scope === 'TARGETED') metadata.submissionIds = submissionIds;
    await this.audit.record(actingUserId, 'VERIFICATION_RUN_TRIGGERED', metadata as Prisma.InputJsonValue);

    return { queued: submissionIds.length };
  }

  async list(eventId: string, checkStatus?: string, finalDecision?: string) {
    await this.getEventOrThrow(eventId);

    // Both filters must land in the same `verification.is` object — two
    // separate spreads here would let the second silently clobber the
    // first instead of narrowing further (caught by this method's own
    // test: passing both checkStatus and finalDecision used to apply
    // only whichever one was spread last).
    const verificationIs: Record<string, unknown> = {};
    if (checkStatus) verificationIs.checkStatus = checkStatus;
    if (finalDecision) verificationIs.finalDecision = finalDecision;

    const submissions = await this.prisma.submission.findMany({
      where: {
        eventId,
        everSubmitted: true,
        ...(Object.keys(verificationIs).length > 0
          ? { verification: { is: verificationIs } }
          : {}),
      },
      include: {
        verification: true,
        team: { select: { name: true } },
        soloUser: { select: { displayName: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return submissions.map((s) => this.toPublic(s));
  }

  async getDetail(eventId: string, submissionId: string) {
    const submission = await this.getSubmissionInEventOrThrow(eventId, submissionId);
    return this.toPublic(submission);
  }

  // Section 4/7 — resolves PENDING_REVIEW (or overrides an existing
  // decision) to APPROVED/DISQUALIFIED. DISQUALIFIED requires non-empty
  // remarks (D99); APPROVED's remarks stay optional. Allowed even if no
  // automated check has ever run (checkStatus NOT_RUN) — an organizer
  // can disqualify on obvious grounds without waiting on GitHub.
  async review(
    eventId: string,
    submissionId: string,
    actingUserId: string,
    dto: ReviewVerificationDto,
  ) {
    await this.getSubmissionInEventOrThrow(eventId, submissionId);

    if (dto.finalDecision === 'DISQUALIFIED' && !dto.remarks?.trim()) {
      throw new BadRequestException({
        code: 'REMARKS_REQUIRED',
        message: 'Disqualifying a submission requires a written reason.',
      });
    }

    const verification = await this.prisma.submissionVerification.upsert({
      where: { submissionId },
      create: {
        submissionId,
        finalDecision: dto.finalDecision,
        finalDecisionRemarks: dto.remarks?.trim() || null,
        reviewedByUserId: actingUserId,
        reviewedAt: new Date(),
      },
      update: {
        finalDecision: dto.finalDecision,
        finalDecisionRemarks: dto.remarks?.trim() || null,
        reviewedByUserId: actingUserId,
        reviewedAt: new Date(),
      },
    });

    await this.audit.record(actingUserId, 'VERIFICATION_REVIEWED', {
      eventId,
      submissionId,
      finalDecision: dto.finalDecision,
      hasRemarks: Boolean(dto.remarks?.trim()),
    });

    return verification;
  }

  private async resolveScope(eventId: string, dto: TriggerVerificationDto): Promise<string[]> {
    if (dto.scope === 'TARGETED') {
      if (!dto.submissionIds?.length) {
        throw new BadRequestException({
          code: 'SUBMISSION_IDS_REQUIRED',
          message: 'TARGETED scope requires at least one submissionId.',
        });
      }
      // Cross-event isolation: a submission id from a different event is
      // silently excluded, not an error that would leak its existence.
      const submissions = await this.prisma.submission.findMany({
        where: { id: { in: dto.submissionIds }, eventId, everSubmitted: true },
        select: { id: true },
      });
      return submissions.map((s) => s.id);
    }

    if (dto.scope === 'FILTER') {
      if (!dto.filter?.checkStatus?.length && !dto.filter?.finalDecision?.length) {
        throw new BadRequestException({
          code: 'FILTER_REQUIRED',
          message: 'FILTER scope requires at least one of checkStatus/finalDecision.',
        });
      }

      const verificationIs: Record<string, unknown> = {};
      if (dto.filter?.checkStatus?.length) {
        verificationIs.checkStatus = { in: dto.filter.checkStatus };
      }
      if (dto.filter?.finalDecision?.length) {
        verificationIs.finalDecision = { in: dto.filter.finalDecision };
      }

      const where: Prisma.SubmissionWhereInput = {
        eventId,
        everSubmitted: true,
        verification: { is: verificationIs },
      };

      const submissions = await this.prisma.submission.findMany({
        where,
        select: { id: true },
      });
      return submissions.map((s) => s.id);
    }

    // ALL
    const submissions = await this.prisma.submission.findMany({
      where: {
        eventId,
        everSubmitted: true,
        ...(dto.includeAlreadyChecked
          ? {}
          : { OR: [{ verification: null }, { verification: { is: { checkStatus: 'NOT_RUN' } } }] }),
      },
      select: { id: true },
    });
    return submissions.map((s) => s.id);
  }

  private async getEventOrThrow(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
    }
    return event;
  }

  private async getSubmissionInEventOrThrow(eventId: string, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        verification: true,
        team: { select: { name: true } },
        soloUser: { select: { displayName: true } },
      },
    });
    // Same 404-for-both-cases shape as Submissions Module 5 (D81) — a
    // submission that exists but belongs to a different event must be
    // indistinguishable from one that doesn't exist at all.
    if (!submission || submission.eventId !== eventId) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'No such submission on this event.',
      });
    }
    return submission;
  }

  private toPublic(submission: {
    id: string;
    eventId: string;
    title: string | null;
    repoUrl: string | null;
    submittedAt: Date | null;
    team?: { name: string } | null;
    soloUser?: { displayName: string } | null;
    verification: {
      checkStatus: string;
      finalDecision: string;
      firstCommitAt: Date | null;
      lastCommitAt: Date | null;
      totalCommits: number;
      commitsInWindow: number;
      outsideWindowCommits: unknown;
      finalDecisionRemarks: string | null;
      reviewedByUserId: string | null;
      checkedAt: Date | null;
      reviewedAt: Date | null;
    } | null;
  }) {
    return {
      submissionId: submission.id,
      eventId: submission.eventId,
      title: submission.title,
      // The design doc's table wants "team" per row — the raw
      // Submission row has no name-bearing field, same gap Module 5's
      // gallery hit (its own toPublicSubmission doesn't join this
      // either, by design — kept generic there since most callers don't
      // need it).
      submitterName: submission.team?.name ?? submission.soloUser?.displayName ?? null,
      repoUrl: submission.repoUrl,
      submittedAt: submission.submittedAt,
      // A submission that's never been checked has no row yet — surface
      // the same NOT_RUN/PENDING_REVIEW defaults the schema itself uses,
      // rather than a null the caller has to special-case.
      checkStatus: submission.verification?.checkStatus ?? 'NOT_RUN',
      finalDecision: submission.verification?.finalDecision ?? 'PENDING_REVIEW',
      firstCommitAt: submission.verification?.firstCommitAt ?? null,
      lastCommitAt: submission.verification?.lastCommitAt ?? null,
      totalCommits: submission.verification?.totalCommits ?? 0,
      commitsInWindow: submission.verification?.commitsInWindow ?? 0,
      outsideWindowCommits: submission.verification?.outsideWindowCommits ?? [],
      finalDecisionRemarks: submission.verification?.finalDecisionRemarks ?? null,
      reviewedByUserId: submission.verification?.reviewedByUserId ?? null,
      checkedAt: submission.verification?.checkedAt ?? null,
      reviewedAt: submission.verification?.reviewedAt ?? null,
    };
  }
}
