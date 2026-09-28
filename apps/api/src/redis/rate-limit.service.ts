import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

// Fixed-window counter. Deliberately fails OPEN (allows the request)
// if Redis is unreachable, rather than blocking every upload whenever
// the rate limiter itself is down — this is anti-abuse, not
// authorization; losing the abuse guard temporarily during an infra
// outage is an acceptable trade-off, silently blocking all uploads
// is not. A genuine authorization check would fail closed instead; see
// CLAUDE.md's distinction between the two.
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) {
        await this.redis.client.expire(key, windowSeconds);
      }
      return count <= limit;
    } catch (err) {
      this.logger.warn(
        `Rate limit check failed (failing open): ${(err as Error).message}`,
      );
      return true;
    }
  }
}
