import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { GlobalRankingQueueService } from '../queues/global-ranking-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeJudgeRawTotal } from '../scoring/score-formula';
import type { CreateCorrectionDto } from './dto/create-correction.dto';
import type { CreateDraftDto } from './dto/create-draft.dto';
import type { UpdateDraftDto } from './dto/update-draft.dto';
import { computeRankResults, computeSpecialAwardWinners, type RankCandidate, type SpecialAwardCandidate } from './results-formula';

interface ComputedResults {
  rankRows: { submissionId: string; rank: number; displayScore: number; isScoreOverridden: boolean; isDisqualified: boolean }[];
  specialAwardRows: { criterionId: string; submissionId: string; nominationCount: number; isShared: boolean }[];
}

// Module 10 (Results & Rankings) — see
// docs/stages/10-results-and-rankings.md. Selecting a run, computing
// rank/special-award results, and the draft/publish/correction
// lifecycle sitting on top of Module 9's permanently-locked
// normalization output.
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly globalRankingQueue: GlobalRankingQueueService,
  ) {}

  // --- Drafts (Section 5.1) ---

  async createDraft(eventId: string, userId: string, dto: CreateDraftDto) {
    await this.getEventOrThrow(eventId);

    let normalizationRunId = dto.normalizationRunId;
    if (!normalizationRunId) {
      // Default: the most recent run, not automatic/implicit — the
      // organizer sees and can still override this (Section 2).
      const mostRecent = await this.prisma.normalizationRun.findFirst({
        where: { eventId },
        orderBy: { runAt: 'desc' },
      });
      if (!mostRecent) {
        throw new BadRequestException({
          code: 'NO_NORMALIZATION_RUN',
          message: 'Run normalization at least once before drafting results.',
        });
      }
      normalizationRunId = mostRecent.id;
    } else {
      const run = await this.prisma.normalizationRun.findUnique({ where: { id: normalizationRunId } });
      if (!run || run.eventId !== eventId) {
        throw new BadRequestException({
          code: 'INVALID_NORMALIZATION_RUN',
          message: 'That normalization run does not belong to this event.',
        });
      }
    }

    return this.prisma.resultsDraft.create({
      data: {
        eventId,
        normalizationRunId,
        publishMode: dto.publishMode ?? 'MANUAL',
        createdByUserId: userId,
      },
    });
  }

  async listDrafts(eventId: string) {
    await this.getEventOrThrow(eventId);
    return this.prisma.resultsDraft.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' } });
  }

  async updateDraft(eventId: string, draftId: string, dto: UpdateDraftDto) {
    await this.getDraftOrThrow(eventId, draftId);
    return this.prisma.resultsDraft.update({
      where: { id: draftId },
      data: {
        ...(dto.draftStatus !== undefined ? { draftStatus: dto.draftStatus } : {}),
        ...(dto.publishMode !== undefined ? { publishMode: dto.publishMode } : {}),
      },
    });
  }

  // Section 2 — "a preview of the ranking it would produce," computed
  // fresh, never persisted. Same computation publishDraft uses.
  async previewDraft(eventId: string, draftId: string) {
    const draft = await this.getDraftOrThrow(eventId, draftId);
    const computed = await this.computeResults(eventId, draft.normalizationRunId);
    return this.toPreviewShape(computed);
  }

  // computeResults (used to persist a version) only returns bare IDs —
  // persistNewVersion has no need for a title. The design doc's draft
  // preview needs "the same rank-list visual as the public page"
  // though, which requires a submission title and (for special awards)
  // a criterion label. Rather than inventing a second, drifting join on
  // the frontend, this mirrors getVersionDetail's own include shape so
  // one table component can render both a preview and a real version.
  private async toPreviewShape(computed: ComputedResults) {
    const submissionIds = [
      ...new Set([
        ...computed.rankRows.map((r) => r.submissionId),
        ...computed.specialAwardRows.map((r) => r.submissionId),
      ]),
    ];
    const criterionIds = [...new Set(computed.specialAwardRows.map((r) => r.criterionId))];
    const [submissions, criteria] = await Promise.all([
      this.prisma.submission.findMany({ where: { id: { in: submissionIds } }, select: { id: true, title: true } }),
      this.prisma.rubricCriterion.findMany({ where: { id: { in: criterionIds } }, select: { id: true, label: true } }),
    ]);
    const submissionById = new Map(submissions.map((s) => [s.id, s]));
    const criterionById = new Map(criteria.map((c) => [c.id, c]));
    return {
      rankEntries: computed.rankRows.map((r) => ({ ...r, submission: submissionById.get(r.submissionId) ?? null })),
      specialAwardEntries: computed.specialAwardRows.map((r) => ({
        ...r,
        submission: submissionById.get(r.submissionId) ?? null,
        criterion: criterionById.get(r.criterionId) ?? null,
      })),
    };
  }

  // --- Publishing (Section 5.2/5.3) ---

  async publishDraft(eventId: string, draftId: string, userId: string) {
    const draft = await this.getDraftOrThrow(eventId, draftId);
    const computed = await this.computeResults(eventId, draft.normalizationRunId);

    const version = await this.prisma.$transaction((tx) =>
      this.persistNewVersion(tx, eventId, computed, {
        publishedByUserId: userId,
        resultsDraftId: draft.id,
        correctionReason: null,
      }),
    );

    await this.audit.record(userId, 'RESULTS_PUBLISHED', {
      eventId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      draftId: draft.id,
    });

    // Module 14 — a LIVE PublishedResultVersion is one of this
    // platform's two recompute triggers (Section 6,
    // docs/stages/14-global-ranking.md). Fails open; never blocks a
    // publish.
    await this.globalRankingQueue.enqueueRecompute();

    return this.getVersionDetail(eventId, version.id);
  }

  async listVersions(eventId: string) {
    await this.getEventOrThrow(eventId);
    return this.prisma.publishedResultVersion.findMany({
      where: { eventId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async getVersionDetail(eventId: string, versionId: string) {
    const version = await this.prisma.publishedResultVersion.findUnique({
      where: { id: versionId },
      include: {
        rankEntries: { orderBy: { rank: 'asc' }, include: { submission: { select: { id: true, title: true } } } },
        specialAwardEntries: { include: { criterion: { select: { id: true, label: true } }, submission: { select: { id: true, title: true } } } },
      },
    });
    if (!version || version.eventId !== eventId) {
      throw new NotFoundException({ code: 'RESULT_VERSION_NOT_FOUND', message: 'No such published result version on this event.' });
    }
    const correctedSubmissionId = await this.deriveCorrectedSubmissionId(eventId, version);
    return { ...version, correctedSubmissionId };
  }

  // Section 7's "a corrected entry is visibly marked... never presented
  // identically to an original result" needs to know *which* row a
  // correction touched — but neither RankResultEntry nor
  // PublishedResultVersion stores that (only the version-level
  // `correctionReason`, and only SCORE_OVERRIDE happens to leave its
  // own row-level flag via `isScoreOverridden`; REORDER leaves no
  // marker at all). Rather than a schema migration to add a field
  // createCorrection would need to start populating, this derives the
  // answer the same way Module 9's raw-ranking gap was closed: diff
  // this version's entries against the immediately-previous version's
  // (by submissionId) — the row that differs is the one the correction
  // touched. Read-only, computed on read, never persisted.
  private async deriveCorrectedSubmissionId(
    eventId: string,
    version: { versionNumber: number; correctionReason: string | null; rankEntries: { submissionId: string; rank: number; displayScore: number; isDisqualified: boolean }[] },
  ): Promise<string | null> {
    if (!version.correctionReason || version.versionNumber <= 1) return null;
    const previous = await this.prisma.publishedResultVersion.findFirst({
      where: { eventId, versionNumber: version.versionNumber - 1 },
      include: { rankEntries: true },
    });
    if (!previous) return null;
    const previousBySubmission = new Map(previous.rankEntries.map((e) => [e.submissionId, e]));
    for (const entry of version.rankEntries) {
      const before = previousBySubmission.get(entry.submissionId);
      if (!before || before.rank !== entry.rank || before.displayScore !== entry.displayScore || before.isDisqualified !== entry.isDisqualified) {
        return entry.submissionId;
      }
    }
    return null;
  }

  // Section 4.2/6 — decoupled entirely from EventPhase. `@Public()` at
  // the controller; this method itself has no notion of who's asking.
  // Checks for a due, ready AUTO draft first (Section 5.2) — the same
  // "lazily resolve a time-based transition on next relevant read"
  // pattern Module 2 uses for stale pending judge invitations, rather
  // than requiring a background job scheduler this codebase doesn't
  // have.
  async getPublicResults(eventId: string) {
    await this.maybeAutoPublish(eventId);

    const live = await this.prisma.publishedResultVersion.findFirst({
      where: { eventId, status: 'LIVE' },
      include: {
        rankEntries: {
          where: { isDisqualified: false },
          orderBy: { rank: 'asc' },
          include: { submission: { select: { id: true, title: true } } },
        },
        specialAwardEntries: {
          include: { criterion: { select: { id: true, label: true } }, submission: { select: { id: true, title: true } } },
        },
      },
    });
    // No LIVE version — reveal nothing, regardless of EventPhase
    // (Section 6). Never null-coalesce to draft/partial data.
    if (!live) return null;
    const correctedSubmissionId = await this.deriveCorrectedSubmissionId(eventId, live);
    return { ...live, correctedSubmissionId };
  }

  private async maybeAutoPublish(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return;
    if (Date.now() < event.resultsAnnounceAt.getTime()) return;

    const alreadyLive = await this.prisma.publishedResultVersion.findFirst({ where: { eventId, status: 'LIVE' } });
    if (alreadyLive) return;

    // AUTO fires only if a READY draft exists at this moment (D136) —
    // an IN_PROGRESS draft is left alone, requiring an explicit manual
    // publish later; a MANUAL-mode draft never auto-fires at all.
    const draft = await this.prisma.resultsDraft.findFirst({
      where: { eventId, publishMode: 'AUTO', draftStatus: 'READY' },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) return;

    const computed = await this.computeResults(eventId, draft.normalizationRunId);
    const version = await this.prisma.$transaction((tx) =>
      this.persistNewVersion(tx, eventId, computed, {
        // No human clicked "publish" for an AUTO-fired version — the
        // organizer who built and readied this draft is the closest
        // real, valid attribution available; there's no synthetic
        // "system" user in this schema and none is warranted for one
        // attribution field.
        publishedByUserId: draft.createdByUserId,
        resultsDraftId: draft.id,
        correctionReason: null,
      }),
    );

    await this.audit.record(draft.createdByUserId, 'RESULTS_AUTO_PUBLISHED', {
      eventId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      draftId: draft.id,
    });

    await this.globalRankingQueue.enqueueRecompute();
  }

  // --- Post-publish corrections & unpublish (Section 5.4/7) ---

  async unpublish(eventId: string, versionId: string, userId: string, reason: string) {
    const version = await this.getVersionOrThrow(eventId, versionId);
    if (version.status !== 'LIVE') {
      throw new BadRequestException({
        code: 'NOT_LIVE',
        message: 'Only a currently LIVE version can be unpublished.',
      });
    }

    const updated = await this.prisma.publishedResultVersion.update({
      where: { id: versionId },
      data: { status: 'UNPUBLISHED', unpublishReason: reason },
    });

    await this.audit.record(userId, 'RESULTS_UNPUBLISHED', { eventId, versionId, reason });

    // Points from this event's podium/special-award entries must stop
    // counting the moment they're no longer LIVE (Section 6).
    await this.globalRankingQueue.enqueueRecompute();

    return updated;
  }

  // A correction always starts from the CURRENT LIVE version's entries
  // (never an arbitrary older/superseded one) and copies every entry
  // forward with exactly one change applied (Section 7) — never a
  // fresh recomputation from the run, which would risk silently
  // reintroducing changes unrelated to the one correction being made.
  async createCorrection(eventId: string, versionId: string, userId: string, dto: CreateCorrectionDto) {
    const current = await this.getVersionOrThrow(eventId, versionId);
    if (current.status !== 'LIVE') {
      throw new BadRequestException({
        code: 'NOT_LIVE',
        message: 'Corrections can only be made against the currently LIVE version.',
      });
    }

    const [rankEntries, specialAwardEntries] = await Promise.all([
      this.prisma.rankResultEntry.findMany({ where: { publishedResultVersionId: versionId } }),
      this.prisma.specialAwardResultEntry.findMany({ where: { publishedResultVersionId: versionId } }),
    ]);

    let rankRows = rankEntries.map((e) => ({
      submissionId: e.submissionId,
      rank: e.rank,
      displayScore: e.displayScore,
      isScoreOverridden: e.isScoreOverridden,
      isDisqualified: e.isDisqualified,
    }));
    let specialAwardRows = specialAwardEntries.map((e) => ({
      criterionId: e.criterionId,
      submissionId: e.submissionId,
      nominationCount: e.nominationCount,
      isShared: e.isShared,
    }));

    if (dto.type === 'DISQUALIFY') {
      rankRows = rankRows.map((r) => (r.submissionId === dto.submissionId ? { ...r, isDisqualified: true } : r));
      // "removing it from ranking/awards entirely going forward"
      // (Section 7) — dropped from special-award entries too, but a
      // runner-up is never automatically promoted into the vacated
      // spot; that would be a second, undocumented cascading
      // recompute this doc doesn't ask for.
      specialAwardRows = specialAwardRows.filter((r) => r.submissionId !== dto.submissionId);
    } else if (dto.type === 'REORDER') {
      rankRows = rankRows.map((r) => (r.submissionId === dto.submissionId ? { ...r, rank: dto.newRank! } : r));
    } else {
      rankRows = rankRows.map((r) =>
        r.submissionId === dto.submissionId ? { ...r, displayScore: dto.displayScore!, isScoreOverridden: true } : r,
      );
    }

    const version = await this.prisma.$transaction((tx) =>
      this.persistNewVersion(tx, eventId, { rankRows, specialAwardRows }, {
        publishedByUserId: userId,
        resultsDraftId: null,
        correctionReason: dto.reason,
      }),
    );

    await this.audit.record(userId, 'RESULTS_CORRECTED', {
      eventId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      previousVersionId: current.id,
      type: dto.type,
      submissionId: dto.submissionId,
      reason: dto.reason,
    });

    await this.globalRankingQueue.enqueueRecompute();

    return this.getVersionDetail(eventId, version.id);
  }

  // --- Computation (Sections 3/4) ---

  private async computeResults(eventId: string, normalizationRunId: string): Promise<ComputedResults> {
    const run = await this.prisma.normalizationRun.findUnique({ where: { id: normalizationRunId } });
    if (!run || run.eventId !== eventId) {
      throw new NotFoundException({ code: 'NORMALIZATION_RUN_NOT_FOUND', message: 'No such normalization run on this event.' });
    }

    const [normalizedScores, judgeScores] = await Promise.all([
      this.prisma.normalizedScore.findMany({ where: { normalizationRunId } }),
      this.prisma.normalizedJudgeScore.findMany({
        where: { normalizationRunId },
        include: { judgeAssignment: { include: { scores: { include: { criterion: true } } } } },
      }),
    ]);

    // bonusRaw isn't persisted anywhere (Module 9 only stores
    // rawTotal) — recomputed fresh from the same Score rows Module 9's
    // run used, which are frozen/immutable by this point (judging
    // closed before normalization can even run, Module 8's
    // judgingClosesAt lock).
    const bySubmission = new Map<string, { rawTotals: number[]; bonusRaws: number[] }>();
    for (const js of judgeScores) {
      const { bonusRaw } = computeJudgeRawTotal(
        js.judgeAssignment.scores.map((s) => ({ kind: s.criterion.kind, weightPercent: s.criterion.weightPercent, value: s.value })),
      );
      const submissionId = js.judgeAssignment.submissionId;
      const entry = bySubmission.get(submissionId) ?? { rawTotals: [], bonusRaws: [] };
      entry.rawTotals.push(js.rawTotal);
      entry.bonusRaws.push(bonusRaw);
      bySubmission.set(submissionId, entry);
    }
    const average = (values: number[]) => (values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0);

    // Module 6's gate still applies (Section 3) — only APPROVED
    // submissions ever enter rankings, even if a disqualified one
    // somehow has NormalizedScore rows from before it was disqualified.
    const submissionIds = [...new Set(normalizedScores.map((s) => s.submissionId))];
    const submissions = await this.prisma.submission.findMany({
      where: { id: { in: submissionIds } },
      include: { verification: true },
    });
    const approvedIds = new Set(
      submissions.filter((s) => s.verification?.finalDecision === 'APPROVED').map((s) => s.id),
    );

    const finalScoreBySubmission = new Map(normalizedScores.map((ns) => [ns.submissionId, ns.finalScore]));

    const rankCandidates: RankCandidate[] = normalizedScores
      .filter((ns) => approvedIds.has(ns.submissionId))
      .map((ns) => {
        const agg = bySubmission.get(ns.submissionId) ?? { rawTotals: [], bonusRaws: [] };
        return {
          submissionId: ns.submissionId,
          finalScore: ns.finalScore,
          averageRawTotal: average(agg.rawTotals),
          bonusRaw: average(agg.bonusRaws),
        };
      });

    const rankResults = computeRankResults(rankCandidates);
    const rankRows = rankResults.map((r) => ({
      submissionId: r.submissionId,
      rank: r.rank,
      displayScore: finalScoreBySubmission.get(r.submissionId) ?? 0,
      isScoreOverridden: false,
      isDisqualified: false,
    }));

    // Section 4 — special-award nominations, tallied only from
    // COMPLETED judge assignments (a PENDING/IN_PROGRESS assignment's
    // unset nomination never counts, by construction: Score rows only
    // exist once a judge has saved something, and status only reaches
    // COMPLETED via a validated submit-review).
    const specialAwardCriteria = await this.prisma.rubricCriterion.findMany({
      where: { eventId, kind: 'SPECIAL_AWARD' },
    });

    const specialAwardRows: ComputedResults['specialAwardRows'] = [];
    for (const criterion of specialAwardCriteria) {
      const nominations = await this.prisma.score.findMany({
        where: { criterionId: criterion.id, value: 1, judgeAssignment: { status: 'COMPLETED' } },
        select: { judgeAssignment: { select: { submissionId: true } } },
      });
      const countBySubmission = new Map<string, number>();
      for (const n of nominations) {
        const submissionId = n.judgeAssignment.submissionId;
        if (!approvedIds.has(submissionId)) continue;
        countBySubmission.set(submissionId, (countBySubmission.get(submissionId) ?? 0) + 1);
      }

      const candidates: SpecialAwardCandidate[] = [...countBySubmission.entries()].map(([submissionId, nominationCount]) => {
        const agg = bySubmission.get(submissionId) ?? { rawTotals: [], bonusRaws: [] };
        return {
          submissionId,
          nominationCount,
          bonusRaw: average(agg.bonusRaws),
          finalScore: finalScoreBySubmission.get(submissionId) ?? 0,
        };
      });

      const winners = computeSpecialAwardWinners(candidates);
      for (const winner of winners) {
        specialAwardRows.push({
          criterionId: criterion.id,
          submissionId: winner.submissionId,
          nominationCount: countBySubmission.get(winner.submissionId)!,
          isShared: winner.isShared,
        });
      }
    }

    return { rankRows, specialAwardRows };
  }

  private async persistNewVersion(
    tx: Prisma.TransactionClient,
    eventId: string,
    computed: ComputedResults,
    meta: { publishedByUserId: string; resultsDraftId: string | null; correctionReason: string | null },
  ) {
    // Never mutates the current LIVE version in place (Section 5.3/7)
    // — superseded, not edited, not deleted.
    await tx.publishedResultVersion.updateMany({
      where: { eventId, status: 'LIVE' },
      data: { status: 'SUPERSEDED' },
    });

    const previous = await tx.publishedResultVersion.findFirst({
      where: { eventId },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (previous?.versionNumber ?? 0) + 1;

    const version = await tx.publishedResultVersion.create({
      data: {
        eventId,
        versionNumber,
        status: 'LIVE',
        resultsDraftId: meta.resultsDraftId,
        publishedByUserId: meta.publishedByUserId,
        correctionReason: meta.correctionReason,
      },
    });

    if (computed.rankRows.length > 0) {
      await tx.rankResultEntry.createMany({
        data: computed.rankRows.map((r) => ({ ...r, publishedResultVersionId: version.id })),
      });
    }
    if (computed.specialAwardRows.length > 0) {
      await tx.specialAwardResultEntry.createMany({
        data: computed.specialAwardRows.map((r) => ({ ...r, publishedResultVersionId: version.id })),
      });
    }

    return version;
  }

  private async getEventOrThrow(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
    }
    return event;
  }

  private async getDraftOrThrow(eventId: string, draftId: string) {
    const draft = await this.prisma.resultsDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.eventId !== eventId) {
      throw new NotFoundException({ code: 'RESULTS_DRAFT_NOT_FOUND', message: 'No such results draft on this event.' });
    }
    return draft;
  }

  private async getVersionOrThrow(eventId: string, versionId: string) {
    const version = await this.prisma.publishedResultVersion.findUnique({ where: { id: versionId } });
    if (!version || version.eventId !== eventId) {
      throw new NotFoundException({ code: 'RESULT_VERSION_NOT_FOUND', message: 'No such published result version on this event.' });
    }
    return version;
  }
}
