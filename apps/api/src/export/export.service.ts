import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CsvValue } from './csv.util';

export interface CsvTable {
  columns: string[];
  rows: CsvValue[][];
}

// D168/D170, docs/design/18-csv-export.md — organizer tier, eight
// exports, each scoped to one event via EventRoleGuard (Section 1).
// Deliberately independent of Results/Voting's draft/publish pipeline
// wherever a doc section says so explicitly (Scores' raw average,
// Section 7) — everything else follows the doc's own gating rules
// (Rank blank pre-publish, Voting Results empty pre-close) exactly.
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  // Section 3 — one row per registered participant.
  async exportRegistrations(eventId: string): Promise<CsvTable> {
    const memberships = await this.prisma.eventMembership.findMany({
      where: { eventId, role: 'PARTICIPANT', invitationStatus: 'ACCEPTED' },
      include: { user: { select: { id: true, displayName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const teamMemberships = await this.prisma.teamMembership.findMany({
      where: { userId: { in: memberships.map((m) => m.userId) }, team: { eventId } },
      include: { team: { select: { name: true } } },
    });
    const teamNameByUserId = new Map(teamMemberships.map((tm) => [tm.userId, tm.team.name]));

    return {
      columns: ['Name', 'Email', 'Registered At', 'Team'],
      rows: memberships.map((m) => [
        m.user.displayName,
        m.user.email,
        m.createdAt.toISOString(),
        teamNameByUserId.get(m.userId) ?? 'Not yet on a team',
      ]),
    };
  }

  // Section 4 — one row per team. "Admin" is Team.adminUserId, not a
  // TeamMembership field — TeamMembership has no isAdmin column; an
  // earlier version of this doc assumed otherwise, checked directly
  // against schema.prisma rather than assumed (same discipline D172
  // established for Module 16).
  async exportTeams(eventId: string): Promise<CsvTable> {
    const teams = await this.prisma.team.findMany({
      where: { eventId },
      include: {
        admin: { select: { displayName: true, email: true } },
        members: { include: { user: { select: { email: true } } } },
        submission: { select: { everSubmitted: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      columns: ['Team Name', 'Admin Name', 'Admin Email', 'Member Count', 'Member Emails', 'Has Submission', 'Created At'],
      rows: teams.map((t) => [
        t.name,
        t.admin.displayName,
        t.admin.email,
        t.members.length,
        t.members.map((m) => m.user.email).join(';'),
        t.submission?.everSubmitted ?? false,
        t.createdAt.toISOString(),
      ]),
    };
  }

  // Section 5 — one row per judge. Reliability notes are platform-wide
  // (JudgeReliabilityNote.eventId is context-only, per that model's own
  // comment), so this deliberately does not filter by this event —
  // an organizer is meant to see the judge's full reliability history,
  // same as the live assignment board already shows.
  async exportJudgesAndLoad(eventId: string): Promise<CsvTable> {
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const memberships = await this.prisma.eventMembership.findMany({
      where: { eventId, role: 'JUDGE', invitationStatus: 'ACCEPTED' },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });

    const rows: CsvValue[][] = [];
    for (const m of memberships) {
      const assignments = await this.prisma.judgeAssignment.findMany({
        where: { eventId, judgeId: m.userId },
        select: { status: true },
      });
      const completed = assignments.filter((a) => a.status === 'COMPLETED').length;
      const notes = await this.prisma.judgeReliabilityNote.findMany({
        where: { judgeUserId: m.userId },
        orderBy: { createdAt: 'asc' },
        select: { remark: true },
      });

      rows.push([
        m.user.displayName,
        m.user.email,
        assignments.length,
        completed,
        m.projectLimitOverride ?? event.maxProjectsPerJudge,
        notes.map((n) => n.remark).join('; '),
      ]);
    }

    return { columns: ['Judge Name', 'Judge Email', 'Assigned', 'Completed', 'Limit', 'Reliability Note'], rows };
  }

  // Section 6 — the checker's target (Section 2). A genuine field
  // absence (e.g. no liveUrl) stays a blank cell — unlike Module 16's
  // fixture importer, which synthesizes a placeholder for a required
  // field a *fixture* omits, this is real user data and Module 5 never
  // required these fields in the first place.
  async exportSubmissions(eventId: string): Promise<CsvTable> {
    const submissions = await this.prisma.submission.findMany({
      where: { eventId, everSubmitted: true },
      include: {
        team: { select: { name: true } },
        soloUser: { select: { displayName: true } },
        verification: { select: { checkStatus: true, finalDecision: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    // trackIds is a raw String[] column, not a relation — resolve names
    // via a separate lookup rather than a (nonexistent) include.
    const allTrackIds = [...new Set(submissions.flatMap((s) => s.trackIds))];
    const tracks = allTrackIds.length
      ? await this.prisma.track.findMany({ where: { id: { in: allTrackIds } }, select: { id: true, name: true } })
      : [];
    const trackNameById = new Map(tracks.map((t) => [t.id, t.name]));

    return {
      columns: ['Title', 'Team', 'Track', 'Repo URL', 'Demo Video URL', 'Live URL', 'Status', 'Submitted At', 'Verification Check', 'Verification Decision'],
      rows: submissions.map((s) => [
        s.title ?? '',
        s.team?.name ?? s.soloUser?.displayName ?? '',
        s.trackIds.map((id) => trackNameById.get(id)).filter(Boolean).join(';') || '',
        s.repoUrl ?? '',
        s.demoVideoUrl ?? '',
        s.liveUrl ?? '',
        s.isDraft ? 'Draft' : 'Submitted',
        s.submittedAt ? s.submittedAt.toISOString() : '',
        s.verification?.checkStatus ?? 'NOT_RUN',
        s.verification?.finalDecision ?? 'PENDING_REVIEW',
      ]),
    };
  }

  // Section 7 — current state regardless of publish status (raw
  // average is never gated); Rank is the one column that IS gated,
  // present only once a PublishedResultVersion is LIVE.
  async exportScores(eventId: string): Promise<CsvTable> {
    const submissions = await this.prisma.submission.findMany({
      where: { eventId, everSubmitted: true },
      include: {
        team: { select: { name: true } },
        soloUser: { select: { displayName: true } },
        judgeAssignments: {
          include: { scores: { include: { criterion: { select: { kind: true } } } } },
        },
        normalizedScores: {
          include: { normalizationRun: { select: { runAt: true } } },
          orderBy: { normalizationRun: { runAt: 'desc' } },
          take: 1,
        },
        specialAwardResultEntries: {
          include: { publishedResultVersion: { select: { status: true } }, criterion: { select: { label: true } } },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const liveVersion = await this.prisma.publishedResultVersion.findFirst({
      where: { eventId, status: 'LIVE' },
      select: { id: true },
    });
    const rankBySubmissionId = new Map<string, number>();
    if (liveVersion) {
      const entries = await this.prisma.rankResultEntry.findMany({
        where: { publishedResultVersionId: liveVersion.id },
        select: { submissionId: true, rank: true },
      });
      for (const e of entries) rankBySubmissionId.set(e.submissionId, e.rank);
    }

    const allTrackIds = [...new Set(submissions.flatMap((s) => s.trackIds))];
    const tracks = allTrackIds.length
      ? await this.prisma.track.findMany({ where: { id: { in: allTrackIds } }, select: { id: true, name: true } })
      : [];
    const trackNameById = new Map(tracks.map((t) => [t.id, t.name]));

    return {
      columns: ['Title', 'Team', 'Track', 'Average Raw Score', 'Normalized Score', 'Rank', 'Reviews Completed/Assigned', 'Special Award Nominations'],
      rows: submissions.map((s) => {
        const completedAssignments = s.judgeAssignments.filter((a) => a.status === 'COMPLETED');
        const scoringValues = completedAssignments.flatMap((a) =>
          a.scores.filter((sc) => sc.criterion.kind === 'SCORING').map((sc) => sc.value),
        );
        const avgRaw = scoringValues.length > 0 ? scoringValues.reduce((a, b) => a + b, 0) / scoringValues.length : null;
        const normalized = s.normalizedScores[0]?.finalScore ?? null;
        const rank = rankBySubmissionId.get(s.id) ?? null;
        const nominations = s.specialAwardResultEntries
          .filter((e) => e.publishedResultVersion.status === 'LIVE')
          .map((e) => e.criterion.label)
          .join('; ');

        return [
          s.title ?? '',
          s.team?.name ?? s.soloUser?.displayName ?? '',
          s.trackIds.map((id) => trackNameById.get(id)).filter(Boolean).join(';') || '',
          avgRaw !== null ? avgRaw.toFixed(2) : '',
          normalized !== null ? normalized.toFixed(2) : '',
          rank !== null ? rank : '',
          `${completedAssignments.length}/${s.judgeAssignments.length}`,
          nominations,
        ];
      }),
    };
  }

  // Section 8 — one row per submission PER RUN (full history), not
  // just the latest; doubles as evidence for the Normalization Proof
  // bonus challenge. Rank (raw)/Rank (normalized) computed at export
  // time, dense ranking, independently for each column.
  async exportNormalizationComparison(eventId: string): Promise<CsvTable> {
    const runs = await this.prisma.normalizationRun.findMany({
      where: { eventId },
      orderBy: { runAt: 'asc' },
      include: {
        normalizedScores: {
          include: { submission: { select: { id: true, title: true, team: { select: { name: true } }, soloUser: { select: { displayName: true } } } } },
        },
      },
    });

    const rows: CsvValue[][] = [];
    for (const run of runs) {
      // Raw average per submission at the time of this run — the
      // simplest faithful input is each entry's own averagedZScore
      // source data isn't stored raw here, so recompute the same raw
      // average exportSubmissionsCsv/exportScores use, from COMPLETED
      // assignments as they stand now (Section 8 doesn't ask for a
      // frozen historical raw value, only the run's own finalScore
      // output — the raw side is this run's input for context).
      const submissionIds = run.normalizedScores.map((ns) => ns.submissionId);
      const assignments = await this.prisma.judgeAssignment.findMany({
        where: { submissionId: { in: submissionIds }, status: 'COMPLETED' },
        include: { scores: { include: { criterion: { select: { kind: true } } } } },
      });
      const rawAvgBySubmissionId = new Map<string, number>();
      for (const sid of submissionIds) {
        const values = assignments
          .filter((a) => a.submissionId === sid)
          .flatMap((a) => a.scores.filter((sc) => sc.criterion.kind === 'SCORING').map((sc) => sc.value));
        if (values.length > 0) rawAvgBySubmissionId.set(sid, values.reduce((a, b) => a + b, 0) / values.length);
      }

      const denseRank = (getValue: (ns: (typeof run.normalizedScores)[number]) => number | undefined) => {
        const sorted = [...run.normalizedScores]
          .filter((ns) => getValue(ns) !== undefined)
          .sort((a, b) => getValue(b)! - getValue(a)!);
        const rankByEntryId = new Map<string, number>();
        let rank = 0;
        let lastValue: number | undefined;
        for (const ns of sorted) {
          const v = getValue(ns)!;
          if (v !== lastValue) rank++;
          rankByEntryId.set(ns.id, rank);
          lastValue = v;
        }
        return rankByEntryId;
      };
      const rawRankByEntryId = denseRank((ns) => rawAvgBySubmissionId.get(ns.submissionId));
      const normalizedRankByEntryId = denseRank((ns) => ns.finalScore);

      for (const ns of run.normalizedScores) {
        rows.push([
          run.runAt.toISOString(),
          ns.submission.title ?? '',
          ns.submission.team?.name ?? ns.submission.soloUser?.displayName ?? '',
          rawAvgBySubmissionId.get(ns.submissionId)?.toFixed(2) ?? '',
          ns.finalScore.toFixed(2),
          rawRankByEntryId.get(ns.id) ?? '',
          normalizedRankByEntryId.get(ns.id) ?? '',
        ]);
      }
    }

    return { columns: ['Run Timestamp', 'Title', 'Team', 'Average Raw Score', 'Normalized Final Score', 'Rank (raw order)', 'Rank (normalized order)'], rows };
  }

  // Section 9 — one row per shortlisted submission, per round; a round
  // with no published results yet contributes nothing (header-only is
  // the whole-export empty case, Section 16). "Won" is
  // VotingResultEntry.isSharedWin verbatim — despite the name, that
  // field is already true for a lone clear winner too, not only a tie
  // (see VotingService.computeTally: `isSharedWin: maxCount > 0 &&
  // voteCount === maxCount`) — it IS the "won" flag, not a tie-only one.
  async exportVotingResults(eventId: string): Promise<CsvTable> {
    const versions = await this.prisma.votingResultVersion.findMany({
      where: { eventId },
      include: {
        votingRound: { select: { roundNumber: true } },
        entries: {
          where: { isDisqualified: false },
          include: { submission: { select: { title: true, team: { select: { name: true } }, soloUser: { select: { displayName: true } } } } },
        },
      },
      orderBy: [{ votingRoundId: 'asc' }, { versionNumber: 'desc' }],
    });

    // Latest version per round, skipping a round whose latest version
    // was fully retracted (UNPUBLISHED) rather than superseded by a
    // newer correction.
    const latestByRound = new Map<string, (typeof versions)[number]>();
    for (const v of versions) {
      if (!latestByRound.has(v.votingRoundId)) latestByRound.set(v.votingRoundId, v);
    }

    const rows: CsvValue[][] = [];
    for (const v of latestByRound.values()) {
      if (v.status === 'UNPUBLISHED') continue;
      for (const e of v.entries) {
        rows.push([
          v.votingRound.roundNumber,
          e.submission.title ?? '',
          e.submission.team?.name ?? e.submission.soloUser?.displayName ?? '',
          e.voteCount,
          e.votePercentage.toFixed(1),
          e.isSharedWin,
        ]);
      }
    }

    return { columns: ['Round', 'Title', 'Team', 'Vote Count', 'Percentage', 'Won'], rows };
  }

  // Section 10 — one row per Certificate, not per person (Module 12
  // allows several per person per event). Recipient Name comes from
  // payloadJson.recipientName (the snapshot taken "at issuance",
  // CertificatesService.issue) — not a live User.displayName read,
  // which could have changed since.
  async exportCertificates(eventId: string): Promise<CsvTable> {
    const certificates = await this.prisma.certificate.findMany({
      where: { eventId },
      orderBy: { issuedAt: 'asc' },
    });

    return {
      columns: ['Recipient Name', 'Role', 'Issued At', 'Certificate ID'],
      rows: certificates.map((c) => [
        (c.payloadJson as { recipientName?: string } | null)?.recipientName ?? '',
        c.role,
        c.issuedAt.toISOString(),
        c.id,
      ]),
    };
  }
}
