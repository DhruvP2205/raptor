import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Exported so the one-time backfill script (scripts/backfill-audit-log-event-id.ts)
// reuses the exact same extraction rule rather than a second copy of it.
export function extractEventId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).eventId;
  return typeof value === 'string' ? value : null;
}

// Append-only — see CLAUDE.md's non-negotiable principle 5. This is
// the only write path into AuditLog; nothing else in the codebase
// should INSERT into it directly, and nothing ever UPDATEs or DELETEs
// a row here.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    actorUserId: string,
    action: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action,
        metadataJson: metadata,
        // Module 24 (B1) — every call site that logs an event-scoped
        // action already puts `eventId` directly in its metadata object
        // (verified across every existing call site); extracting it
        // here means every one of those ~30 call sites gets a queryable
        // eventId for free, with no per-call-site change needed.
        // Platform-wide actions with no eventId key correctly stay null.
        eventId: extractEventId(metadata),
      },
    });
  }
}
