import type { GlobalAwardKind, Prisma, PrismaClient, Prize } from '@prisma/client';
import { computeGlobalRanking, type GlobalRankCandidate } from './global-ranking-formula';

const DEFAULT_POINTS: Record<GlobalAwardKind, number> = {
  PODIUM_FIRST: 10,
  PODIUM_SECOND: 6,
  PODIUM_THIRD: 4,
  SPECIAL_AWARD: 2,
  AUDIENCE_CHOICE: 2,
};

const AWARD_LABELS: Record<GlobalAwardKind, string> = {
  PODIUM_FIRST: '1st Place',
  PODIUM_SECOND: '2nd Place',
  PODIUM_THIRD: '3rd Place',
  SPECIAL_AWARD: 'Special Award',
  AUDIENCE_CHOICE: 'Audience Choice',
};

interface AwardDetailDraft {
  eventId: string;
  submissionId: string | null;
  awardKind: GlobalAwardKind;
  label: string;
  teamName: string | null;
  projectName: string | null;
  finalScore: number | null;
  prizeUsd: number | null;
  pointsAwarded: number;
}

interface Accumulator {
  userId: string;
  points: number;
  prizeUsdTotal: number;
  firstsCount: number;
  secondsCount: number;
  thirdsCount: number;
  eventIds: Set<string>;
  awardDetails: AwardDetailDraft[];
}

// Module 14 (Global Ranking) — see docs/stages/14-global-ranking.md.
// Runs on the `worker` container (Section 6) — a genuinely
// background-appropriate job, unlike certificate rendering which
// stays synchronous in `api` (ARCHITECTURE.md §4). The whole
// per-recompute pipeline: resolve effective points, aggregate every
// LIVE result across every event, apply the six-level tie-break
// cascade, persist a brand-new snapshot.
export async function processGlobalRankingRecompute(
  prisma: PrismaClient,
  opts: { triggeredByUserId?: string | null; triggerReason?: string | null },
): Promise<void> {
  const pointsByKind = await resolvePointsConfig(prisma);
  const allPrizes = await prisma.prize.findMany();
  const accumulators = new Map<string, Accumulator>();

  const getAccumulator = (userId: string): Accumulator => {
    let acc = accumulators.get(userId);
    if (!acc) {
      acc = { userId, points: 0, prizeUsdTotal: 0, firstsCount: 0, secondsCount: 0, thirdsCount: 0, eventIds: new Set(), awardDetails: [] };
      accumulators.set(userId, acc);
    }
    return acc;
  };

  const credit = (userId: string, detail: AwardDetailDraft) => {
    const acc = getAccumulator(userId);
    acc.points += detail.pointsAwarded;
    acc.prizeUsdTotal += detail.prizeUsd ?? 0;
    acc.eventIds.add(detail.eventId);
    acc.awardDetails.push(detail);
    if (detail.awardKind === 'PODIUM_FIRST') acc.firstsCount += 1;
    if (detail.awardKind === 'PODIUM_SECOND') acc.secondsCount += 1;
    if (detail.awardKind === 'PODIUM_THIRD') acc.thirdsCount += 1;
  };

  // --- Podium + special award (Module 10, judge-decided results) ---
  const liveResultVersions = await prisma.publishedResultVersion.findMany({
    where: { status: 'LIVE' },
    include: {
      rankEntries: {
        where: { isDisqualified: false, rank: { in: [1, 2, 3] } },
        include: { submission: { include: submissionUsersInclude() } },
      },
      specialAwardEntries: {
        include: {
          criterion: true,
          submission: { include: submissionUsersInclude() },
        },
      },
    },
  });

  for (const version of liveResultVersions) {
    for (const entry of version.rankEntries) {
      const awardKind: GlobalAwardKind = entry.rank === 1 ? 'PODIUM_FIRST' : entry.rank === 2 ? 'PODIUM_SECOND' : 'PODIUM_THIRD';
      const points = pointsByKind.get(awardKind) ?? DEFAULT_POINTS[awardKind];
      const prizeUsd = resolvePrizeUsd(allPrizes, version.eventId, 'JUDGES', entry.rank, entry.submission.trackIds);
      const users = resolveSubmissionUsers(entry.submission);
      const detailBase: Omit<AwardDetailDraft, 'pointsAwarded'> = {
        eventId: version.eventId,
        submissionId: entry.submissionId,
        awardKind,
        label: AWARD_LABELS[awardKind],
        teamName: entry.submission.team?.name ?? null,
        projectName: entry.submission.title,
        finalScore: entry.displayScore,
        prizeUsd,
      };
      // Not split by team size — every teammate gets the full points
      // and the full prizeUsd (Section 7's own note).
      for (const userId of users) credit(userId, { ...detailBase, pointsAwarded: points });
    }

    for (const entry of version.specialAwardEntries) {
      const points = pointsByKind.get('SPECIAL_AWARD') ?? DEFAULT_POINTS.SPECIAL_AWARD;
      const users = resolveSubmissionUsers(entry.submission);
      const detailBase: Omit<AwardDetailDraft, 'pointsAwarded'> = {
        eventId: version.eventId,
        submissionId: entry.submissionId,
        awardKind: 'SPECIAL_AWARD',
        // The specific criterion's own label ("Best Design", etc.),
        // not the generic "Special Award" fallback — more useful on
        // the drill-down than a category name alone.
        label: entry.criterion.label,
        teamName: entry.submission.team?.name ?? null,
        projectName: entry.submission.title,
        finalScore: null,
        // No natural Prize link for a special-award criterion in this
        // data model (Prize has no criterionId) — left untracked
        // rather than guessed at.
        prizeUsd: null,
      };
      for (const userId of users) credit(userId, { ...detailBase, pointsAwarded: points });
    }
  }

  // --- Audience choice (Module 11, public voting) ---
  const liveVotingVersions = await prisma.votingResultVersion.findMany({
    where: { status: 'LIVE' },
    include: {
      entries: {
        where: { isSharedWin: true, isDisqualified: false },
        include: { submission: { include: submissionUsersInclude() } },
      },
    },
  });

  for (const version of liveVotingVersions) {
    const points = pointsByKind.get('AUDIENCE_CHOICE') ?? DEFAULT_POINTS.AUDIENCE_CHOICE;
    for (const entry of version.entries) {
      const prizeUsd = resolvePrizeUsd(allPrizes, version.eventId, 'PUBLIC_VOTE', null, entry.submission.trackIds);
      const users = resolveSubmissionUsers(entry.submission);
      const detailBase: Omit<AwardDetailDraft, 'pointsAwarded'> = {
        eventId: version.eventId,
        submissionId: entry.submissionId,
        awardKind: 'AUDIENCE_CHOICE',
        label: AWARD_LABELS.AUDIENCE_CHOICE,
        teamName: entry.submission.team?.name ?? null,
        projectName: entry.submission.title,
        finalScore: null,
        prizeUsd,
      };
      for (const userId of users) credit(userId, { ...detailBase, pointsAwarded: points });
    }
  }

  // --- eventsCount / firstEventId / firstEventDate ---
  const allEventIds = [...new Set([...accumulators.values()].flatMap((a) => [...a.eventIds]))];
  const events = allEventIds.length
    ? await prisma.event.findMany({ where: { id: { in: allEventIds } }, select: { id: true, eventStartsAt: true } })
    : [];
  const eventStartById = new Map(events.map((e) => [e.id, e.eventStartsAt]));

  const withFirstEvent = [...accumulators.values()].map((acc) => {
    let firstEventId: string | null = null;
    let firstEventDate: Date | null = null;
    for (const eventId of acc.eventIds) {
      const startsAt = eventStartById.get(eventId);
      if (startsAt && (firstEventDate === null || startsAt.getTime() < firstEventDate.getTime())) {
        firstEventDate = startsAt;
        firstEventId = eventId;
      }
    }
    return { acc, firstEventId, firstEventDate };
  });

  // --- tie-break cascade + dense ranking ---
  const rankCandidates: GlobalRankCandidate[] = withFirstEvent.map(({ acc, firstEventDate }) => ({
    userId: acc.userId,
    points: acc.points,
    firstsCount: acc.firstsCount,
    secondsCount: acc.secondsCount,
    thirdsCount: acc.thirdsCount,
    eventsCount: acc.eventIds.size,
    firstEventDate,
  }));
  const ranked = computeGlobalRanking(rankCandidates);
  const rankByUserId = new Map(ranked.map((r) => [r.userId, r]));

  // --- persist: new snapshot, flip the old one, never mutate history ---
  await prisma.$transaction(async (tx) => {
    await tx.globalRankingSnapshot.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });

    const snapshot = await tx.globalRankingSnapshot.create({
      data: {
        isCurrent: true,
        triggeredByUserId: opts.triggeredByUserId ?? null,
        triggerReason: opts.triggerReason ?? null,
      },
    });

    for (const { acc, firstEventId, firstEventDate } of withFirstEvent) {
      const rankResult = rankByUserId.get(acc.userId)!;
      const entry = await tx.globalRankingEntry.create({
        data: {
          snapshotId: snapshot.id,
          userId: acc.userId,
          points: acc.points,
          prizeUsdTotal: acc.prizeUsdTotal,
          eventsCount: acc.eventIds.size,
          awardsCount: acc.awardDetails.length,
          firstsCount: acc.firstsCount,
          secondsCount: acc.secondsCount,
          thirdsCount: acc.thirdsCount,
          firstEventId,
          firstEventDate,
          rank: rankResult.rank,
          isTied: rankResult.isTied,
        },
      });
      if (acc.awardDetails.length > 0) {
        await tx.globalRankingAwardDetail.createMany({
          data: acc.awardDetails.map((d) => ({ ...d, globalRankingEntryId: entry.id })),
        });
      }
    }
  });
}

function submissionUsersInclude() {
  return {
    soloUser: true,
    team: { include: { members: { include: { user: true } } } },
  } satisfies Prisma.SubmissionInclude;
}

function resolveSubmissionUsers(submission: {
  soloUserId: string | null;
  soloUser: { id: string } | null;
  team: { members: { user: { id: string } }[] } | null;
}): string[] {
  if (submission.soloUserId && submission.soloUser) return [submission.soloUser.id];
  if (submission.team) return submission.team.members.map((m) => m.user.id);
  return [];
}

// Best-effort, informational only — never affects points. Matches
// Prize rows for this event/decidedBy whose trackId is either unset
// (an overall prize) or one of the submission's own trackIds; sums
// prizeUsd across every match, since a submission can plausibly
// qualify for more than one (an overall prize plus a track prize).
// `rank` is only meaningful for JUDGES prizes — PUBLIC_VOTE prizes are
// matched on decidedBy/track alone, per Section 3's framing of
// audience choice as winner-take-all, not itself ranked.
function resolvePrizeUsd(
  prizes: Prize[],
  eventId: string,
  decidedBy: 'JUDGES' | 'PUBLIC_VOTE',
  rank: number | null,
  submissionTrackIds: string[],
): number | null {
  const matches = prizes.filter(
    (p) =>
      p.eventId === eventId &&
      p.decidedBy === decidedBy &&
      (rank === null || p.rank === rank) &&
      (p.trackId === null || submissionTrackIds.includes(p.trackId)),
  );
  if (matches.length === 0) return null;
  const total = matches.reduce((sum, p) => sum + (p.prizeUsd ?? 0), 0);
  return total > 0 ? total : null;
}

// Missing rows fall back to the stage doc's own stated defaults
// (Section 3) — an admin who has never touched this config still gets
// sensible, documented behavior, same "additive field, sensible
// default" precedent used throughout this project.
async function resolvePointsConfig(prisma: PrismaClient): Promise<Map<GlobalAwardKind, number>> {
  const rows = await prisma.globalPointsConfig.findMany();
  const map = new Map<GlobalAwardKind, number>(Object.entries(DEFAULT_POINTS) as [GlobalAwardKind, number][]);
  for (const row of rows) map.set(row.awardKind, row.points);
  return map;
}
