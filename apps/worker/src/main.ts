// Same non-Docker local-dev convenience as apps/api/src/main.ts — see
// that file's comment for the full rationale.
import 'dotenv/config';

import { loadSecrets } from './config/load-secrets';
loadSecrets();

import { PrismaClient } from '@prisma/client';
import { startVerificationWorker } from './verification/worker';
import { startGlobalRankingWorker } from './global-ranking/worker';

// One shared worker container running BullMQ (docs/ARCHITECTURE.md
// Section 4, D98) — the verification queue (Module 6) and the
// global-ranking recompute queue (Module 14) today. Certificate
// rendering (Module 12) deliberately does NOT run here — it stays
// synchronous in the api process; see ARCHITECTURE.md §4 for why an
// earlier assumption that it would reuse this container was corrected.
// Never imports apps/api; talks to the same Postgres database directly
// via its own generated Prisma client (see package.json's
// prisma:generate pointing at ../api/prisma/schema.prisma).
const prisma = new PrismaClient();

const verificationWorker = startVerificationWorker(prisma);
const globalRankingWorker = startGlobalRankingWorker(prisma);

console.log('[worker] Verification and global-ranking queue workers started.');

async function shutdown(): Promise<void> {
  console.log('[worker] Shutting down...');
  await verificationWorker.close();
  await globalRankingWorker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
