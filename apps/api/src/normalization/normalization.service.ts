import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { computeMeanStdDev } from '../common/stats.util';
import { PrismaService } from '../prisma/prisma.service';
import { computeJudgeRawTotal } from '../scoring/score-formula';
import { computeJudgeZScore, rescaleToZeroHundred } from './normalization-formula';

// Section 3's platform-wide minimum-N, stored per-run for historical
// accuracy even if this default ever changes later (Section 9's own
// note on NormalizationRun.minimumN).
const MINIMUM_N = 3;

// Module 9 (Normalization) — see docs/stages/09-normalization.md.
// Manual, unlimited re-runs while judgingClosesAt <= now() <
// resultsAnnounceAt (D126); permanently locked after resultsAnnounceAt
// with no admin override — this is a business-rule check inside the
// service itself, not something EventRoleGuard's siteAdmin bypass could
// ever skip, since that bypass only affects whether the *route* is
// reachable, never this method's own logic.
@Injectable()
export class NormalizationService {
  constructor(private readonly prisma: PrismaService) {}

  async triggerRun(eventId: string, actingUserId: string) {
    const event = await this.getEventOrThrow(eventId);
    this.assertWithinWindow(event);

    const assignments = await this.prisma.judgeAssignment.findMany({
      where: { eventId, status: 'COMPLETED' },
      include: {
        judge: {
          select: {
            id: true,
            judgeCalibrationMean: true,
            judgeCalibrationStdDev: true,
            judgeCalibrationSampleCount: true,
          },
        },
        scores: { include: { criterion: true } },
      },
    });

    const rawTotalByAssignmentId = new Map<string, number>();
    for (const assignment of assignments) {
      const { rawTotal } = computeJudgeRawTotal(
        assignment.scores.map((s) => ({
          kind: s.criterion.kind,
          weightPercent: s.criterion.weightPercent,
          value: s.value,
        })),
      );
      rawTotalByAssignmentId.set(assignment.id, rawTotal);
    }

    // Section 4 — this event's own aggregate baseline, computed fresh
    // at run time, across every COMPLETED assignment in this event.
    const { mean: eventMean, stdDev: eventStdDev } = computeMeanStdDev(
      [...rawTotalByAssignmentId.values()],
    );

    const judgeScoreInputs = assignments.map((assignment) => {
      const rawTotal = rawTotalByAssignmentId.get(assignment.id)!;
      const { zScore, usedFallback, uniformScoringFlagged } = computeJudgeZScore({
        rawTotal,
        judgeMean: assignment.judge.judgeCalibrationMean,
        judgeStdDev: assignment.judge.judgeCalibrationStdDev,
        judgeSampleCount: assignment.judge.judgeCalibrationSampleCount,
        eventMean,
        eventStdDev,
        minimumN: MINIMUM_N,
      });
      return {
        judgeAssignmentId: assignment.id,
        submissionId: assignment.submissionId,
        rawTotal,
        // Frozen copies (Section 7) — never a live reference back to
        // User.judgeCalibration*, which keeps moving after this moment.
        judgeMeanAtRun: assignment.judge.judgeCalibrationMean,
        judgeStdDevAtRun: assignment.judge.judgeCalibrationStdDev,
        sampleCountAtRun: assignment.judge.judgeCalibrationSampleCount,
        usedFallback,
        uniformScoringFlagged,
        zScore,
      };
    });

    // Section 5 — average z across COMPLETED judges per submission
    // (same non-responder exclusion as Module 8, D116 — a judge not in
    // this list simply never contributes, by construction, since
    // `assignments` above was already filtered to COMPLETED only).
    const zScoresBySubmission = new Map<string, number[]>();
    for (const input of judgeScoreInputs) {
      const list = zScoresBySubmission.get(input.submissionId) ?? [];
      list.push(input.zScore);
      zScoresBySubmission.set(input.submissionId, list);
    }

    const submissionIds = [...zScoresBySubmission.keys()];
    const averagedZScores = submissionIds.map((id) => {
      const zScores = zScoresBySubmission.get(id)!;
      return zScores.reduce((sum, z) => sum + z, 0) / zScores.length;
    });
    const rescaledValues = rescaleToZeroHundred(averagedZScores);

    const finalScores = rescaledValues.map((v) => (v / 100) * event.finalScoreDisplayScale);

    // Dense ranking by finalScore descending — this run's own ordering,
    // not itself the official cross-run ranking (that's Module 10's job
    // with its own full tie-break cascade); ties here simply share a
    // rank, a reasonable default since this module doesn't own the
    // tie-break rules.
    const ranked = submissionIds
      .map((id, i) => ({ submissionId: id, finalScore: finalScores[i], rescaledValue: rescaledValues[i], averagedZScore: averagedZScores[i] }))
      .sort((a, b) => b.finalScore - a.finalScore);
    const rankBySubmissionId = new Map<string, number>();
    let currentRank = 0;
    let previousScore: number | null = null;
    for (const row of ranked) {
      if (previousScore === null || row.finalScore !== previousScore) {
        currentRank += 1;
        previousScore = row.finalScore;
      }
      rankBySubmissionId.set(row.submissionId, currentRank);
    }

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.normalizationRun.create({
        data: { eventId, runByUserId: actingUserId, minimumN: MINIMUM_N, eventMean, eventStdDev },
      });

      await tx.normalizedJudgeScore.createMany({
        data: judgeScoreInputs.map((input) => ({
          normalizationRunId: created.id,
          judgeAssignmentId: input.judgeAssignmentId,
          rawTotal: input.rawTotal,
          judgeMeanAtRun: input.judgeMeanAtRun,
          judgeStdDevAtRun: input.judgeStdDevAtRun,
          sampleCountAtRun: input.sampleCountAtRun,
          usedFallback: input.usedFallback,
          uniformScoringFlagged: input.uniformScoringFlagged,
          zScore: input.zScore,
        })),
      });

      await tx.normalizedScore.createMany({
        data: submissionIds.map((submissionId, i) => ({
          normalizationRunId: created.id,
          submissionId,
          averagedZScore: averagedZScores[i],
          rescaledValue: rescaledValues[i],
          finalScore: finalScores[i],
          rank: rankBySubmissionId.get(submissionId)!,
        })),
      });

      return created;
    });

    return this.getDetail(eventId, run.id);
  }

  async list(eventId: string) {
    await this.getEventOrThrow(eventId);
    return this.prisma.normalizationRun.findMany({
      where: { eventId },
      orderBy: { runAt: 'desc' },
    });
  }

  async getDetail(eventId: string, runId: string) {
    await this.getEventOrThrow(eventId);
    const run = await this.prisma.normalizationRun.findUnique({
      where: { id: runId },
      include: {
        judgeScores: true,
        normalizedScores: { orderBy: { rank: 'asc' } },
      },
    });
    if (!run || run.eventId !== eventId) {
      throw new NotFoundException({ code: 'NORMALIZATION_RUN_NOT_FOUND', message: 'No such normalization run on this event.' });
    }
    return run;
  }

  private async getEventOrThrow(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
    }
    return event;
  }

  private assertWithinWindow(event: { judgingClosesAt: Date; resultsAnnounceAt: Date }): void {
    const now = Date.now();
    if (now < event.judgingClosesAt.getTime()) {
      throw new BadRequestException({
        code: 'JUDGING_NOT_CLOSED',
        message: 'Normalization cannot run before judging has closed.',
      });
    }
    if (now >= event.resultsAnnounceAt.getTime()) {
      throw new BadRequestException({
        code: 'NORMALIZATION_LOCKED',
        message: 'Normalization is permanently locked once results have been announced — no exceptions.',
      });
    }
  }
}
