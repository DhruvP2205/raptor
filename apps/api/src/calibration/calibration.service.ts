import { Injectable, NotFoundException } from '@nestjs/common';
import { computeMeanStdDev } from '../common/stats.util';
import { PrismaService } from '../prisma/prisma.service';
import { computeJudgeRawTotal } from '../scoring/score-formula';

// Module 9 (Normalization) — see docs/stages/09-normalization.md
// Section 3. The judge calibration profile is platform-wide and
// live-updating: recomputed from scratch after every submit-review
// (Module 8, D110/D111), across every event that judge has ever
// reviewed, never scoped to just the current one.
@Injectable()
export class CalibrationService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(judgeId: string): Promise<void> {
    const completedAssignments = await this.prisma.judgeAssignment.findMany({
      where: { judgeId, status: 'COMPLETED' },
      include: { scores: { include: { criterion: true } } },
    });

    const rawTotals = completedAssignments.map(
      (assignment) => computeJudgeRawTotal(assignment.scores.map((s) => ({
        kind: s.criterion.kind,
        weightPercent: s.criterion.weightPercent,
        value: s.value,
      }))).rawTotal,
    );

    const { mean, stdDev } = computeMeanStdDev(rawTotals);

    await this.prisma.user.update({
      where: { id: judgeId },
      data: {
        judgeCalibrationMean: mean,
        judgeCalibrationStdDev: stdDev,
        judgeCalibrationSampleCount: rawTotals.length,
      },
    });
  }

  // Section 8 — platform-wide visibility (AnyOrganizerOrAdminGuard),
  // never to the judge themselves or any participant.
  async getLiveProfile(judgeId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: judgeId },
      select: {
        id: true,
        displayName: true,
        email: true,
        accountType: true,
        judgeCalibrationMean: true,
        judgeCalibrationStdDev: true,
        judgeCalibrationSampleCount: true,
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'No such user.' });
    }
    return user;
  }
}
