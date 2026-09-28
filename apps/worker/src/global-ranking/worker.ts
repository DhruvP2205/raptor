import type { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { processGlobalRankingRecompute } from './processor';

// Must match apps/api/src/queues/global-ranking-queue.service.ts's
// queue name exactly — see that file's comment.
export const GLOBAL_RANKING_QUEUE_NAME = 'global-ranking';

export function startGlobalRankingWorker(prisma: PrismaClient): Worker {
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    GLOBAL_RANKING_QUEUE_NAME,
    async (job) => {
      const { triggeredByUserId, triggerReason } = job.data as {
        triggeredByUserId?: string | null;
        triggerReason?: string | null;
      };
      await processGlobalRankingRecompute(prisma, { triggeredByUserId, triggerReason });
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(`[global-ranking] Job ${job?.id} failed:`, err);
  });

  return worker;
}
