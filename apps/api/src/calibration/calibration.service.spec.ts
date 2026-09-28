import { CalibrationService } from './calibration.service';

function makePrisma() {
  return {
    judgeAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    user: { update: jest.fn(), findUnique: jest.fn() },
  } as any;
}

function assignment(eventId: string, assignmentId: string, scoreValue: number) {
  return {
    id: assignmentId,
    eventId,
    scores: [
      {
        value: scoreValue,
        criterion: { kind: 'SCORING', weightPercent: 100 },
      },
    ],
  };
}

describe('CalibrationService.recompute', () => {
  it('aggregates COMPLETED reviews across multiple different events, not just one', async () => {
    const prisma = makePrisma();
    prisma.judgeAssignment.findMany.mockResolvedValue([
      assignment('event-1', 'a1', 80), // rawTotal 80
      assignment('event-2', 'a2', 60), // rawTotal 60, a different event
    ]);
    const service = new CalibrationService(prisma);

    await service.recompute('judge-1');

    expect(prisma.judgeAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { judgeId: 'judge-1', status: 'COMPLETED' } }),
    );
    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'judge-1' });
    expect(updateCall.data.judgeCalibrationMean).toBeCloseTo(70, 10); // (80+60)/2
    expect(updateCall.data.judgeCalibrationSampleCount).toBe(2);
  });

  it('sets sampleCount 0 and mean/stddev 0 for a judge with no COMPLETED reviews yet', async () => {
    const prisma = makePrisma();
    prisma.judgeAssignment.findMany.mockResolvedValue([]);
    const service = new CalibrationService(prisma);

    await service.recompute('judge-new');

    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.data).toEqual({
      judgeCalibrationMean: 0,
      judgeCalibrationStdDev: 0,
      judgeCalibrationSampleCount: 0,
    });
  });

  it('never lets a SPECIAL_AWARD nomination flag skew the recomputed rawTotal', async () => {
    const prisma = makePrisma();
    prisma.judgeAssignment.findMany.mockResolvedValue([
      {
        id: 'a1',
        eventId: 'event-1',
        scores: [
          { value: 90, criterion: { kind: 'SCORING', weightPercent: 100 } },
          { value: 1, criterion: { kind: 'SPECIAL_AWARD', weightPercent: null } },
        ],
      },
    ]);
    const service = new CalibrationService(prisma);

    await service.recompute('judge-1');

    const updateCall = prisma.user.update.mock.calls[0][0];
    expect(updateCall.data.judgeCalibrationMean).toBeCloseTo(90, 10);
  });
});
