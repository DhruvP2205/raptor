import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createBullmqConnection } from './bullmq-connection';

export const VERIFICATION_QUEUE_NAME = 'verification';

// BullMQ requires maxRetriesPerRequest: null on its connection (see
// bullmq-connection.ts) — combined with ioredis's default
// enableOfflineQueue: true and an ever-retrying connection, a
// .add() call has no built-in ceiling and hangs the caller's HTTP
// request indefinitely if Redis is unreachable, confirmed live: an
// organizer triggering a run against a down Redis got no response at
// all, not even a slow one. This timeout turns that into a clear,
// fast failure instead.
const ENQUEUE_TIMEOUT_MS = 3000;

// The producer side of Module 6's async worker (D98 in
// docs/DECISIONS.md) — the API process only ever enqueues; the actual
// GitHub API calls run in apps/worker, never here, which is the entire
// point of introducing this queue (see docs/stages/06-submission-
// verification.md Section 6).
@Injectable()
export class VerificationQueueService implements OnModuleDestroy {
  private readonly queue = new Queue(VERIFICATION_QUEUE_NAME, {
    connection: createBullmqConnection(),
  });

  async enqueue(submissionId: string): Promise<void> {
    // No retry/backoff config: a job that fails should surface as
    // checkStatus ERROR (Section 3, step 3) and wait for an explicit
    // manual re-run (Section 7) — auto-retry would contradict "always
    // manual, never automatic" (D91).
    const add = this.queue.add(
      'verify-submission',
      { submissionId },
      { attempts: 1, removeOnComplete: true, removeOnFail: 1000 },
    );
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new ServiceUnavailableException({
              code: 'VERIFICATION_QUEUE_UNAVAILABLE',
              message: 'The verification queue is unreachable right now — try again shortly.',
            }),
          ),
        ENQUEUE_TIMEOUT_MS,
      );
    });
    await Promise.race([add, timeout]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
