import Redis from 'ioredis';

// A separate ioredis instance from RedisService (rate-limit.service.ts)
// on purpose: BullMQ requires maxRetriesPerRequest: null on its
// connection (it manages retries/blocking commands itself) while
// RedisService intentionally sets maxRetriesPerRequest: 1 so a rate
// -limit check fails fast and open. Reusing one instance for both would
// force a single, wrong setting on whichever use case lost.
//
// Queue name 'verification' (Module 6) must match apps/worker's Worker
// registration exactly — BullMQ has no compile-time link between the
// two processes, only the shared Redis key namespace derived from this
// string.
export function createBullmqConnection(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}
