import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCertificateTemplateDto } from './dto/upsert-certificate-template.dto';
import { sanitizeSvgTemplate } from './svg-template-sanitizer.util';

// Section 4/8, docs/stages/12-certificates.md. Append-only — an edit
// creates a NEW row (version+1); already-issued Certificate rows keep
// pointing at the specific, immutable row they were issued under, so a
// later edit can never retroactively change how an old certificate
// renders (Section 5).
@Injectable()
export class CertificateTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upsert(eventId: string, userId: string, dto: UpsertCertificateTemplateDto) {
    const sanitized = sanitizeSvgTemplate(dto.svgMarkup);
    const previous = await this.prisma.certificateTemplate.findFirst({
      where: { eventId },
      orderBy: { version: 'desc' },
    });

    const template = await this.prisma.certificateTemplate.create({
      data: { eventId, svgMarkup: sanitized, version: (previous?.version ?? 0) + 1 },
    });

    await this.audit.record(userId, previous ? 'CERTIFICATE_TEMPLATE_UPDATED' : 'CERTIFICATE_TEMPLATE_CREATED', {
      eventId,
      templateId: template.id,
      version: template.version,
    });

    return template;
  }

  async getCurrentForEvent(eventId: string) {
    const template = await this.prisma.certificateTemplate.findFirst({
      where: { eventId },
      orderBy: { version: 'desc' },
    });
    if (!template) {
      throw new NotFoundException({ code: 'CERTIFICATE_TEMPLATE_NOT_FOUND', message: 'No certificate template has been uploaded for this event yet.' });
    }
    return template;
  }

  async getById(templateId: string) {
    const template = await this.prisma.certificateTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      throw new NotFoundException({ code: 'CERTIFICATE_TEMPLATE_NOT_FOUND', message: 'No such certificate template.' });
    }
    return template;
  }
}
