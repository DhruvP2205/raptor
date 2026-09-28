import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { EventRole, type User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireEventRole } from '../authz/decorators/require-event-role.decorator';
import { EventRoleGuard } from '../authz/guards/event-role.guard';
import { CertificateTemplatesService } from './certificate-templates.service';
import { CertificatesService } from './certificates.service';
import { ManualIssueCertificateDto } from './dto/manual-issue-certificate.dto';
import { UpsertCertificateTemplateDto } from './dto/upsert-certificate-template.dto';

// Organizer-only throughout (siteAdmin bypasses via EventRoleGuard,
// audited) — the switch, the template, and the manual-override
// issuance path (Section 2/4, docs/stages/12-certificates.md). Every
// participant/judge-facing route lives in CertificateSelfController;
// every fully-public one in CertificateViewController.
@Controller('events/:eventId/certificates')
@RequireEventRole(EventRole.ORGANIZER)
@UseGuards(EventRoleGuard)
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly templates: CertificateTemplatesService,
  ) {}

  @Post('enable')
  enable(@Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.certificates.enable(eventId, user.id);
  }

  @Put('template')
  upsertTemplate(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() dto: UpsertCertificateTemplateDto) {
    return this.templates.upsert(eventId, user.id, dto);
  }

  @Get('template')
  getTemplate(@Param('eventId') eventId: string) {
    return this.templates.getCurrentForEvent(eventId);
  }

  @Post('issue')
  manualIssue(@Param('eventId') eventId: string, @CurrentUser() user: User, @Body() dto: ManualIssueCertificateDto) {
    return this.certificates.manualIssue(eventId, user.id, dto);
  }
}
