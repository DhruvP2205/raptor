import { OrganizerAuditLogService } from './organizer-audit-log.service';

function makePrisma() {
  return { auditLog: { findMany: jest.fn() } };
}

const ACTOR = { displayName: 'Ada Organizer', email: 'ada@example.com' };

describe('OrganizerAuditLogService (Module 24, B1)', () => {
  it('scopes strictly to the given eventId', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([]);
    const service = new OrganizerAuditLogService(prisma as any);

    await service.list('event-1', {});

    const call = prisma.auditLog.findMany.mock.calls[0][0];
    expect(call.where.eventId).toBe('event-1');
  });

  it('applies date-range and action filters when given', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([]);
    const service = new OrganizerAuditLogService(prisma as any);
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-01');

    await service.list('event-1', { from, to, action: 'VOTING_ROUND_CREATED' });

    const call = prisma.auditLog.findMany.mock.calls[0][0];
    expect(call.where.action).toBe('VOTING_ROUND_CREATED');
    expect(call.where.createdAt).toEqual({ gte: from, lte: to });
  });

  it('maps rows to the public shape, extracting a reason from common metadata keys', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'row-1',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        actor: ACTOR,
        action: 'VOTING_ROUND_RESTARTED',
        metadataJson: { eventId: 'event-1', reason: 'duplicate votes found' },
      },
    ]);
    const service = new OrganizerAuditLogService(prisma as any);

    const page = await service.list('event-1', {});

    expect(page.entries[0]).toEqual({
      id: 'row-1',
      createdAt: '2026-03-01T00:00:00.000Z',
      actor: 'Ada Organizer <ada@example.com>',
      action: 'VOTING_ROUND_RESTARTED',
      reason: 'duplicate votes found',
    });
  });

  it('returns "(unavailable)" as the reason when metadata carries none', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'row-1', createdAt: new Date(), actor: ACTOR, action: 'X', metadataJson: { eventId: 'event-1' } },
    ]);
    const service = new OrganizerAuditLogService(prisma as any);

    const page = await service.list('event-1', {});

    expect(page.entries[0].reason).toBe('(unavailable)');
  });

  it('paginates via cursor — nextCursor is null on the last page', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `row-${i}`,
        createdAt: new Date(),
        actor: ACTOR,
        action: 'X',
        metadataJson: { eventId: 'event-1' },
      })),
    );
    const service = new OrganizerAuditLogService(prisma as any);

    const page = await service.list('event-1', {});

    expect(page.entries).toHaveLength(10);
    expect(page.nextCursor).toBeNull();
  });

  it('sets nextCursor and trims to page size when more rows exist than one page', async () => {
    const prisma = makePrisma();
    // Service requests PAGE_SIZE + 1 to detect "more exist"; simulate
    // that by returning 51 rows for the default 50-row page.
    prisma.auditLog.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => ({
        id: `row-${i}`,
        createdAt: new Date(),
        actor: ACTOR,
        action: 'X',
        metadataJson: { eventId: 'event-1' },
      })),
    );
    const service = new OrganizerAuditLogService(prisma as any);

    const page = await service.list('event-1', {});

    expect(page.entries).toHaveLength(50);
    expect(page.nextCursor).toBe('row-49');
  });

  it('passes the cursor through to Prisma with skip: 1', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([]);
    const service = new OrganizerAuditLogService(prisma as any);

    await service.list('event-1', { cursor: 'row-49' });

    const call = prisma.auditLog.findMany.mock.calls[0][0];
    expect(call.cursor).toEqual({ id: 'row-49' });
    expect(call.skip).toBe(1);
  });
});
