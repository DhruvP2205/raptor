// Same non-Docker local-dev convenience as apps/api/src/main.ts — see
// that file's comment for the full rationale.
import 'dotenv/config';

import { loadSecrets } from './config/load-secrets';
loadSecrets();

import { PrismaClient } from '@prisma/client';
import { startVerificationWorker } from './verification/worker';

// One shared worker container running BullMQ (docs/ARCHITECTURE.md
// Section 4, D98) — the verification queue today, certificate
// rendering later as its own queue in this same process once that
// module has a locked stage doc. Never imports apps/api; talks to the
// same Postgres database directly via its own generated Prisma client
// (see package.json's prisma:generate pointing at ../api/prisma/schema.prisma).
const prisma = new PrismaClient();

const verificationWorker = startVerificationWorker(prisma);

console.log('[worker] Verification queue worker started.');

async function shutdown(): Promise<void> {
  console.log('[worker] Shutting down...');
  await verificationWorker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
