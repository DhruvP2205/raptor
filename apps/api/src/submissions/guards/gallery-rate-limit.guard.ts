import {
  HttpException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from '../../redis/rate-limit.service';

// Module 24 (Release Closeout, A4) — a generous per-source limit on the
// public gallery, the route THREAT-MODEL.md's "bulk collection of
// public content" limit (5.4) named directly. Keyed by IP alone (this
// route is reachable unauthenticated, @OptionalAuth) — same fail-open
// posture as every other rate limiter here (RateLimitService.consume).
// 120/minute is far above the acceptance checker's own traffic (a
// handful of requests total, per .dogfood.toml), so it never affects it.
const DEFAULT_LIMIT_PER_MINUTE = 120;

@Injectable()
export class GalleryRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const limit = Number(process.env.GALLERY_RATE_LIMIT_PER_MINUTE ?? DEFAULT_LIMIT_PER_MINUTE);

    const allowed = await this.rateLimit.consume(`gallery-read:${req.ip}`, limit, 60);
    if (!allowed) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many requests — try again shortly.' },
        429,
      );
    }

    return true;
  }
}
