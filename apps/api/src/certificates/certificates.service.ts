import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CertificateRole, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CertificateSigningService } from './certificate-signing.service';
import { CertificateTemplatesService } from './certificate-templates.service';
import { renderSvgToPdfBuffer } from './certificate-pdf-renderer.util';
import { ManualIssueCertificateDto } from './dto/manual-issue-certificate.dto';
import { renderSvgFromTemplate, type CertificatePlaceholders } from './svg-placeholder.util';

interface Association {
  teamId: string | null;
  submissionId: string | null;
}

// Module 12 (Certificates) — see docs/stages/12-certificates.md. The
// issuance trigger, eligibility resolution, rendering+caching, and
// access control all live here; CertificateTemplatesService owns just
// the template CRUD, CertificateSigningService just the Ed25519
// mechanics — split the same way Module 11 splits VotingService from
// PowCaptchaService.
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly signing: CertificateSigningService,
    private readonly templates: CertificateTemplatesService,
  ) {}

  // --- The switch (Section 2.1) ---

  async enable(eventId: string, userId: string) {
    const event = await this.getEventOrThrow(eventId);
    if (event.certificatesEnabled) {
      throw new BadRequestException({ code: 'CERTIFICATES_ALREADY_ENABLED', message: 'Certificates are already enabled for this event.' });
    }

    const live = await this.prisma.publishedResultVersion.findFirst({ where: { eventId, status: 'LIVE' } });
    if (!live) {
      throw new BadRequestException({
        code: 'RESULTS_NOT_LIVE',
        message: 'Certificates can only be enabled once a published result version is LIVE for this event.',
      });
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { certificatesEnabled: true, certificatesEnabledAt: new Date(), certificatesEnabledByUserId: userId },
    });

    await this.audit.record(userId, 'CERTIFICATES_ENABLED', { eventId });
    return { certificatesEnabled: updated.certificatesEnabled, certificatesEnabledAt: updated.certificatesEnabledAt };
  }

  // --- Self-service issuance (Section 2.1/2.2) ---

  // Idempotent: returns every certificate the caller is currently
  // eligible for, creating any that don't exist yet and leaving
  // already-issued ones untouched — safe against a repeated button
  // click or a double-submit race (the DB's own @@unique backs this up
  // too, see the P2002 catch below).
  async generateMine(eventId: string, userId: string) {
    const event = await this.getEventOrThrow(eventId);
    if (!event.certificatesEnabled) {
      throw new BadRequestException({ code: 'CERTIFICATES_NOT_ENABLED', message: 'Certificates are not enabled for this event yet.' });
    }

    const eligible = await this.resolveEligibility(eventId, userId, { excludeDisqualified: true });
    const template = await this.templates.getCurrentForEvent(eventId);

    for (const entry of eligible) {
      await this.issueIfMissing(event, userId, entry, template);
    }

    return this.prisma.certificate.findMany({ where: { eventId, userId }, orderBy: { issuedAt: 'asc' } });
  }

  async listMine(eventId: string, userId: string) {
    await this.getEventOrThrow(eventId);
    return this.prisma.certificate.findMany({ where: { eventId, userId }, orderBy: { issuedAt: 'asc' } });
  }

  // --- Manual organizer override (Section 2.2) ---

  // Deliberately bypasses the disqualification exclusion — that's the
  // entire point of this endpoint existing. Fails loud (ALREADY_ISSUED)
  // rather than silently returning the existing row, since a mistaken
  // duplicate-issue attempt here should be visible to the organizer
  // acting on it, unlike generateMine's friendlier idempotent return.
  async manualIssue(eventId: string, actorUserId: string, dto: ManualIssueCertificateDto) {
    const event = await this.getEventOrThrow(eventId);
    if (!event.certificatesEnabled) {
      throw new BadRequestException({ code: 'CERTIFICATES_NOT_ENABLED', message: 'Certificates are not enabled for this event yet.' });
    }

    const existing = await this.prisma.certificate.findUnique({
      where: { eventId_userId_role: { eventId, userId: dto.userId, role: dto.role } },
    });
    if (existing) {
      throw new BadRequestException({ code: 'ALREADY_ISSUED', message: 'This person already holds a certificate for this role on this event.' });
    }

    const eligible = await this.resolveEligibility(eventId, dto.userId, { excludeDisqualified: false });
    const entry = eligible.find((e) => e.role === dto.role);
    if (!entry) {
      throw new BadRequestException({
        code: 'NOT_ELIGIBLE',
        message: 'That person has no participation/judging record on this event supporting that role.',
      });
    }

    const template = await this.templates.getCurrentForEvent(eventId);
    const certificate = await this.issueIfMissing(event, dto.userId, entry, template);

    await this.audit.record(actorUserId, 'CERTIFICATE_MANUALLY_ISSUED', {
      eventId,
      recipientUserId: dto.userId,
      role: dto.role,
      certificateId: certificate?.id,
      reason: dto.reason,
    });

    return certificate;
  }

  // --- Public view / download / gallery (Section 6/7) ---

  // `viewer` is optional (this route is reachable signed-out) — design/
  // 12-certificates.md Section 2's "Download PDF... present but
  // disabled-with-explanation" state needs the frontend to know
  // *before* the click whether download will actually work, which
  // the payload spread alone can't answer (no userId/eventId in it,
  // deliberately — payloadJson is only ever the certificate's own
  // frozen facts). Computed via the exact same check download() itself
  // enforces, so the two can never silently disagree.
  async getPublic(certificateId: string, viewer: { id: string; siteAdmin: boolean } | null) {
    const certificate = await this.getCertificateOrThrow(certificateId);
    const template = await this.templates.getById(certificate.templateId);
    const svg = await this.renderSvg(certificate, template.svgMarkup);
    const verified = this.signing.verify(certificate.payloadJson, certificate.signature, certificate.publicKeyId);
    const canDownload = viewer ? await this.canDownload(certificate.eventId, certificate.userId, viewer) : false;

    return {
      ...(certificate.payloadJson as unknown as CertificatePlaceholders),
      certificateId: certificate.id,
      svg,
      verified,
      canDownload,
    };
  }

  async download(certificateId: string, caller: { id: string; siteAdmin: boolean }): Promise<Buffer> {
    const certificate = await this.getCertificateOrThrow(certificateId);
    await this.assertCanDownload(certificate.eventId, certificate.userId, caller);

    const cacheKey = `certificate:${certificate.id}:${certificate.templateVersion}:pdf`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) return Buffer.from(cached, 'base64');
    } catch {
      // Cache is a pure optimization — a Redis outage falls through to
      // a fresh render rather than failing the download.
    }

    const template = await this.templates.getById(certificate.templateId);
    const svg = await this.renderSvg(certificate, template.svgMarkup);
    const pdf = await renderSvgToPdfBuffer(svg);

    try {
      await this.redis.client.set(cacheKey, pdf.toString('base64'), 'EX', 60 * 60 * 24);
    } catch {
      /* best effort */
    }

    return pdf;
  }

  async listForUser(userId: string) {
    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      include: { event: { select: { id: true, name: true, slug: true } } },
    });
    return certificates.map((c) => ({
      ...(c.payloadJson as unknown as CertificatePlaceholders),
      certificateId: c.id,
      role: c.role,
      issuedAt: c.issuedAt,
      event: c.event,
    }));
  }

  // --- Eligibility (Section 2.2) ---

  private async resolveEligibility(
    eventId: string,
    userId: string,
    opts: { excludeDisqualified: boolean },
  ): Promise<{ role: CertificateRole; teamId: string | null; submissionId: string | null }[]> {
    const results: { role: CertificateRole; teamId: string | null; submissionId: string | null }[] = [];

    const association = await this.findAssociation(eventId, userId, opts.excludeDisqualified);
    if (association) {
      results.push({ role: 'PARTICIPANT', ...association });

      const live = await this.prisma.publishedResultVersion.findFirst({ where: { eventId, status: 'LIVE' } });
      if (live && association.submissionId) {
        const [rankEntry, specialAwardEntry, prizes] = await Promise.all([
          this.prisma.rankResultEntry.findUnique({
            where: { publishedResultVersionId_submissionId: { publishedResultVersionId: live.id, submissionId: association.submissionId } },
          }),
          this.prisma.specialAwardResultEntry.findFirst({
            where: { publishedResultVersionId: live.id, submissionId: association.submissionId },
          }),
          this.prisma.prize.findMany({ where: { eventId, decidedBy: 'JUDGES' } }),
        ]);

        if (rankEntry && !rankEntry.isDisqualified && prizes.some((p) => p.rank === rankEntry.rank)) {
          results.push({ role: 'WINNER', ...association });
        }
        if (specialAwardEntry) {
          results.push({ role: 'SPECIAL_AWARD_WINNER', ...association });
        }
      }
    }

    const completedAssignment = await this.prisma.judgeAssignment.findFirst({
      where: { eventId, judgeId: userId, status: 'COMPLETED' },
    });
    if (completedAssignment) {
      results.push({ role: 'JUDGE', teamId: null, submissionId: null });
    }

    return results;
  }

  private async findAssociation(eventId: string, userId: string, excludeDisqualified: boolean): Promise<Association | null> {
    const solo = await this.prisma.submission.findFirst({
      where: { eventId, soloUserId: userId },
      include: { verification: true },
    });
    if (solo && (!excludeDisqualified || solo.verification?.finalDecision !== 'DISQUALIFIED')) {
      return { teamId: null, submissionId: solo.id };
    }

    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId, team: { eventId } },
      include: { team: { include: { submission: { include: { verification: true } } } } },
    });
    const submission = membership?.team.submission;
    if (submission && (!excludeDisqualified || submission.verification?.finalDecision !== 'DISQUALIFIED')) {
      return { teamId: membership!.teamId, submissionId: submission.id };
    }

    return null;
  }

  private async issueIfMissing(
    event: { id: string; name: string },
    userId: string,
    entry: { role: CertificateRole; teamId: string | null; submissionId: string | null },
    template: { id: string; version: number },
  ) {
    const existing = await this.prisma.certificate.findUnique({
      where: { eventId_userId_role: { eventId: event.id, userId, role: entry.role } },
    });
    if (existing) return existing;

    const [user, team, submission] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      entry.teamId ? this.prisma.team.findUnique({ where: { id: entry.teamId } }) : Promise.resolve(null),
      entry.submissionId ? this.prisma.submission.findUnique({ where: { id: entry.submissionId } }) : Promise.resolve(null),
    ]);

    const certificateId = randomUUID();
    const payload: CertificatePlaceholders = {
      recipientName: user.displayName,
      eventName: event.name,
      role: entry.role,
      projectName: submission?.title ?? null,
      teamName: team?.name ?? null,
      issuedDate: new Date().toISOString().slice(0, 10),
      certificateId,
      verifyUrl: `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'}/certificates/${certificateId}`,
    };
    const { signature, publicKeyId } = this.signing.sign(payload);

    try {
      return await this.prisma.certificate.create({
        data: {
          id: certificateId,
          eventId: event.id,
          userId,
          role: entry.role,
          teamId: entry.teamId,
          submissionId: entry.submissionId,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          signature,
          publicKeyId,
          templateId: template.id,
          templateVersion: template.version,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Lost a concurrent-issue race — the other request's row is the
        // real one; return it rather than surfacing a 500.
        return this.prisma.certificate.findUniqueOrThrow({
          where: { eventId_userId_role: { eventId: event.id, userId, role: entry.role } },
        });
      }
      throw err;
    }
  }

  // --- Rendering (Section 5) ---

  private async renderSvg(certificate: { id: string; templateVersion: number; payloadJson: unknown }, templateSvgMarkup: string): Promise<string> {
    const cacheKey = `certificate:${certificate.id}:${certificate.templateVersion}:svg`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) return cached;
    } catch {
      /* fall through to a fresh render */
    }

    const svg = renderSvgFromTemplate(templateSvgMarkup, certificate.payloadJson as unknown as CertificatePlaceholders);

    try {
      await this.redis.client.set(cacheKey, svg, 'EX', 60 * 60 * 24);
    } catch {
      /* best effort */
    }

    return svg;
  }

  // --- Access control (Section 6, D39) ---

  private async canDownload(eventId: string, ownerUserId: string, caller: { id: string; siteAdmin: boolean }): Promise<boolean> {
    if (caller.siteAdmin || caller.id === ownerUserId) return true;

    const membership = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: caller.id, eventId } },
    });
    return membership?.role === 'ORGANIZER' && membership.invitationStatus === 'ACCEPTED';
  }

  private async assertCanDownload(eventId: string, ownerUserId: string, caller: { id: string; siteAdmin: boolean }): Promise<void> {
    if (await this.canDownload(eventId, ownerUserId, caller)) return;

    throw new ForbiddenException({
      code: 'CERTIFICATE_DOWNLOAD_FORBIDDEN',
      message: 'Only the certificate owner or an organizer/admin scoped to this event can download it.',
    });
  }

  private async getEventOrThrow(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
    }
    return event;
  }

  private async getCertificateOrThrow(id: string) {
    const certificate = await this.prisma.certificate.findUnique({ where: { id } });
    if (!certificate) {
      throw new NotFoundException({ code: 'CERTIFICATE_NOT_FOUND', message: 'No such certificate.' });
    }
    return certificate;
  }
}
