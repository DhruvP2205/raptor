import {
  HttpException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { normalizeEmail } from '../../common/email.util';
import { RateLimitService } from '../../redis/rate-limit.service';

// Module 24 (Release Closeout, A4) — keyed by (source IP, email) so one
// attacker can't lock out a real user's address alone, and one address
// can't be used to hammer many different emails without each email
// getting its own budget. Counts every attempt, not just failed ones —
// same convention as every other rate limiter in this codebase
// (upload/join limiters count all attempts) rather than requiring
// AuthService to thread a second, failure-only counter through the
// login flow for a limit generous enough (default 10/15min) that a
// legitimate user still never notices it either way.
//
// Runs as a guard, before AuthService.login ever executes, so it can't
// itself leak whether an email is registered — the 429 body is fully
// generic, and this guard never reads AuthService's result.
const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MINUTES = 15;

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
    const email = rawEmail ? normalizeEmail(rawEmail) : 'unknown';
    const limit = Number(process.env.LOGIN_RATE_LIMIT_ATTEMPTS ?? DEFAULT_LIMIT);
    const windowMinutes = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES ?? DEFAULT_WINDOW_MINUTES);

    const allowed = await this.rateLimit.consume(
      `login:${req.ip}:${email}`,
      limit,
      windowMinutes * 60,
    );
    if (!allowed) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many attempts — try again later.' },
        429,
      );
    }

    return true;
  }
}
