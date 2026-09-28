import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createBullmqConnection } from './bullmq-connection';

export const GLOBAL_RANKING_QUEUE_NAME = 'global-ranking';

// BullMQ's .add() has no built-in ceiling and hangs indefinitely if
// Redis is unreachable (see VerificationQueueService's own comment,
// confirmed live there) — this timeout turns that into a fast,
// swallowed no-op instead of hanging whatever caller triggered it.
const ENQUEUE_TIMEOUT_MS = 3000;

// The producer side of Module 14's async recompute (apps/worker does
// the actual aggregation, never this process — same split as
// VerificationQueueService/Module 6). Unlike that service, this one
// fails OPEN: a recompute is a side effect of publishing/unpublishing
// judge or voting results, never the primary action a caller is
// waiting on, so a Redis hiccup here must never block or fail the
// actual publish/unpublish call. The leaderboard will simply lag until
// the next successful trigger (automatic or a manual admin recompute).
@Injectable()
export class GlobalRankingQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(GlobalRankingQueueService.name);
  private readonly queue = new Queue(GLOBAL_RANKING_QUEUE_NAME, {
    connection: createBullmqConnection(),
  });

  async enqueueRecompute(opts: { triggeredByUserId?: string | null; triggerReason?: string | null } = {}): Promise<void> {
    const add = this.queue.add(
      'recompute',
      { triggeredByUserId: opts.triggeredByUserId ?? null, triggerReason: opts.triggerReason ?? null },
      { attempts: 1, removeOnComplete: true, removeOnFail: 1000 },
    );
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, ENQUEUE_TIMEOUT_MS);
    });
    try {
      await Promise.race([add, timeout]);
    } catch (err) {
      this.logger.warn(`Failed to enqueue global-ranking recompute (failing open): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
