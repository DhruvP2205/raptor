import { AuditService, extractEventId } from './audit.service';

function makePrisma() {
  return { auditLog: { create: jest.fn() } };
}

describe('extractEventId (Module 24, B1)', () => {
  it('extracts a string eventId from metadata', () => {
    expect(extractEventId({ eventId: 'event-1', other: 'x' })).toBe('event-1');
  });

  it('returns null when metadata has no eventId', () => {
    expect(extractEventId({ userId: 'u1' })).toBeNull();
  });

  it('returns null for a non-string eventId (never guesses/coerces)', () => {
    expect(extractEventId({ eventId: 123 })).toBeNull();
  });

  it('returns null for null/undefined/non-object metadata', () => {
    expect(extractEventId(null)).toBeNull();
    expect(extractEventId(undefined)).toBeNull();
    expect(extractEventId('not-an-object')).toBeNull();
  });
});

describe('AuditService.record', () => {
  it('writes the extracted eventId alongside every other field', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as any);

    await service.record('actor-1', 'VOTING_ROUND_CREATED', { eventId: 'event-9', roundId: 'r1' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'actor-1',
        action: 'VOTING_ROUND_CREATED',
        metadataJson: { eventId: 'event-9', roundId: 'r1' },
        eventId: 'event-9',
      },
    });
  });

  it('leaves eventId null for a platform-wide action with no eventId in metadata', async () => {
    const prisma = makePrisma();
    const service = new AuditService(prisma as any);

    await service.record('admin-1', 'STAFF_ACCOUNT_CREATED', { newUserId: 'u2', role: 'JUDGE' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-1',
        action: 'STAFF_ACCOUNT_CREATED',
        metadataJson: { newUserId: 'u2', role: 'JUDGE' },
        eventId: null,
      },
    });
  });
});
