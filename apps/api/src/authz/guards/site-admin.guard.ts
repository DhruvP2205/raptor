import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class SiteAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // SessionAuthGuard (global) already ran and rejected an
    // unauthenticated request before this guard is ever reached — this
    // is defensive, not the primary check.
    if (!req.user) {
      throw new UnauthorizedException('Not logged in.');
    }

    if (!req.user.siteAdmin) {
      throw new ForbiddenException({
        code: 'SITE_ADMIN_REQUIRED',
        message: 'This action requires platform-admin access.',
      });
    }

    return true;
  }
}
