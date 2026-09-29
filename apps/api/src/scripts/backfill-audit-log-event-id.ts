import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { extractEventId } from '../audit/audit.service';

// Module 24 (Release Closeout, B1) — a one-time backfill for AuditLog
// rows written before the `eventId` column existed. New rows are
// backfilled automatically going forward by AuditService.record itself
// (same extractEventId rule, reused rather than duplicated); this
// script only needs to catch up existing history.
//
// Idempotent and safe to re-run: only ever touches rows where
// eventId IS NULL, and only writes a value when metadataJson.eventId
// is actually a recoverable string. A row whose metadata never carried
// an eventId (platform-wide actions like staff creation) stays null
// forever, exactly as intended (B1: "leave the rest null") — this
// script never guesses one.
//
// Run directly with `node`:
//   node dist/scripts/backfill-audit-log-event-id.js

export async function backfillAuditLogEventId(prisma: PrismaClient): Promise<{ scanned: number; updated: number }> {
  const candidates = await prisma.auditLog.findMany({
    where: { eventId: null },
    select: { id: true, metadataJson: true },
  });

  let updated = 0;
  for (const row of candidates) {
    const eventId = extractEventId(row.metadataJson);
    if (eventId) {
      await prisma.auditLog.update({ where: { id: row.id }, data: { eventId } });
      updated++;
    }
  }

  return { scanned: candidates.length, updated };
}

async function main(): Promise<number> {
  const prisma = new PrismaClient();
  try {
    const { scanned, updated } = await backfillAuditLogEventId(prisma);
    console.log(`[backfill-audit-log-event-id] Scanned ${scanned} rows with no eventId, backfilled ${updated}.`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}
