import { backfillAuditLogEventId } from './backfill-audit-log-event-id';

function makePrisma() {
  return {
    auditLog: { findMany: jest.fn(), update: jest.fn() },
  };
}

describe('backfillAuditLogEventId (Module 24, B1)', () => {
  it('only scans rows where eventId IS NULL', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([]);

    await backfillAuditLogEventId(prisma as any);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { eventId: null },
      select: { id: true, metadataJson: true },
    });
  });

  it('backfills only rows with a recoverable eventId in metadataJson', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'row-1', metadataJson: { eventId: 'event-1' } },
      { id: 'row-2', metadataJson: { userId: 'u1' } }, // no eventId — stays null
      { id: 'row-3', metadataJson: { eventId: 'event-2', roundId: 'r1' } },
    ]);

    const result = await backfillAuditLogEventId(prisma as any);

    expect(prisma.auditLog.update).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.update).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { eventId: 'event-1' } });
    expect(prisma.auditLog.update).toHaveBeenCalledWith({ where: { id: 'row-3' }, data: { eventId: 'event-2' } });
    expect(result).toEqual({ scanned: 3, updated: 2 });
  });

  it('is a no-op (idempotent) when there is nothing left to backfill', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([]);

    const result = await backfillAuditLogEventId(prisma as any);

    expect(prisma.auditLog.update).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, updated: 0 });
  });
});
