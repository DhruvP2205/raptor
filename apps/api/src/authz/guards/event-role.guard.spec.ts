import { ForbiddenException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { REQUIRE_EVENT_ROLE_KEY } from '../decorators/require-event-role.decorator';
import { EventRoleGuard } from './event-role.guard';

function makeReflector(requiredRole: string | undefined) {
  return { getAllAndOverride: jest.fn().mockReturnValue(requiredRole) };
}

function makePrisma() {
  return { eventMembership: { findUnique: jest.fn() } };
}

function makeAudit() {
  return { record: jest.fn() };
}

function makeContext(req: any) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('EventRoleGuard', () => {
  it('throws a loud, fail-closed error if applied without @RequireEventRole', async () => {
    const guard = new EventRoleGuard(makeReflector(undefined) as any, makePrisma() as any, makeAudit() as any);
    const req = { user: { id: 'u1' }, params: { eventId: 'e1' } };

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('rejects an unauthenticated request', async () => {
    const guard = new EventRoleGuard(makeReflector('ORGANIZER') as any, makePrisma() as any, makeAudit() as any);
    const req = { user: undefined, params: { eventId: 'e1' } };

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('bypasses the membership check for siteAdmin and writes an audit log entry with route/event/who', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const guard = new EventRoleGuard(makeReflector('ORGANIZER') as any, prisma as any, audit as any);
    const req = {
      user: { id: 'admin-1', siteAdmin: true },
      params: { eventId: 'event-1' },
      method: 'POST',
      path: '/events/event-1/organizers',
    };

    const result = await guard.canActivate(makeContext(req));

    expect(result).toBe(true);
    expect(prisma.eventMembership.findUnique).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      'admin-1',
      'SITE_ADMIN_BYPASS',
      expect.objectContaining({ eventId: 'event-1', method: 'POST', requiredRole: 'ORGANIZER' }),
    );
  });

  it('rejects a PENDING judge membership identically to having no membership at all', async () => {
    const prisma = makePrisma();
    const guard = new EventRoleGuard(makeReflector('JUDGE') as any, prisma as any, makeAudit() as any);

    prisma.eventMembership.findUnique.mockResolvedValueOnce({
      role: 'JUDGE',
      invitationStatus: 'PENDING',
    });
    const pendingReq = { user: { id: 'u1' }, params: { eventId: 'e1' } };
    const pendingResult = guard.canActivate(makeContext(pendingReq));

    prisma.eventMembership.findUnique.mockResolvedValueOnce(null);
    const noMembershipReq = { user: { id: 'u2' }, params: { eventId: 'e1' } };
    const noMembershipResult = guard.canActivate(makeContext(noMembershipReq));

    await expect(pendingResult).rejects.toBeInstanceOf(ForbiddenException);
    await expect(noMembershipResult).rejects.toBeInstanceOf(ForbiddenException);
    await expect(pendingResult).rejects.toMatchObject({
      response: { code: 'EVENT_ROLE_REQUIRED' },
    });
    await expect(noMembershipResult).rejects.toMatchObject({
      response: { code: 'EVENT_ROLE_REQUIRED' },
    });
  });

  it('allows an ACCEPTED membership matching the required role', async () => {
    const prisma = makePrisma();
    prisma.eventMembership.findUnique.mockResolvedValue({
      role: 'ORGANIZER',
      invitationStatus: 'ACCEPTED',
    });
    const guard = new EventRoleGuard(makeReflector('ORGANIZER') as any, prisma as any, makeAudit() as any);
    const req: any = { user: { id: 'u1' }, params: { eventId: 'e1' } };

    const result = await guard.canActivate(makeContext(req));

    expect(result).toBe(true);
    expect(req.eventMembership).toEqual(
      expect.objectContaining({ role: 'ORGANIZER', invitationStatus: 'ACCEPTED' }),
    );
  });
});
