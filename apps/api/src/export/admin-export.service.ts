import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { computeEventPhase } from '../events/utils/event-phase';
import { PrismaService } from '../prisma/prisma.service';
import type { CsvTable } from './export.service';

// D170, docs/design/18-csv-export.md Section 1/Sections 11-14 — admin
// tier: siteAdmin only, platform-wide or cross-event data that doesn't
// belong to any single organizer's view. Every call writes an
// AuditLog entry (Section 16) — the same "power exists, but it's never
// invisible" rule as every other siteAdmin bypass (ARCHITECTURE.md §6).
@Injectable()
export class AdminExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Section 11 — one row per event on the platform.
  async exportAllEvents(actorUserId: string): Promise<CsvTable> {
    await this.audit.record(actorUserId, 'ADMIN_EXPORT_ALL_EVENTS', {});

    const events = await this.prisma.event.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        memberships: { where: { role: 'ORGANIZER' }, include: { user: { select: { displayName: true } } } },
        _count: { select: { teams: true } },
      },
    });

    const eventIds = events.map((e) => e.id);
    const [registrationCounts, submissionCounts] = await Promise.all([
      this.prisma.eventMembership.groupBy({
        by: ['eventId'],
        where: { eventId: { in: eventIds }, role: 'PARTICIPANT' },
        _count: { _all: true },
      }),
      this.prisma.submission.groupBy({
        by: ['eventId'],
        where: { eventId: { in: eventIds }, everSubmitted: true },
        _count: { _all: true },
      }),
    ]);
    const registrationsByEvent = new Map(registrationCounts.map((r) => [r.eventId, r._count._all]));
    const submissionsByEvent = new Map(submissionCounts.map((r) => [r.eventId, r._count._all]));

    return {
      columns: ['Event Name', 'Slug', 'Status', 'Phase', 'Organizer(s)', 'Registrations', 'Teams', 'Submissions', 'Created At'],
      rows: events.map((e) => [
        e.name,
        e.slug,
        e.status,
        computeEventPhase(e) ?? '',
        e.memberships.map((m) => m.user.displayName).join('; '),
        registrationsByEvent.get(e.id) ?? 0,
        e._count.teams,
        submissionsByEvent.get(e.id) ?? 0,
        e.createdAt.toISOString(),
      ]),
    };
  }

  // Section 12 — the current global leaderboard (Module 14), already
  // platform-wide by that module's own design.
  async exportGlobalRanking(actorUserId: string): Promise<CsvTable> {
    await this.audit.record(actorUserId, 'ADMIN_EXPORT_GLOBAL_RANKING', {});

    const snapshot = await this.prisma.globalRankingSnapshot.findFirst({ where: { isCurrent: true } });
    if (!snapshot) {
      return { columns: ['Rank', 'Name', 'Points', 'Firsts', 'Seconds', 'Thirds', 'Events'], rows: [] };
    }

    const entries = await this.prisma.globalRankingEntry.findMany({
      where: { snapshotId: snapshot.id },
      include: { user: { select: { displayName: true } } },
      orderBy: { rank: 'asc' },
    });

    return {
      columns: ['Rank', 'Name', 'Points', 'Firsts', 'Seconds', 'Thirds', 'Events'],
      rows: entries.map((e) => [e.rank, e.user.displayName, e.points, e.firstsCount, e.secondsCount, e.thirdsCount, e.eventsCount]),
    };
  }

  // Section 13 — filterable by date range (the one export here without
  // a natural upper bound, Section 1). AuditLog has no structured
  // Target/Reason column (only actorUserId/action/metadataJson,
  // audit.service.ts) — an earlier version of this doc implied
  // otherwise. Best-effort extraction from metadataJson's own common
  // keys, flagged as an inference (TODO: undocumented decision, needs
  // confirmation) rather than a guaranteed-accurate structured field,
  // since metadataJson's shape varies per action across ~30 call sites.
  async exportAuditLog(actorUserId: string, from?: Date, to?: Date): Promise<CsvTable> {
    await this.audit.record(actorUserId, 'ADMIN_EXPORT_AUDIT_LOG', {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    });

    const entries = await this.prisma.auditLog.findMany({
      where: {
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      },
      include: { actor: { select: { displayName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      columns: ['Timestamp', 'Actor', 'Action', 'Target', 'Reason'],
      rows: entries.map((e) => [
        e.createdAt.toISOString(),
        `${e.actor.displayName} <${e.actor.email}>`,
        e.action,
        describeAuditTarget(e.metadataJson),
        describeAuditReason(e.metadataJson),
      ]),
    };
  }

  // Section 14 — every User, one row each. Admin-only with no
  // exception (Section 14's own reasoning: this doesn't grant new
  // access on a self-hosted instance, it makes existing access more
  // convenient, which is exactly why the audit trail matters more, not
  // less).
  async exportUserDirectory(actorUserId: string): Promise<CsvTable> {
    await this.audit.record(actorUserId, 'ADMIN_EXPORT_USER_DIRECTORY', {});

    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { displayName: true, email: true, accountType: true, createdAt: true, emailVerifiedAt: true },
    });

    return {
      columns: ['Name', 'Email', 'Account Type', 'Created At', 'Email Verified'],
      rows: users.map((u) => [u.displayName, u.email, u.accountType, u.createdAt.toISOString(), !!u.emailVerifiedAt]),
    };
  }
}

// Section 13 (corrected) — a blank cell would read as "nothing
// recognizable AND nothing to report", indistinguishable from a
// genuinely empty value; "(unavailable)" flags "we looked and found no
// recognizable key" explicitly, since metadataJson's shape isn't
// guaranteed to carry either concept for every action type.
const UNAVAILABLE = '(unavailable)';

const TARGET_KEY_CANDIDATES = ['eventId', 'submissionId', 'userId', 'teamId', 'assignmentId', 'membershipId', 'roundId', 'versionId', 'certificateId'];

function describeAuditTarget(metadataJson: unknown): string {
  if (!metadataJson || typeof metadataJson !== 'object') return UNAVAILABLE;
  const obj = metadataJson as Record<string, unknown>;
  const found = TARGET_KEY_CANDIDATES.filter((k) => obj[k] != null).map((k) => `${k}=${obj[k]}`);
  return found.length > 0 ? found.join('; ') : UNAVAILABLE;
}

function describeAuditReason(metadataJson: unknown): string {
  if (!metadataJson || typeof metadataJson !== 'object') return UNAVAILABLE;
  const obj = metadataJson as Record<string, unknown>;
  const reason = obj.reason ?? obj.correctionReason ?? obj.unpublishReason ?? obj.finalDecisionRemarks;
  return typeof reason === 'string' ? reason : UNAVAILABLE;
}
