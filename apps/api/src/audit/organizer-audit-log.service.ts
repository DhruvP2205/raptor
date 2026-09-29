import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PAGE_SIZE = 50;
const UNAVAILABLE = '(unavailable)';

// Same best-effort extraction as admin-export.service.ts's
// describeAuditTarget/describeAuditReason — kept as a second, small
// copy rather than a shared import, since admin-export's version is
// scoped to CSV row shapes and this one returns a JSON page; the two
// call sites' actual concerns (bytes-over-HTTP vs. a paginated API
// response) are different enough that sharing the function would mean
// sharing an unrelated coupling, not real duplication of logic.
const REASON_KEY_CANDIDATES = ['reason', 'correctionReason', 'unpublishReason', 'finalDecisionRemarks'];

function describeReason(metadataJson: unknown): string {
  if (!metadataJson || typeof metadataJson !== 'object') return UNAVAILABLE;
  const obj = metadataJson as Record<string, unknown>;
  const found = REASON_KEY_CANDIDATES.map((k) => obj[k]).find((v) => typeof v === 'string');
  return typeof found === 'string' ? found : UNAVAILABLE;
}

export interface OrganizerAuditLogPage {
  entries: {
    id: string;
    createdAt: string;
    actor: string;
    action: string;
    reason: string;
  }[];
  nextCursor: string | null;
}

// Module 24 (Release Closeout, B1) — organizer-facing read of their own
// event's audit trail. Scoped by EventRoleGuard at the controller
// (organizer of *this* event, or siteAdmin, audited) — this service
// only ever filters by the eventId it's given, never trusts a caller
// to have already checked anything.
@Injectable()
export class OrganizerAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    eventId: string,
    options: { from?: Date; to?: Date; action?: string; cursor?: string },
  ): Promise<OrganizerAuditLogPage> {
    const entries = await this.prisma.auditLog.findMany({
      where: {
        eventId,
        ...(options.action ? { action: options.action } : {}),
        createdAt: {
          ...(options.from ? { gte: options.from } : {}),
          ...(options.to ? { lte: options.to } : {}),
        },
      },
      include: { actor: { select: { displayName: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(options.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = entries.length > PAGE_SIZE;
    const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;

    return {
      entries: page.map((e) => ({
        id: e.id,
        createdAt: e.createdAt.toISOString(),
        actor: `${e.actor.displayName} <${e.actor.email}>`,
        action: e.action,
        reason: describeReason(e.metadataJson),
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
