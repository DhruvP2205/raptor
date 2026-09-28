import type { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { processVerificationJob } from './processor';

// Must match apps/api/src/queues/verification-queue.service.ts's queue
// name exactly — see that file's comment.
export const VERIFICATION_QUEUE_NAME = 'verification';

export function startVerificationWorker(prisma: PrismaClient): Worker {
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    VERIFICATION_QUEUE_NAME,
    async (job) => {
      const { submissionId } = job.data as { submissionId: string };
      await processVerificationJob(prisma, submissionId);
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    // Any throw escaping processVerificationJob is a real bug (it
    // catches every expected failure mode itself and writes ERROR
    // instead of throwing) — logged loudly rather than silently
    // retried, since retries are never automatic in this module (D91).
    console.error(`[verification] Job ${job?.id} threw unexpectedly:`, err);
  });

  return worker;
}
