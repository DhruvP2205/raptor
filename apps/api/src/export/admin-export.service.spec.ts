import { AdminExportService } from './admin-export.service';

function makePrisma() {
  return {
    event: { findMany: jest.fn().mockResolvedValue([]) },
    eventMembership: { groupBy: jest.fn().mockResolvedValue([]) },
    submission: { groupBy: jest.fn().mockResolvedValue([]) },
    globalRankingSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    globalRankingEntry: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}
function makeAudit() {
  return { record: jest.fn() };
}

describe('AdminExportService — every admin-tier call writes exactly one AuditLog entry (Section 16)', () => {
  it('exportAllEvents', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    await new AdminExportService(prisma, audit as any).exportAllEvents('admin-1');
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith('admin-1', 'ADMIN_EXPORT_ALL_EVENTS', expect.anything());
  });

  it('exportGlobalRanking', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    await new AdminExportService(prisma, audit as any).exportGlobalRanking('admin-1');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('exportAuditLog', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    await new AdminExportService(prisma, audit as any).exportAuditLog('admin-1');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('exportUserDirectory', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    await new AdminExportService(prisma, audit as any).exportUserDirectory('admin-1');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe('AdminExportService.exportAuditLog — date-range filter', () => {
  it('passes gte/lte through to the query when both dates are given', async () => {
    const prisma = makePrisma();
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    await new AdminExportService(prisma, makeAudit() as any).exportAuditLog('admin-1', from, to);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdAt: { gte: from, lte: to } } }),
    );
  });

  it('omits gte/lte entirely when no dates are given — no accidental empty-range filter', async () => {
    const prisma = makePrisma();
    await new AdminExportService(prisma, makeAudit() as any).exportAuditLog('admin-1');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdAt: {} } }));
  });
});

describe('AdminExportService.exportAuditLog — Target/Reason extraction from metadataJson', () => {
  // AuditLog has no structured Target/Reason column (only
  // actorUserId/action/metadataJson) — this is a best-effort heuristic
  // over metadataJson's common keys, not a guaranteed-accurate parse.
  it('extracts recognizable id-like keys into Target', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      { createdAt: new Date('2026-01-01T00:00:00Z'), actor: { displayName: 'Org', email: 'org@example.org' }, action: 'SUBMISSION_SUBMITTED', metadataJson: { eventId: 'evt-1', submissionId: 'sub-1' } },
    ]);
    const { columns, rows } = await new AdminExportService(prisma, makeAudit() as any).exportAuditLog('admin-1');

    expect(rows[0][columns.indexOf('Target')]).toBe('eventId=evt-1; submissionId=sub-1');
  });

  it('extracts a reason from any of the several reason-like key names used across the codebase', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      { createdAt: new Date(), actor: { displayName: 'Org', email: 'o@e.org' }, action: 'A', metadataJson: { reason: 'r1' } },
      { createdAt: new Date(), actor: { displayName: 'Org', email: 'o@e.org' }, action: 'B', metadataJson: { correctionReason: 'r2' } },
      { createdAt: new Date(), actor: { displayName: 'Org', email: 'o@e.org' }, action: 'C', metadataJson: { unpublishReason: 'r3' } },
      { createdAt: new Date(), actor: { displayName: 'Org', email: 'o@e.org' }, action: 'D', metadataJson: {} },
    ]);
    const { columns, rows } = await new AdminExportService(prisma, makeAudit() as any).exportAuditLog('admin-1');
    const reasonCol = columns.indexOf('Reason');

    expect(rows[0][reasonCol]).toBe('r1');
    expect(rows[1][reasonCol]).toBe('r2');
    expect(rows[2][reasonCol]).toBe('r3');
    expect(rows[3][reasonCol]).toBe('(unavailable)');
  });

  it('shows the literal "(unavailable)" for Target too, not a blank, when no recognizable key exists', async () => {
    const prisma = makePrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      { createdAt: new Date(), actor: { displayName: 'Org', email: 'o@e.org' }, action: 'SOMETHING', metadataJson: { unrecognizedKey: 'x' } },
    ]);
    const { columns, rows } = await new AdminExportService(prisma, makeAudit() as any).exportAuditLog('admin-1');

    expect(rows[0][columns.indexOf('Target')]).toBe('(unavailable)');
  });
});
