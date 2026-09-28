import { Controller, Get, Param, Res } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CertificatesService } from './certificates.service';

// Section 6, docs/stages/12-certificates.md (D39) — restricted to the
// certificate's own owner or an organizer/admin scoped to that
// specific event, checked inside CertificatesService.download (never a
// global organizer permission across events). Authenticated by the
// global SessionAuthGuard default; no @Public() here, unlike the view
// route.
@Controller()
export class CertificateDownloadController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('certificates/:id/download')
  async download(@Param('id') id: string, @CurrentUser() user: User, @Res() res: Response) {
    const pdf = await this.certificates.download(id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${id}.pdf"`);
    res.send(pdf);
  }
}
