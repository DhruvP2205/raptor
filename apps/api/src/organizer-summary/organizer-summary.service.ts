import { Injectable } from '@nestjs/common';
import { AssignmentsService } from '../assignments/assignments.service';
import { MembershipService } from '../membership/membership.service';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationService } from '../verification/verification.service';

// design/15-organizer-shell.md Section 3 — the Overview dashboard's
// twelve status cards, aggregated from data every referenced module
// already exposes. No new backend capability, purely a read-side
// rollup: this service reuses AssignmentsService/VerificationService/
// MembershipService for the tools whose real filtering logic isn't
// worth duplicating, and queries Prisma directly for the handful of
// plain counts (tracks/prizes/rubric/submissions/normalization/
// results/voting/certificates) that don't have any logic beyond a
// single count/lookup.
//
// Each section is fetched independently and caught independently
// (`attempt()` below) rather than one big Promise.all — Section 6's
// testing requirement is explicit that one tool's failed load must
// never block the rest of the grid, which a single all-or-nothing
// request can't satisfy. A discriminated `Result<T>` — not a bare
// `T | null` — because several of these queries (`findFirst`) return a
// legitimate `null` on success (no row yet, a normal state); collapsing
// that into the same `null` used for "the query threw" would silently
// mask real failures as an ordinary empty state.
type Result<T> = { ok: true; value: T } | { ok: false };

async function attempt<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

@Injectable()
export class OrganizerSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly verification: VerificationService,
    private readonly membership: MembershipService,
  ) {}

  // Section 2's admin-bypass banner — a UI-only signal distinct from
  // EventRoleGuard's own audited bypass (which fires for *every*
  // siteAdmin call regardless of real membership). This checks
  // specifically whether the caller lacks a real ACCEPTED ORGANIZER
  // row on this event, per Section 6's testing requirement: the banner
  // must not appear for an admin who also genuinely organizes the event.
  private async isAdminBypass(eventId: string, caller: { id: string; siteAdmin: boolean }): Promise<boolean> {
    if (!caller.siteAdmin) return false;
    const membership = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: caller.id, eventId } },
    });
    return !(membership?.role === 'ORGANIZER' && membership.invitationStatus === 'ACCEPTED');
  }

  async getSummary(eventId: string, caller: { id: string; siteAdmin: boolean }) {
    const [
      isAdminBypass,
      tracksCount,
      prizesCount,
      rubricCriteria,
      submissionsCount,
      verificationRows,
      assignableSubmissions,
      progressRows,
      normalizationRun,
      liveResultVersion,
      resultsDraft,
      votingRound,
      event,
      certificatesIssuedCount,
      judgeInvitations,
    ] = await Promise.all([
      this.isAdminBypass(eventId, caller),
      attempt(this.prisma.track.count({ where: { eventId } })),
      attempt(this.prisma.prize.count({ where: { eventId } })),
      attempt(this.prisma.rubricCriterion.findMany({ where: { eventId }, select: { kind: true } })),
      attempt(this.prisma.submission.count({ where: { eventId, isDraft: false } })),
      attempt(this.verification.list(eventId)),
      attempt(this.assignments.listAssignableSubmissions(eventId)),
      attempt(this.assignments.progress(eventId)),
      attempt(this.prisma.normalizationRun.findFirst({ where: { eventId }, orderBy: { runAt: 'desc' } })),
      attempt(this.prisma.publishedResultVersion.findFirst({ where: { eventId, status: 'LIVE' } })),
      attempt(this.prisma.resultsDraft.findFirst({ where: { eventId }, orderBy: { createdAt: 'desc' } })),
      attempt(this.prisma.votingRound.findFirst({ where: { eventId }, orderBy: { roundNumber: 'desc' } })),
      attempt(
        this.prisma.event.findUniqueOrThrow({
          where: { id: eventId },
          select: { certificatesEnabled: true, judgingClosesAt: true },
        }),
      ),
      attempt(this.prisma.certificate.count({ where: { eventId } })),
      attempt(this.membership.listJudgeInvitations(eventId)),
    ]);

    const assignment = assignableSubmissions.ok
      ? (() => {
          const rows = assignableSubmissions.value;
          const assignedCount = rows.filter((s) => s.assignedJudges.length > 0).length;
          const totalReviews = rows.reduce((sum, s) => sum + s.assignedJudges.length, 0);
          return {
            totalSubmissions: rows.length,
            assignedCount,
            unassignedCount: rows.length - assignedCount,
            avgReviewsPerSubmission: rows.length > 0 ? Math.round(totalReviews / rows.length) : 0,
          };
        })()
      : null;

    const progress = progressRows.ok
      ? (() => {
          const rows = progressRows.value;
          const totalAssignments = rows.reduce((sum, j) => sum + j.total, 0);
          const totalCompleted = rows.reduce((sum, j) => sum + j.completed, 0);
          return {
            percentComplete: totalAssignments > 0 ? Math.round((totalCompleted / totalAssignments) * 100) : 0,
            judgesNotStarted: rows.filter((j) => j.total > 0 && j.completed === 0).length,
            totalJudges: rows.length,
          };
        })()
      : null;

    const resultsState: 'NOT_STARTED' | 'DRAFT' | 'PUBLISHED' | null =
      liveResultVersion.ok && resultsDraft.ok
        ? liveResultVersion.value
          ? 'PUBLISHED'
          : resultsDraft.value
            ? 'DRAFT'
            : 'NOT_STARTED'
        : null;

    const votingState: { state: 'NOT_STARTED' | 'OPEN' | 'CLOSED'; roundNumber: number | null; votingClosesAt: string | null } | null =
      votingRound.ok
        ? (() => {
            const round = votingRound.value;
            if (!round) return { state: 'NOT_STARTED' as const, roundNumber: null, votingClosesAt: null };
            const now = Date.now();
            const state =
              round.status === 'ACTIVE' && now <= new Date(round.votingClosesAt).getTime() ? 'OPEN' : 'CLOSED';
            return { state, roundNumber: round.roundNumber, votingClosesAt: round.votingClosesAt.toISOString() };
          })()
        : null;

    return {
      isAdminBypass,
      tracksPrizes:
        tracksCount.ok && prizesCount.ok
          ? { tracksCount: tracksCount.value, prizesCount: prizesCount.value }
          : null,
      judges: judgeInvitations.ok
        ? {
            accepted: judgeInvitations.value.filter((m) => m.invitationStatus === 'ACCEPTED').length,
            pending: judgeInvitations.value.filter((m) => m.invitationStatus === 'PENDING').length,
            declined: judgeInvitations.value.filter((m) => m.invitationStatus === 'DECLINED').length,
          }
        : null,
      rubric: rubricCriteria.ok
        ? {
            scoringCount: rubricCriteria.value.filter((c) => c.kind === 'SCORING').length,
            bonusCount: rubricCriteria.value.filter((c) => c.kind === 'BONUS').length,
            configured: rubricCriteria.value.length > 0,
          }
        : null,
      submissions: submissionsCount.ok ? { finalizedCount: submissionsCount.value } : null,
      verification: verificationRows.ok
        ? {
            approved: verificationRows.value.filter((s) => s.finalDecision === 'APPROVED').length,
            pendingReview: verificationRows.value.filter((s) => s.finalDecision === 'PENDING_REVIEW').length,
            disqualified: verificationRows.value.filter((s) => s.finalDecision === 'DISQUALIFIED').length,
          }
        : null,
      assignment,
      progress,
      normalization:
        event.ok && normalizationRun.ok
          ? {
              lastRunAt: normalizationRun.value?.runAt ?? null,
              judgingStillOpen: !event.value.judgingClosesAt || Date.now() < new Date(event.value.judgingClosesAt).getTime(),
            }
          : null,
      results: resultsState === null ? null : { state: resultsState },
      voting: votingState,
      certificates:
        event.ok && certificatesIssuedCount.ok
          ? { enabled: event.value.certificatesEnabled, issuedCount: certificatesIssuedCount.value }
          : null,
    };
  }
}
