import { Controller, Get, Param } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CertificatesService } from './certificates.service';

// Section 6/7, docs/stages/12-certificates.md — public view + public
// gallery, both explicitly no-auth-required by design (D39, D147). The
// restricted PDF download route lives in
// CertificateDownloadController instead, since it needs a caller
// identity to authorize against.
//
// getPublic uses @OptionalAuth(), not @Public() — @Public() skips
// session resolution entirely (req.user never set, even with a valid
// cookie), which would make the `canDownload` hint always false for a
// signed-in owner. This route still works with zero session, same as
// @Public() would, but resolves one if present.
@Controller()
export class CertificateViewController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('certificates/:id')
  @OptionalAuth()
  getPublic(@Param('id') id: string, @CurrentUser() user: User | undefined) {
    return this.certificates.getPublic(id, user ? { id: user.id, siteAdmin: user.siteAdmin } : null);
  }

  @Get('users/:userId/certificates')
  @Public()
  getGallery(@Param('userId') userId: string) {
    return this.certificates.listForUser(userId);
  }
}
