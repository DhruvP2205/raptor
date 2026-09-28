import { Injectable, NotFoundException } from '@nestjs/common';
import { GlobalAwardKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { GlobalRankingQueueService } from '../queues/global-ranking-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UpdatePointsConfigDto } from './dto/update-points-config.dto';

const DEFAULT_POINTS: Record<GlobalAwardKind, number> = {
  PODIUM_FIRST: 10,
  PODIUM_SECOND: 6,
  PODIUM_THIRD: 4,
  SPECIAL_AWARD: 2,
  AUDIENCE_CHOICE: 2,
};

const MAX_PAGE_LIMIT = 100;
const CACHE_TTL_SECONDS = 60 * 10;

// Module 14 (Global Ranking) — see docs/stages/14-global-ranking.md.
// The read side (paginated leaderboard, per-person drill-down) plus
// admin points-config CRUD and the manual-recompute trigger. The
// actual aggregation runs in apps/worker (processor.ts) — this service
// never computes a cross-event aggregate itself, only enqueues and
// reads back whatever the worker already persisted (Section 6: "never
// computed live per request").
@Injectable()
export class GlobalRankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly queue: GlobalRankingQueueService,
  ) {}

  // --- Points config (Section 3) ---

  async getPointsConfig() {
    const rows = await this.prisma.globalPointsConfig.findMany();
    const byKind = new Map(rows.map((r) => [r.awardKind, r]));
    return (Object.keys(DEFAULT_POINTS) as GlobalAwardKind[]).map((awardKind) => {
      const row = byKind.get(awardKind);
      return {
        awardKind,
        points: row?.points ?? DEFAULT_POINTS[awardKind],
        updatedByUserId: row?.updatedByUserId ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async updatePointsConfig(awardKind: GlobalAwardKind, userId: string, dto: UpdatePointsConfigDto) {
    const updated = await this.prisma.globalPointsConfig.upsert({
      where: { awardKind },
      create: { awardKind, points: dto.points, updatedByUserId: userId },
      update: { points: dto.points, updatedByUserId: userId },
    });

    // A points-table edit does NOT retroactively rewrite historical
    // snapshots (Section 3's own note) — deliberately no recompute
    // enqueued here; the new value takes effect on the next recompute,
    // whenever that naturally happens.
    await this.audit.record(userId, 'GLOBAL_POINTS_CONFIG_UPDATED', { awardKind, points: dto.points });

    return updated;
  }

  // --- Manual recompute (Section 6) ---

  async triggerRecompute(userId: string, reason?: string) {
    await this.audit.record(userId, 'GLOBAL_RANKING_RECOMPUTE_TRIGGERED', { reason: reason ?? null });
    await this.queue.enqueueRecompute({ triggeredByUserId: userId, triggerReason: reason ?? null });
    return { triggered: true };
  }

  // --- Public leaderboard (Section 6 — paginated, cached, never a live aggregate) ---

  async getLeaderboard(page: number, limit: number, search?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(MAX_PAGE_LIMIT, Math.max(1, limit));

    const current = await this.prisma.globalRankingSnapshot.findFirst({ where: { isCurrent: true } });
    if (!current) {
      return { snapshotId: null, generatedAt: null, page: safePage, limit: safeLimit, totalCount: 0, entries: [] };
    }

    // design/14-global-ranking.md Section 2's "Toolbar: search by name"
    // has no backing query param on this endpoint at all — added here,
    // additive, rather than filtering client-side (which could only
    // ever search whatever page happened to already be loaded). A
    // search deliberately bypasses the cache: it's a narrower,
    // less-repeatable query than the default paginated list, and adding
    // every distinct search string as its own cache key isn't worth it
    // for what's expected to be a lightly-used toolbar filter.
    const trimmedSearch = search?.trim();
    const where = trimmedSearch
      ? { snapshotId: current.id, user: { displayName: { contains: trimmedSearch, mode: 'insensitive' as const } } }
      : { snapshotId: current.id };

    if (trimmedSearch) {
      const [totalCount, entries] = await Promise.all([
        this.prisma.globalRankingEntry.count({ where }),
        this.prisma.globalRankingEntry.findMany({
          where,
          orderBy: { rank: 'asc' },
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
          include: { user: { select: { id: true, displayName: true } } },
        }),
      ]);
      return {
        snapshotId: current.id,
        generatedAt: current.generatedAt,
        page: safePage,
        limit: safeLimit,
        totalCount,
        entries: entries.map(this.toLeaderboardEntry),
      };
    }

    const cacheKey = `global-ranking:${current.id}:page:${safePage}:limit:${safeLimit}`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // Cache is a pure optimization — fall through to a fresh read.
    }

    const [totalCount, entries] = await Promise.all([
      this.prisma.globalRankingEntry.count({ where }),
      this.prisma.globalRankingEntry.findMany({
        where,
        orderBy: { rank: 'asc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        include: { user: { select: { id: true, displayName: true } } },
      }),
    ]);

    const result = {
      snapshotId: current.id,
      generatedAt: current.generatedAt,
      page: safePage,
      limit: safeLimit,
      totalCount,
      entries: entries.map(this.toLeaderboardEntry),
    };

    try {
      await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    } catch {
      /* best effort */
    }

    return result;
  }

  private toLeaderboardEntry(e: {
    userId: string;
    user: { displayName: string };
    rank: number;
    isTied: boolean;
    points: number;
    prizeUsdTotal: number;
    eventsCount: number;
    awardsCount: number;
    firstsCount: number;
    secondsCount: number;
    thirdsCount: number;
  }) {
    return {
      userId: e.userId,
      displayName: e.user.displayName,
      rank: e.rank,
      isTied: e.isTied,
      points: e.points,
      prizeUsdTotal: e.prizeUsdTotal,
      eventsCount: e.eventsCount,
      awardsCount: e.awardsCount,
      firstsCount: e.firstsCount,
      secondsCount: e.secondsCount,
      thirdsCount: e.thirdsCount,
    };
  }

  // --- Per-person drill-down (Section 6 — separate, on-demand query) ---

  async getUserDrilldown(userId: string) {
    // design/14-global-ranking.md Section 3's states table draws a hard
    // line between "person not found (bad ID) -> plain 404" and "person
    // has zero global-ranking data at all -> profile still renders,
    // award section shows 'No awards yet'" — a real, normal state for
    // most users, not an error. The old `return null` for both cases
    // couldn't tell them apart; a real user with no ranking entry looked
    // identical to a garbage UUID.
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true } });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'No such user.' });
    }

    const current = await this.prisma.globalRankingSnapshot.findFirst({ where: { isCurrent: true } });
    const entry = current
      ? await this.prisma.globalRankingEntry.findUnique({
          where: { snapshotId_userId: { snapshotId: current.id, userId } },
          include: {
            awardDetails: { include: { event: { select: { id: true, name: true, slug: true } } } },
          },
        })
      : null;

    if (!entry) {
      return {
        userId: user.id,
        displayName: user.displayName,
        rank: null,
        isTied: false,
        points: 0,
        prizeUsdTotal: 0,
        eventsCount: 0,
        awardsCount: 0,
        firstsCount: 0,
        secondsCount: 0,
        thirdsCount: 0,
        awards: [],
      };
    }

    return {
      userId: entry.userId,
      displayName: user.displayName,
      rank: entry.rank,
      isTied: entry.isTied,
      points: entry.points,
      prizeUsdTotal: entry.prizeUsdTotal,
      eventsCount: entry.eventsCount,
      awardsCount: entry.awardsCount,
      firstsCount: entry.firstsCount,
      secondsCount: entry.secondsCount,
      thirdsCount: entry.thirdsCount,
      awards: entry.awardDetails.map((d) => ({
        event: d.event,
        submissionId: d.submissionId,
        awardKind: d.awardKind,
        label: d.label,
        teamName: d.teamName,
        projectName: d.projectName,
        finalScore: d.finalScore,
        prizeUsd: d.prizeUsd,
        pointsAwarded: d.pointsAwarded,
      })),
    };
  }
}
