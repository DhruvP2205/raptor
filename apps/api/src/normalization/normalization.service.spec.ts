import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NormalizationService } from './normalization.service';

function makePrisma() {
  const runs: any[] = [];
  const tx = {
    normalizationRun: {
      create: jest.fn((args: any) => {
        const created = { id: `run-${runs.length + 1}`, ...args.data };
        runs.push(created);
        return Promise.resolve(created);
      }),
    },
    normalizedJudgeScore: { createMany: jest.fn() },
    normalizedScore: { createMany: jest.fn() },
  };
  return {
    event: { findUnique: jest.fn() },
    judgeAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    normalizationRun: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
    __tx: tx,
    __runs: runs,
  } as any;
}

const judge = (overrides: Record<string, unknown> = {}) => ({
  id: 'judge-1',
  judgeCalibrationMean: 0,
  judgeCalibrationStdDev: 0,
  judgeCalibrationSampleCount: 0,
  ...overrides,
});

function completedAssignment(id: string, submissionId: string, judgeData: any, scoreValue: number) {
  return {
    id,
    submissionId,
    judge: judgeData,
    scores: [{ value: scoreValue, criterion: { kind: 'SCORING', weightPercent: 100 } }],
  };
}

const WITHIN_WINDOW_EVENT = {
  id: 'event-1',
  finalScoreDisplayScale: 5,
  judgingClosesAt: new Date(Date.now() - 1000),
  resultsAnnounceAt: new Date(Date.now() + 86_400_000),
};
const BEFORE_JUDGING_CLOSED_EVENT = {
  id: 'event-1',
  finalScoreDisplayScale: 5,
  judgingClosesAt: new Date(Date.now() + 86_400_000),
  resultsAnnounceAt: new Date(Date.now() + 2 * 86_400_000),
};
const AFTER_RESULTS_EVENT = {
  id: 'event-1',
  finalScoreDisplayScale: 5,
  judgingClosesAt: new Date(Date.now() - 2 * 86_400_000),
  resultsAnnounceAt: new Date(Date.now() - 1000),
};

describe('NormalizationService.triggerRun', () => {
  it('rejects triggering before judgingClosesAt', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(BEFORE_JUDGING_CLOSED_EVENT);
    const service = new NormalizationService(prisma);

    await expect(service.triggerRun('event-1', 'organizer-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects triggering at or after resultsAnnounceAt, unconditionally — no caller-role bypass exists in this method at all', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(AFTER_RESULTS_EVENT);
    const service = new NormalizationService(prisma);

    // The service has no concept of "caller is siteAdmin" — the
    // deadline check is applied identically no matter who calls it,
    // which is what "no exceptions, no admin override" actually means
    // at this layer.
    await expect(service.triggerRun('event-1', 'organizer-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.triggerRun('event-1', 'site-admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s for a non-existent event', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(null);
    const service = new NormalizationService(prisma);

    await expect(service.triggerRun('no-such-event', 'organizer-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only ever queries COMPLETED judge assignments — a non-responder can never be counted', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(WITHIN_WINDOW_EVENT);
    prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'event-1', judgeScores: [], normalizedScores: [] });
    const service = new NormalizationService(prisma);

    await service.triggerRun('event-1', 'organizer-1');

    expect(prisma.judgeAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'event-1', status: 'COMPLETED' } }),
    );
  });

  it('produces an independent NormalizationRun + snapshot set on each re-run, never overwriting a prior one', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(WITHIN_WINDOW_EVENT);
    prisma.judgeAssignment.findMany.mockResolvedValue([
      completedAssignment('a1', 'sub-1', judge({ judgeCalibrationSampleCount: 5, judgeCalibrationMean: 70, judgeCalibrationStdDev: 10 }), 80),
    ]);
    prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-x', eventId: 'event-1', judgeScores: [], normalizedScores: [] });
    const service = new NormalizationService(prisma);

    await service.triggerRun('event-1', 'organizer-1');
    await service.triggerRun('event-1', 'organizer-1');

    expect(prisma.__tx.normalizationRun.create).toHaveBeenCalledTimes(2);
    const [firstRunId, secondRunId] = prisma.__runs.map((r: any) => r.id);
    expect(firstRunId).not.toBe(secondRunId);
    // Never a delete/update against a prior run's rows — only create.
    expect(prisma.__tx.normalizedJudgeScore.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.__tx.normalizedScore.createMany).toHaveBeenCalledTimes(2);
  });

  it("snapshots the judge's calibration figures as frozen numeric copies, not a live reference", async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(WITHIN_WINDOW_EVENT);
    prisma.judgeAssignment.findMany.mockResolvedValue([
      completedAssignment('a1', 'sub-1', judge({ judgeCalibrationSampleCount: 5, judgeCalibrationMean: 70, judgeCalibrationStdDev: 10 }), 90),
    ]);
    prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'event-1', judgeScores: [], normalizedScores: [] });
    const service = new NormalizationService(prisma);

    await service.triggerRun('event-1', 'organizer-1');

    const payload = prisma.__tx.normalizedJudgeScore.createMany.mock.calls[0][0].data[0];
    expect(payload.judgeMeanAtRun).toBe(70);
    expect(payload.judgeStdDevAtRun).toBe(10);
    expect(payload.sampleCountAtRun).toBe(5);
    expect(payload.usedFallback).toBe(false);
    expect(payload.zScore).toBeCloseTo(2, 10); // (90-70)/10
  });

  it('flags a below-minimum-N judge as usedFallback and normalizes against the event baseline', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(WITHIN_WINDOW_EVENT);
    prisma.judgeAssignment.findMany.mockResolvedValue([
      completedAssignment('a1', 'sub-1', judge({ judgeCalibrationSampleCount: 1 }), 80),
      completedAssignment('a2', 'sub-2', judge({ id: 'judge-2', judgeCalibrationSampleCount: 1 }), 60),
    ]);
    prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'event-1', judgeScores: [], normalizedScores: [] });
    const service = new NormalizationService(prisma);

    await service.triggerRun('event-1', 'organizer-1');

    const payloads = prisma.__tx.normalizedJudgeScore.createMany.mock.calls[0][0].data;
    for (const p of payloads) {
      expect(p.usedFallback).toBe(true);
    }
  });

  it('flags uniform scoring for a qualified judge with zero personal variance', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(WITHIN_WINDOW_EVENT);
    prisma.judgeAssignment.findMany.mockResolvedValue([
      completedAssignment('a1', 'sub-1', judge({ judgeCalibrationSampleCount: 10, judgeCalibrationMean: 77, judgeCalibrationStdDev: 0 }), 77),
    ]);
    prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'event-1', judgeScores: [], normalizedScores: [] });
    const service = new NormalizationService(prisma);

    await service.triggerRun('event-1', 'organizer-1');

    const payload = prisma.__tx.normalizedJudgeScore.createMany.mock.calls[0][0].data[0];
    expect(payload.uniformScoringFlagged).toBe(true);
    expect(payload.zScore).toBe(0);
  });

  // Interpreting the stage doc's "matches what Module 8's own formula
  // would have produced" test claim: Module 8's raw formula and this
  // module's z-score-then-rescale formula are structurally different
  // (proportional vs. standardized-then-linearly-rescaled), so they
  // cannot be numerically identical in general — even with a single,
  // well-calibrated judge, only their *relative ordering* is guaranteed
  // to agree (the same judge's mean/stddev is applied uniformly, so
  // higher rawTotal always yields higher z always yields higher
  // finalScore). Testing that ordering-preservation claim, which is the
  // substantive, checkable content of "normalization doesn't change
  // the output when there's nothing to correct for" — flagged here as
  // the chosen interpretation of an otherwise ambiguous requirement.
  it('preserves relative submission ordering when there is only one judge with a stable profile', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(WITHIN_WINDOW_EVENT);
    const oneJudge = judge({ judgeCalibrationSampleCount: 10, judgeCalibrationMean: 70, judgeCalibrationStdDev: 15 });
    prisma.judgeAssignment.findMany.mockResolvedValue([
      completedAssignment('a1', 'sub-low', oneJudge, 40),
      completedAssignment('a2', 'sub-mid', oneJudge, 70),
      completedAssignment('a3', 'sub-high', oneJudge, 95),
    ]);
    prisma.normalizationRun.findUnique.mockResolvedValue({ id: 'run-1', eventId: 'event-1', judgeScores: [], normalizedScores: [] });
    const service = new NormalizationService(prisma);

    await service.triggerRun('event-1', 'organizer-1');

    const payload = prisma.__tx.normalizedScore.createMany.mock.calls[0][0].data as any[];
    const byId = new Map(payload.map((p) => [p.submissionId, p]));
    expect(byId.get('sub-low')!.finalScore).toBeLessThan(byId.get('sub-mid')!.finalScore);
    expect(byId.get('sub-mid')!.finalScore).toBeLessThan(byId.get('sub-high')!.finalScore);
  });
});
