import {
  HttpException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from '../../redis/rate-limit.service';

const UPLOAD_LIMIT_PER_HOUR = 20;

// "Rate limited on the upload endpoint itself" — Section 7.2,
// docs/stages/03-event-management.md, stated as this stage's own
// requirement (unlike general auth rate limiting, which Module 1
// explicitly deferred).
@Injectable()
export class UploadRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new UnauthorizedException('Not logged in.');
    }

    const allowed = await this.rateLimit.consume(
      `upload:${req.user.id}`,
      UPLOAD_LIMIT_PER_HOUR,
      60 * 60,
    );
    if (!allowed) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many uploads — try again later.' },
        429,
      );
    }

    return true;
  }
}
