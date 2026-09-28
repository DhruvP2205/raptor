import { NotFoundException } from '@nestjs/common';
import { GlobalRankingService } from './global-ranking.service';

function makePrisma() {
  return {
    globalPointsConfig: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    globalRankingSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    globalRankingEntry: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

function makeRedis() {
  const store = new Map<string, string>();
  return {
    client: {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
    },
  } as any;
}

function makeQueue() {
  return { enqueueRecompute: jest.fn() };
}

describe('GlobalRankingService', () => {
  describe('getPointsConfig (Section 3 — fallback to stage-doc defaults)', () => {
    it('returns the documented default for every award kind when nothing has been configured', async () => {
      const prisma = makePrisma();
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      const config = await service.getPointsConfig();

      const byKind = Object.fromEntries(config.map((c) => [c.awardKind, c.points]));
      expect(byKind).toEqual({
        PODIUM_FIRST: 10,
        PODIUM_SECOND: 6,
        PODIUM_THIRD: 4,
        SPECIAL_AWARD: 2,
        AUDIENCE_CHOICE: 2,
      });
    });

    it('uses the stored value instead of the default once an admin has configured one', async () => {
      const prisma = makePrisma();
      prisma.globalPointsConfig.findMany.mockResolvedValue([{ awardKind: 'PODIUM_FIRST', points: 999, updatedByUserId: 'admin-1', updatedAt: new Date() }]);
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      const config = await service.getPointsConfig();

      expect(config.find((c) => c.awardKind === 'PODIUM_FIRST')!.points).toBe(999);
      expect(config.find((c) => c.awardKind === 'PODIUM_SECOND')!.points).toBe(6); // still the default
    });
  });

  describe('updatePointsConfig — never retroactively rewrites a snapshot (Section 3)', () => {
    it('upserts the row and audits, and never enqueues a recompute', async () => {
      const prisma = makePrisma();
      const audit = makeAudit();
      const queue = makeQueue();
      const service = new GlobalRankingService(prisma, audit as any, makeRedis(), queue as any);

      await service.updatePointsConfig('PODIUM_FIRST' as any, 'admin-1', { points: 50 });

      expect(prisma.globalPointsConfig.upsert).toHaveBeenCalledWith({
        where: { awardKind: 'PODIUM_FIRST' },
        create: { awardKind: 'PODIUM_FIRST', points: 50, updatedByUserId: 'admin-1' },
        update: { points: 50, updatedByUserId: 'admin-1' },
      });
      expect(audit.record).toHaveBeenCalledWith('admin-1', 'GLOBAL_POINTS_CONFIG_UPDATED', { awardKind: 'PODIUM_FIRST', points: 50 });
      expect(queue.enqueueRecompute).not.toHaveBeenCalled();
    });
  });

  describe('triggerRecompute (Section 6 — manual admin trigger)', () => {
    it('audits and enqueues with the admin\'s id and reason attached', async () => {
      const prisma = makePrisma();
      const audit = makeAudit();
      const queue = makeQueue();
      const service = new GlobalRankingService(prisma, audit as any, makeRedis(), queue as any);

      await service.triggerRecompute('admin-1', 'fixing a data issue');

      expect(audit.record).toHaveBeenCalledWith('admin-1', 'GLOBAL_RANKING_RECOMPUTE_TRIGGERED', { reason: 'fixing a data issue' });
      expect(queue.enqueueRecompute).toHaveBeenCalledWith({ triggeredByUserId: 'admin-1', triggerReason: 'fixing a data issue' });
    });
  });

  describe('getLeaderboard (Section 6 — paginated, cached, snapshot-based)', () => {
    it('returns an empty, snapshotId: null result when no snapshot has ever been generated', async () => {
      const prisma = makePrisma();
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      const result = await service.getLeaderboard(1, 20);

      expect(result).toEqual({ snapshotId: null, generatedAt: null, page: 1, limit: 20, totalCount: 0, entries: [] });
    });

    it('paginates via skip/take against the current snapshot, never returning the full list', async () => {
      const prisma = makePrisma();
      prisma.globalRankingSnapshot.findFirst.mockResolvedValue({ id: 'snap-1', generatedAt: new Date() });
      prisma.globalRankingEntry.count.mockResolvedValue(57);
      prisma.globalRankingEntry.findMany.mockResolvedValue([]);
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      const result = await service.getLeaderboard(2, 20);

      expect(prisma.globalRankingEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { snapshotId: 'snap-1' }, skip: 20, take: 20 }),
      );
      expect(result.totalCount).toBe(57);
    });

    it('caches a page and returns byte-identical content on a second request without re-querying Postgres', async () => {
      const prisma = makePrisma();
      prisma.globalRankingSnapshot.findFirst.mockResolvedValue({ id: 'snap-1', generatedAt: new Date() });
      prisma.globalRankingEntry.count.mockResolvedValue(1);
      prisma.globalRankingEntry.findMany.mockResolvedValue([
        { userId: 'u1', rank: 1, isTied: false, points: 10, prizeUsdTotal: 0, eventsCount: 1, awardsCount: 1, firstsCount: 1, secondsCount: 0, thirdsCount: 0, user: { id: 'u1', displayName: 'Ada' } },
      ]);
      const redis = makeRedis();
      const service = new GlobalRankingService(prisma, makeAudit() as any, redis, makeQueue() as any);

      const first = await service.getLeaderboard(1, 20);
      const second = await service.getLeaderboard(1, 20);

      // The cached copy round-trips through JSON, so a Date becomes an
      // ISO string — compare the serialized form, which is what
      // "byte-identical" actually means for a cache (D37-equivalent).
      expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
      expect(prisma.globalRankingEntry.findMany).toHaveBeenCalledTimes(1); // second call was a cache hit
    });

    it('clamps an oversized limit to the maximum page size', async () => {
      const prisma = makePrisma();
      prisma.globalRankingSnapshot.findFirst.mockResolvedValue({ id: 'snap-1', generatedAt: new Date() });
      prisma.globalRankingEntry.count.mockResolvedValue(0);
      prisma.globalRankingEntry.findMany.mockResolvedValue([]);
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      const result = await service.getLeaderboard(1, 10000);

      expect(result.limit).toBeLessThanOrEqual(100);
    });
  });

  describe('getUserDrilldown (Section 6 — per-person, on-demand)', () => {
    it('throws NotFoundException for a userId with no matching account at all', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      await expect(service.getUserDrilldown('bogus-id')).rejects.toBeInstanceOf(NotFoundException);
    });

    // design/14-global-ranking.md Section 3 — "profile still renders...
    // a real, normal state for the majority of platform users, not an
    // edge case to treat as broken." A real account with zero ranking
    // data must never look identical to a nonexistent one.
    it('returns a zeroed shell (not null, not 404) when there is no current snapshot at all', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', displayName: 'Ada' });
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      const result = await service.getUserDrilldown('user-1');
      expect(result.displayName).toBe('Ada');
      expect(result.rank).toBeNull();
      expect(result.points).toBe(0);
      expect(result.awards).toEqual([]);
    });

    it('returns a zeroed shell for a real person not present in the current snapshot', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-not-ranked', displayName: 'Bob' });
      prisma.globalRankingSnapshot.findFirst.mockResolvedValue({ id: 'snap-1' });
      prisma.globalRankingEntry.findUnique.mockResolvedValue(null);
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      const result = await service.getUserDrilldown('user-not-ranked');
      expect(result.displayName).toBe('Bob');
      expect(result.awards).toEqual([]);
    });

    it('includes every award detail for a ranked person', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', displayName: 'Ada' });
      prisma.globalRankingSnapshot.findFirst.mockResolvedValue({ id: 'snap-1' });
      prisma.globalRankingEntry.findUnique.mockResolvedValue({
        userId: 'user-1',
        rank: 1,
        isTied: false,
        points: 10,
        prizeUsdTotal: 500,
        eventsCount: 1,
        awardsCount: 1,
        firstsCount: 1,
        secondsCount: 0,
        thirdsCount: 0,
        awardDetails: [
          { event: { id: 'e1', name: 'Hack', slug: 'hack' }, submissionId: 's1', awardKind: 'PODIUM_FIRST', label: '1st Place', teamName: null, projectName: 'Proj', finalScore: 95, prizeUsd: 500, pointsAwarded: 10 },
        ],
      });
      const service = new GlobalRankingService(prisma, makeAudit() as any, makeRedis(), makeQueue() as any);

      const result = await service.getUserDrilldown('user-1');

      expect(result!.awards).toHaveLength(1);
      expect(result!.awards[0].awardKind).toBe('PODIUM_FIRST');
    });
  });
});
