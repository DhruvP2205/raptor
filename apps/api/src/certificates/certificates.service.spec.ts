import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

function makePrisma() {
  return {
    event: { findUnique: jest.fn(), update: jest.fn() },
    publishedResultVersion: { findFirst: jest.fn() },
    certificate: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn((args: any) => Promise.resolve({ issuedAt: new Date(), ...args.data })),
    },
    submission: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null) },
    teamMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    rankResultEntry: { findUnique: jest.fn().mockResolvedValue(null) },
    specialAwardResultEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    prize: { findMany: jest.fn().mockResolvedValue([]) },
    judgeAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Ada Lovelace' }) },
    team: { findUnique: jest.fn().mockResolvedValue(null) },
    eventMembership: { findUnique: jest.fn().mockResolvedValue(null) },
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

function makeRedis() {
  const store = new Map<string, string>();
  return {
    client: {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
    },
  } as any;
}

function makeSigning(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    sign: jest.fn().mockReturnValue({ signature: 'sig', publicKeyId: 'key-1' }),
    verify: jest.fn().mockReturnValue(true),
    ...overrides,
  } as any;
}

function makeTemplates(template = { id: 'tmpl-1', version: 1, svgMarkup: '<svg><text>{{recipientName}}</text></svg>' }) {
  return {
    getCurrentForEvent: jest.fn().mockResolvedValue(template),
    getById: jest.fn().mockResolvedValue(template),
  } as any;
}

const EVENT = { id: 'event-1', name: 'Test Hack', certificatesEnabled: true };

describe('CertificatesService', () => {
  describe('enable (Section 2.1)', () => {
    it('rejects when no PublishedResultVersion is LIVE for the event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT, certificatesEnabled: false });
      prisma.publishedResultVersion.findFirst.mockResolvedValue(null);
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.enable('event-1', 'organizer-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('rejects re-enabling an already-enabled event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT, certificatesEnabled: true });
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.enable('event-1', 'organizer-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('succeeds and audits once a LIVE version exists', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT, certificatesEnabled: false });
      prisma.publishedResultVersion.findFirst.mockResolvedValue({ id: 'v1', status: 'LIVE' });
      prisma.event.update.mockResolvedValue({ certificatesEnabled: true, certificatesEnabledAt: new Date() });
      const audit = makeAudit();
      const service = new CertificatesService(prisma, audit as any, makeRedis(), makeSigning(), makeTemplates());

      const result = await service.enable('event-1', 'organizer-1');

      expect(result.certificatesEnabled).toBe(true);
      expect(audit.record).toHaveBeenCalledWith('organizer-1', 'CERTIFICATES_ENABLED', { eventId: 'event-1' });
    });
  });

  describe('generateMine — eligibility and disqualification exclusion (Section 2.2)', () => {
    it('rejects when certificates are not enabled for the event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ ...EVENT, certificatesEnabled: false });
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.generateMine('event-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a disqualified submission\'s solo participant gets no automatic PARTICIPANT certificate', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1', title: 'Proj', verification: { finalDecision: 'DISQUALIFIED' } });
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      const result = await service.generateMine('event-1', 'user-1');

      expect(prisma.certificate.create).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('a winning solo participant gets TWO certificate rows (PARTICIPANT and WINNER), not one row that changes', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1', title: 'Proj', verification: { finalDecision: 'APPROVED' } });
      prisma.publishedResultVersion.findFirst.mockResolvedValue({ id: 'v1', status: 'LIVE' });
      prisma.rankResultEntry.findUnique.mockResolvedValue({ rank: 1, isDisqualified: false });
      prisma.prize.findMany.mockResolvedValue([{ rank: 1, decidedBy: 'JUDGES' }]);
      prisma.certificate.findUnique.mockResolvedValue(null); // nothing issued yet, for every check
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await service.generateMine('event-1', 'user-1');

      expect(prisma.certificate.create).toHaveBeenCalledTimes(2);
      const roles = prisma.certificate.create.mock.calls.map((c: any) => c[0].data.role);
      expect(roles.sort()).toEqual(['PARTICIPANT', 'WINNER']);
    });

    it('a solo participant\'s payload omits teamName; a team member\'s payload includes it', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.certificate.findUnique.mockResolvedValue(null);

      // Solo case
      prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1', title: 'Solo Proj', verification: { finalDecision: 'APPROVED' } });
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', title: 'Solo Proj' });
      const soloService = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());
      await soloService.generateMine('event-1', 'user-1');
      const soloPayload = prisma.certificate.create.mock.calls[0][0].data.payloadJson;
      expect(soloPayload.teamName).toBeNull();
      expect(soloPayload.projectName).toBe('Solo Proj');

      // Team case
      prisma.certificate.create.mockClear();
      prisma.submission.findFirst.mockResolvedValue(null);
      prisma.teamMembership.findFirst.mockResolvedValue({
        teamId: 'team-1',
        team: { submission: { id: 'sub-2', title: 'Team Proj', verification: { finalDecision: 'APPROVED' } } },
      });
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', name: 'The Bytes' });
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-2', title: 'Team Proj' });
      const teamService = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());
      await teamService.generateMine('event-1', 'user-2');
      const teamPayload = prisma.certificate.create.mock.calls[0][0].data.payloadJson;
      expect(teamPayload.teamName).toBe('The Bytes');
      expect(teamPayload.projectName).toBe('Team Proj');
    });

    it('is idempotent: an existing certificate for a role is never re-created', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1', title: 'Proj', verification: { finalDecision: 'APPROVED' } });
      prisma.certificate.findUnique.mockResolvedValue({ id: 'existing-cert', role: 'PARTICIPANT' });
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await service.generateMine('event-1', 'user-1');

      expect(prisma.certificate.create).not.toHaveBeenCalled();
    });
  });

  describe('manualIssue — organizer override (Section 2.2)', () => {
    it('bypasses the disqualification exclusion', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.certificate.findUnique.mockResolvedValue(null);
      prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1', title: 'Proj', verification: { finalDecision: 'DISQUALIFIED' } });
      const audit = makeAudit();
      const service = new CertificatesService(prisma, audit as any, makeRedis(), makeSigning(), makeTemplates());

      await service.manualIssue('event-1', 'organizer-1', { userId: 'user-1', role: 'PARTICIPANT' as any, reason: 'organizer discretion' });

      expect(prisma.certificate.create).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        'organizer-1',
        'CERTIFICATE_MANUALLY_ISSUED',
        expect.objectContaining({ recipientUserId: 'user-1', role: 'PARTICIPANT', reason: 'organizer discretion' }),
      );
    });

    it('rejects if that role is already issued for that person', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.certificate.findUnique.mockResolvedValue({ id: 'existing' });
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(
        service.manualIssue('event-1', 'organizer-1', { userId: 'user-1', role: 'PARTICIPANT' as any, reason: 'r' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.certificate.create).not.toHaveBeenCalled();
    });

    it('rejects when the target has no participation/judging record supporting that role at all', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(EVENT);
      prisma.certificate.findUnique.mockResolvedValue(null);
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(
        service.manualIssue('event-1', 'organizer-1', { userId: 'user-1', role: 'JUDGE' as any, reason: 'r' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getPublic — verification is always recomputed live (Section 6)', () => {
    it('calls signing.verify fresh against the stored payload/signature/publicKeyId, never trusting a cached flag', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue({
        id: 'cert-1',
        templateId: 'tmpl-1',
        templateVersion: 1,
        payloadJson: { recipientName: 'Ada' },
        signature: 'sig',
        publicKeyId: 'key-1',
      });
      const signing = makeSigning({ verify: jest.fn().mockReturnValue(true) });
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), signing, makeTemplates());

      const result = await service.getPublic('cert-1');

      expect(signing.verify).toHaveBeenCalledWith({ recipientName: 'Ada' }, 'sig', 'key-1');
      expect(result.verified).toBe(true);
    });

    it('reports verified: false for a signature that fails verification', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue({
        id: 'cert-1', templateId: 'tmpl-1', templateVersion: 1,
        payloadJson: { recipientName: 'Ada' }, signature: 'bad', publicKeyId: 'key-1',
      });
      const signing = makeSigning({ verify: jest.fn().mockReturnValue(false) });
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), signing, makeTemplates());

      const result = await service.getPublic('cert-1');

      expect(result.verified).toBe(false);
    });

    it('404s for a nonexistent certificate', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue(null);
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.getPublic('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rendering cache (Section 5/9)', () => {
    it('returns byte-identical SVG on a second request before any template edit (cache hit)', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue({
        id: 'cert-1', templateId: 'tmpl-1', templateVersion: 1,
        payloadJson: { recipientName: 'Ada' }, signature: 'sig', publicKeyId: 'key-1',
      });
      const redis = makeRedis();
      const templates = makeTemplates();
      const service = new CertificatesService(prisma, makeAudit() as any, redis, makeSigning(), templates);

      const first = await service.getPublic('cert-1');
      const second = await service.getPublic('cert-1');

      expect(second.svg).toBe(first.svg);
      expect(redis.client.set).toHaveBeenCalledTimes(1); // only rendered once
    });

    it('produces a freshly rendered result after a template version bump', async () => {
      const prisma = makePrisma();
      const redis = makeRedis();
      const templates = makeTemplates({ id: 'tmpl-1', version: 1, svgMarkup: '<svg><text>{{recipientName}} v1</text></svg>' });
      prisma.certificate.findUnique.mockResolvedValue({
        id: 'cert-1', templateId: 'tmpl-1', templateVersion: 1,
        payloadJson: { recipientName: 'Ada' }, signature: 'sig', publicKeyId: 'key-1',
      });
      const service = new CertificatesService(prisma, makeAudit() as any, redis, makeSigning(), templates);
      const beforeEdit = await service.getPublic('cert-1');

      // A newer certificate, issued after the template was edited, pins
      // the NEW version — different cache key, different content.
      templates.getById.mockResolvedValue({ id: 'tmpl-2', version: 2, svgMarkup: '<svg><text>{{recipientName}} v2</text></svg>' });
      prisma.certificate.findUnique.mockResolvedValue({
        id: 'cert-2', templateId: 'tmpl-2', templateVersion: 2,
        payloadJson: { recipientName: 'Ada' }, signature: 'sig', publicKeyId: 'key-1',
      });
      const afterEdit = await service.getPublic('cert-2');

      expect(beforeEdit.svg).toContain('v1');
      expect(afterEdit.svg).toContain('v2');
    });
  });

  describe('download — access control (Section 6, D39)', () => {
    const CERT = {
      id: 'cert-1', eventId: 'event-1', userId: 'owner-1', templateId: 'tmpl-1', templateVersion: 1,
      payloadJson: { recipientName: 'Ada' }, signature: 'sig', publicKeyId: 'key-1',
    };

    it('allows the certificate\'s own owner', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue(CERT);
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.download('cert-1', { id: 'owner-1', siteAdmin: false })).resolves.toBeInstanceOf(Buffer);
    });

    it('allows an organizer scoped to that specific event', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue(CERT);
      prisma.eventMembership.findUnique.mockResolvedValue({ role: 'ORGANIZER', invitationStatus: 'ACCEPTED' });
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.download('cert-1', { id: 'organizer-1', siteAdmin: false })).resolves.toBeInstanceOf(Buffer);
    });

    it('rejects an organizer of a DIFFERENT event — never a global organizer permission', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue(CERT);
      prisma.eventMembership.findUnique.mockResolvedValue(null); // no membership on THIS event
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.download('cert-1', { id: 'organizer-of-other-event', siteAdmin: false })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects an unrelated authenticated user', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue(CERT);
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.download('cert-1', { id: 'random-user', siteAdmin: false })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows siteAdmin unconditionally', async () => {
      const prisma = makePrisma();
      prisma.certificate.findUnique.mockResolvedValue(CERT);
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      await expect(service.download('cert-1', { id: 'admin-1', siteAdmin: true })).resolves.toBeInstanceOf(Buffer);
    });
  });

  describe('listForUser — public gallery (Section 7)', () => {
    it('takes no caller/auth parameter — callable for any user id with no identity check', async () => {
      const prisma = makePrisma();
      prisma.certificate.findMany = jest.fn().mockResolvedValue([
        { id: 'c1', role: 'PARTICIPANT', issuedAt: new Date(), event: { id: 'e1', name: 'Hack', slug: 'hack' }, payloadJson: { recipientName: 'Ada' } },
      ]);
      const service = new CertificatesService(prisma, makeAudit() as any, makeRedis(), makeSigning(), makeTemplates());

      const result = await service.listForUser('any-user-id');

      expect(result).toHaveLength(1);
      expect(result[0].certificateId).toBe('c1');
    });
  });
});
