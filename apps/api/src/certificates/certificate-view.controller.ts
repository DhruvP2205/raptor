import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { CertificatesService } from './certificates.service';

// Section 6/7, docs/stages/12-certificates.md — public view + public
// gallery, both explicitly no-auth by design (D39, D147). The
// restricted PDF download route lives in
// CertificateDownloadController instead, since it needs a caller
// identity to authorize against.
@Controller()
export class CertificateViewController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('certificates/:id')
  @Public()
  getPublic(@Param('id') id: string) {
    return this.certificates.getPublic(id);
  }

  @Get('users/:userId/certificates')
  @Public()
  getGallery(@Param('userId') userId: string) {
    return this.certificates.listForUser(userId);
  }
}
