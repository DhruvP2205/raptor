import { Module } from '@nestjs/common';
import { CertificateDownloadController } from './certificate-download.controller';
import { CertificateSelfController } from './certificate-self.controller';
import { CertificateSigningService } from './certificate-signing.service';
import { CertificateTemplatesService } from './certificate-templates.service';
import { CertificateViewController } from './certificate-view.controller';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  controllers: [CertificatesController, CertificateSelfController, CertificateViewController, CertificateDownloadController],
  providers: [CertificatesService, CertificateTemplatesService, CertificateSigningService],
})
export class CertificatesModule {}
