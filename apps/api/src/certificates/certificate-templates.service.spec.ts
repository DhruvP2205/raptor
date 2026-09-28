import { NotFoundException } from '@nestjs/common';
import { CertificateTemplatesService } from './certificate-templates.service';

function makePrisma() {
  const store: any[] = [];
  return {
    certificateTemplate: {
      findFirst: jest.fn(({ where, orderBy }: any) => {
        const rows = store.filter((r) => r.eventId === where.eventId);
        if (rows.length === 0) return Promise.resolve(null);
        rows.sort((a, b) => (orderBy.version === 'desc' ? b.version - a.version : a.version - b.version));
        return Promise.resolve(rows[0]);
      }),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(store.find((r) => r.id === where.id) ?? null)),
      create: jest.fn(({ data }: any) => {
        const row = { id: `tmpl-${store.length + 1}`, createdAt: new Date(), ...data };
        store.push(row);
        return Promise.resolve(row);
      }),
    },
    __store: store,
  } as any;
}

function makeAudit() {
  return { record: jest.fn() };
}

describe('CertificateTemplatesService', () => {
  it('creates version 1 on first upload', async () => {
    const prisma = makePrisma();
    const service = new CertificateTemplatesService(prisma, makeAudit() as any);

    const template = await service.upsert('event-1', 'organizer-1', { svgMarkup: '<svg><text>{{recipientName}}</text></svg>' });

    expect(template.version).toBe(1);
  });

  it('an edit creates a NEW row (version+1) rather than mutating the previous one', async () => {
    const prisma = makePrisma();
    const service = new CertificateTemplatesService(prisma, makeAudit() as any);

    const v1 = await service.upsert('event-1', 'organizer-1', { svgMarkup: '<svg><text>v1</text></svg>' });
    const v2 = await service.upsert('event-1', 'organizer-1', { svgMarkup: '<svg><text>v2</text></svg>' });

    expect(v2.version).toBe(2);
    expect(v2.id).not.toBe(v1.id);

    // The old row must still exist, unedited — this is the whole point:
    // an already-issued certificate pinned to v1's id/version must be
    // able to keep rendering against it forever.
    const stillThere = await service.getById(v1.id);
    expect(stillThere.svgMarkup).toContain('v1');
    expect(stillThere.version).toBe(1);
  });

  it('sanitizes the markup before storing it', async () => {
    const prisma = makePrisma();
    const service = new CertificateTemplatesService(prisma, makeAudit() as any);

    const template = await service.upsert('event-1', 'organizer-1', {
      svgMarkup: '<svg><script>evil()</script><text>ok</text></svg>',
    });

    expect(template.svgMarkup).not.toContain('script');
    expect(template.svgMarkup).not.toContain('evil');
  });

  it('getCurrentForEvent returns the highest version', async () => {
    const prisma = makePrisma();
    const service = new CertificateTemplatesService(prisma, makeAudit() as any);
    await service.upsert('event-1', 'u1', { svgMarkup: '<svg><text>v1</text></svg>' });
    await service.upsert('event-1', 'u1', { svgMarkup: '<svg><text>v2</text></svg>' });

    const current = await service.getCurrentForEvent('event-1');

    expect(current.version).toBe(2);
    expect(current.svgMarkup).toContain('v2');
  });

  it('404s when no template has ever been uploaded for the event', async () => {
    const prisma = makePrisma();
    const service = new CertificateTemplatesService(prisma, makeAudit() as any);

    await expect(service.getCurrentForEvent('event-never-uploaded')).rejects.toBeInstanceOf(NotFoundException);
  });
});
