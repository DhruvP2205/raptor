import {
  HttpException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from '../../redis/rate-limit.service';

const COMMENT_LIMIT_PER_HOUR = 30;

// Section 7, docs/stages/13-comments.md — "reusing the same
// Redis-backed mechanism already built for voting/CAPTCHA... no new
// infrastructure needed." Same fail-open-on-Redis-outage behavior as
// RateLimitService itself (this is anti-abuse, not authorization).
@Injectable()
export class CommentRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new UnauthorizedException('Not logged in.');
    }

    const allowed = await this.rateLimit.consume(`comment:${req.user.id}`, COMMENT_LIMIT_PER_HOUR, 60 * 60);
    if (!allowed) {
      throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many comments — try again later.' }, 429);
    }

    return true;
  }
}
