import {
  HttpException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from '../../redis/rate-limit.service';

// "Still rate limited on the join endpoint itself, to prevent automated
// guessing of the 6-digit suffix space, even though the consequence of
// a successful guess is low-severity" — Section 4.3,
// docs/stages/04-team-management.md. Same fail-open posture as the
// upload rate limiter (D72) and the same reasoning: this is anti-abuse,
// not authorization.
const JOIN_ATTEMPTS_LIMIT_PER_HOUR = 30;

@Injectable()
export class JoinRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new UnauthorizedException('Not logged in.');
    }

    const allowed = await this.rateLimit.consume(
      `team-join:${req.user.id}`,
      JOIN_ATTEMPTS_LIMIT_PER_HOUR,
      60 * 60,
    );
    if (!allowed) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many join attempts — try again later.' },
        429,
      );
    }

    return true;
  }
}
