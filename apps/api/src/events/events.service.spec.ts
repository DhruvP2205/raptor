import { ForbiddenException } from '@nestjs/common';
import { MembershipService } from '../membership/membership.service';
import { EventsService } from './events.service';

function makePrisma() {
  return { event: { create: jest.fn() } };
}

describe('EventsService', () => {
  it('rejects a non-ORGANIZER creator before creating any Event row (no orphaned event)', async () => {
    const prisma = makePrisma();
    const membership = {
      assertAccountTypeMatchesRole: jest.fn(() => {
        throw new ForbiddenException({ code: 'ACCOUNT_TYPE_MISMATCH' });
      }),
      createOrganizerMembership: jest.fn(),
    };
    const service = new EventsService(prisma as any, membership as unknown as MembershipService);

    await expect(
      service.createEvent(
        { id: 'u1', accountType: 'PARTICIPANT' } as any,
        { name: 'Test Event', eventStartsAt: new Date().toISOString() },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.event.create).not.toHaveBeenCalled();
    expect(membership.createOrganizerMembership).not.toHaveBeenCalled();
  });

  it('creates the Event then its organizer membership, for an ORGANIZER creator', async () => {
    const prisma = makePrisma();
    prisma.event.create.mockResolvedValue({ id: 'event-1' });
    const membership = {
      assertAccountTypeMatchesRole: jest.fn(),
      createOrganizerMembership: jest.fn(),
    };
    const service = new EventsService(prisma as any, membership as unknown as MembershipService);

    const event = await service.createEvent(
      { id: 'u1', accountType: 'ORGANIZER' } as any,
      { name: 'Test Event', eventStartsAt: new Date().toISOString() },
    );

    expect(event).toEqual({ id: 'event-1' });
    expect(membership.createOrganizerMembership).toHaveBeenCalledWith(
      'event-1',
      'u1',
      'ORGANIZER',
      null,
    );
  });
});
