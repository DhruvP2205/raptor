import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

// Backs rate limiting (and, per docs/ARCHITECTURE.md's tech-stack
// table, CAPTCHA/PoW challenge storage later) — one piece of infra,
// several uses, per that doc's own rationale for choosing Redis at all.
//
// An ioredis instance with no 'error' listener attached crashes the
// whole process on an unhandled error event the moment the connection
// fails — this listener exists specifically to prevent that. Short
// timeouts (connectTimeout, maxRetriesPerRequest: 1) mean a command
// against an unreachable Redis fails fast rather than hanging a
// request indefinitely.
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
      lazyConnect: false,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
