import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RubricCriteriaService } from './rubric-criteria.service';

function makePrisma() {
  const tx = {
    rubricCriterion: {
      deleteMany: jest.fn(),
      create: jest.fn((args: any) => Promise.resolve({ id: `rc-${Math.random()}`, ...args.data })),
    },
  };
  return {
    event: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

const FUTURE_EVENT = { id: 'event-1', eventEndsAt: new Date(Date.now() + 86_400_000) };
const PAST_EVENT = { id: 'event-1', eventEndsAt: new Date(Date.now() - 86_400_000) };

const scoringCriteria = (weights: number[]) =>
  weights.map((w, i) => ({ kind: 'SCORING' as const, label: `S${i}`, description: 'd', weightPercent: w }));

describe('RubricCriteriaService.replace', () => {
  it('rejects a rubric with no SCORING criteria at all', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
    const service = new RubricCriteriaService(prisma, makeAudit() as any);

    await expect(
      service.replace('event-1', 'organizer-1', {
        criteria: [{ kind: 'BONUS', label: 'B', description: 'd', maxPoints: 5 }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when SCORING weightPercent values do not sum to exactly 100', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
    const service = new RubricCriteriaService(prisma, makeAudit() as any);

    await expect(
      service.replace('event-1', 'organizer-1', { criteria: scoringCriteria([60, 30]) } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts SCORING weights summing to exactly 100', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
    const service = new RubricCriteriaService(prisma, makeAudit() as any);

    const result = await service.replace('event-1', 'organizer-1', {
      criteria: scoringCriteria([60, 40]),
    } as any);
    expect(result).toHaveLength(2);
  });

  it('accepts bonus tracks with zero validation against the 100-sum rule', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
    const service = new RubricCriteriaService(prisma, makeAudit() as any);

    const result = await service.replace('event-1', 'organizer-1', {
      criteria: [...scoringCriteria([100]), { kind: 'BONUS', label: 'B', description: 'd', maxPoints: 5 }],
    } as any);
    expect(result).toHaveLength(2);
  });

  it('rejects a SCORING criterion carrying maxPoints (wrong shape for its kind)', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
    const service = new RubricCriteriaService(prisma, makeAudit() as any);

    await expect(
      service.replace('event-1', 'organizer-1', {
        criteria: [{ kind: 'SCORING', label: 'S', description: 'd', weightPercent: 100, maxPoints: 5 }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('shows the bonus-guardrail warning (409) and does not persist when the threshold is exceeded without acknowledgment', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
    const audit = makeAudit();
    const service = new RubricCriteriaService(prisma, audit as any);

    await expect(
      service.replace('event-1', 'organizer-1', {
        criteria: [...scoringCriteria([100]), { kind: 'BONUS', label: 'B', description: 'd', maxPoints: 25 }],
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('proceeds past the guardrail when acknowledged, and writes an AuditLog entry recording it', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
    const audit = makeAudit();
    const service = new RubricCriteriaService(prisma, audit as any);

    await service.replace('event-1', 'organizer-1', {
      criteria: [...scoringCriteria([100]), { kind: 'BONUS', label: 'B', description: 'd', maxPoints: 25 }],
      acknowledgeBonusOverage: true,
    } as any);

    expect(audit.record).toHaveBeenCalledWith(
      'organizer-1',
      'RUBRIC_REPLACED',
      expect.objectContaining({ bonusGuardrailAcknowledged: true }),
    );
  });

  it('does not require acknowledgment when bonus stays under the threshold', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(FUTURE_EVENT);
    const audit = makeAudit();
    const service = new RubricCriteriaService(prisma, audit as any);

    await expect(
      service.replace('event-1', 'organizer-1', {
        criteria: [...scoringCriteria([100]), { kind: 'BONUS', label: 'B', description: 'd', maxPoints: 10 }],
      } as any),
    ).resolves.toBeDefined();
  });

  it('freezes the rubric once judging has begun (now() >= eventEndsAt)', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(PAST_EVENT);
    const service = new RubricCriteriaService(prisma, makeAudit() as any);

    await expect(
      service.replace('event-1', 'organizer-1', { criteria: scoringCriteria([100]) } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s for a non-existent event', async () => {
    const prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(null);
    const service = new RubricCriteriaService(prisma, makeAudit() as any);

    await expect(
      service.replace('no-such-event', 'organizer-1', { criteria: scoringCriteria([100]) } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
