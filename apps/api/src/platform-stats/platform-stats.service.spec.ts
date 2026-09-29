import { PlatformStatsService } from './platform-stats.service';

function makePrisma() {
  return {
    event: { count: jest.fn() },
    submission: { count: jest.fn() },
    eventMembership: { findMany: jest.fn() },
  };
}

describe('PlatformStatsService (docs/design/home-page.md Section 2.2)', () => {
  it('counts only PUBLISHED events', async () => {
    const prisma = makePrisma();
    prisma.event.count.mockResolvedValue(5);
    prisma.submission.count.mockResolvedValue(0);
    prisma.eventMembership.findMany.mockResolvedValue([]);
    const service = new PlatformStatsService(prisma as any);

    const stats = await service.getStats();

    expect(prisma.event.count).toHaveBeenCalledWith({ where: { status: 'PUBLISHED' } });
    expect(stats.eventsCount).toBe(5);
  });

  it('counts only submitted (non-draft) submissions', async () => {
    const prisma = makePrisma();
    prisma.event.count.mockResolvedValue(0);
    prisma.submission.count.mockResolvedValue(120);
    prisma.eventMembership.findMany.mockResolvedValue([]);
    const service = new PlatformStatsService(prisma as any);

    const stats = await service.getStats();

    expect(prisma.submission.count).toHaveBeenCalledWith({ where: { isDraft: false } });
    expect(stats.submissionsCount).toBe(120);
  });

  it('counts distinct accepted participants, not membership rows (one person can join many events)', async () => {
    const prisma = makePrisma();
    prisma.event.count.mockResolvedValue(0);
    prisma.submission.count.mockResolvedValue(0);
    prisma.eventMembership.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]);
    const service = new PlatformStatsService(prisma as any);

    const stats = await service.getStats();

    expect(prisma.eventMembership.findMany).toHaveBeenCalledWith({
      where: { role: 'PARTICIPANT', invitationStatus: 'ACCEPTED' },
      distinct: ['userId'],
      select: { userId: true },
    });
    expect(stats.participantsCount).toBe(3);
  });

  it('never includes a "countries" field — no data source exists for it', async () => {
    const prisma = makePrisma();
    prisma.event.count.mockResolvedValue(0);
    prisma.submission.count.mockResolvedValue(0);
    prisma.eventMembership.findMany.mockResolvedValue([]);
    const service = new PlatformStatsService(prisma as any);

    const stats = await service.getStats();

    expect(Object.keys(stats).sort()).toEqual(['eventsCount', 'participantsCount', 'submissionsCount']);
  });
});
