import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';

function makePrisma() {
  const prisma: any = {
    team: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    teamMembership: {
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    eventMembership: { findUnique: jest.fn() },
    event: { findUniqueOrThrow: jest.fn() },
    submission: { findUnique: jest.fn() },
  };
  // Transactions just run the callback against the same mocked client —
  // good enough to exercise the logic without a real DB.
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return prisma;
}

function makeAudit() {
  return { record: jest.fn() };
}

const ACCEPTED_PARTICIPANT = { role: 'PARTICIPANT', invitationStatus: 'ACCEPTED' };

describe('TeamsService', () => {
  describe('createTeam', () => {
    it('rejects a caller who is not a registered participant for the event', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.createTeam('event-1', 'u1', 'My Team')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('rejects a caller already on a team for this event', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue({ id: 'existing-membership' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.createTeam('event-1', 'u1', 'My Team')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a caller who already has a solo submission for this event', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', soloUserId: 'u1' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.createTeam('event-1', 'u1', 'My Team')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate team name on the same event', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      prisma.team.findUnique.mockResolvedValue({ id: 'other-team' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.createTeam('event-1', 'u1', 'Team Xmass')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('derives the join-link prefix from the slugified name and creates the admin membership', async () => {
      const prisma = makePrisma();
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      prisma.team.findUnique.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({ id: 'team-1', joinLinkPrefix: 'team-xmass' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await service.createTeam('event-1', 'u1', 'Team Xmass');

      expect(prisma.team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Team Xmass',
            adminUserId: 'u1',
            joinLinkPrefix: 'team-xmass',
          }),
        }),
      );
      expect(prisma.teamMembership.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', userId: 'u1' },
      });
    });
  });

  describe('getMyTeam', () => {
    it('404s when the caller is not on a team for this event', async () => {
      const prisma = makePrisma();
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.getMyTeam('event-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the team with a flattened member roster (displayName, not the raw User row)', async () => {
      const prisma = makePrisma();
      prisma.teamMembership.findFirst.mockResolvedValue({
        team: {
          id: 'team-1',
          name: 'Team Xmass',
          adminUserId: 'u1',
          members: [
            { userId: 'u1', joinedAt: new Date('2026-01-01'), user: { displayName: 'Ada' } },
            { userId: 'u2', joinedAt: new Date('2026-01-02'), user: { displayName: 'Grace' } },
          ],
        },
      });
      const service = new TeamsService(prisma, makeAudit() as any);

      const result = await service.getMyTeam('event-1', 'u1');

      expect(result.id).toBe('team-1');
      expect(result.members).toEqual([
        { userId: 'u1', displayName: 'Ada', joinedAt: new Date('2026-01-01') },
        { userId: 'u2', displayName: 'Grace', joinedAt: new Date('2026-01-02') },
      ]);
      expect((result.members[0] as any).user).toBeUndefined();
    });
  });

  describe('joinTeam', () => {
    it('rejects a malformed code without ever querying the database', async () => {
      const prisma = makePrisma();
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.joinTeam('u1', 'not-a-valid-code')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.team.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a well-formed but unknown code', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue(null);
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.joinTeam('u1', 'team-xmass-482913')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a caller not registered for the underlying event', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.joinTeam('u1', 'team-xmass-482913')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects a second-team-join attempt for the same event', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue({ id: 'already-on-a-different-team' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.joinTeam('u1', 'team-xmass-482913')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.teamMembership.create).not.toHaveBeenCalled();
    });

    it('rejects a caller who already has a solo submission for this event', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      prisma.submission.findUnique.mockResolvedValue({ id: 'sub-1', soloUserId: 'u1' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.joinTeam('u1', 'team-xmass-482913')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.teamMembership.create).not.toHaveBeenCalled();
    });

    it('rejects joining a team whose roster is already locked', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      // No solo submission (keyed by eventId_soloUserId), but the team's
      // own submission (keyed by teamId) is locked.
      prisma.submission.findUnique.mockImplementation((args: any) =>
        args.where.teamId ? Promise.resolve({ everSubmitted: true }) : Promise.resolve(null),
      );
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.joinTeam('u1', 'team-xmass-482913')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects joining a team already at maxTeamSize (admin counted in)', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      prisma.submission.findUnique.mockResolvedValue(null);
      prisma.event.findUniqueOrThrow.mockResolvedValue({ maxTeamSize: 4 });
      prisma.teamMembership.count.mockResolvedValue(4); // admin + 3 already
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.joinTeam('u1', 'team-xmass-482913')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('succeeds when under maxTeamSize', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', eventId: 'event-1' });
      prisma.eventMembership.findUnique.mockResolvedValue(ACCEPTED_PARTICIPANT);
      prisma.teamMembership.findFirst.mockResolvedValue(null);
      prisma.submission.findUnique.mockResolvedValue(null);
      prisma.event.findUniqueOrThrow.mockResolvedValue({ maxTeamSize: 4 });
      prisma.teamMembership.count.mockResolvedValue(2);
      prisma.teamMembership.create.mockResolvedValue({ teamId: 'team-1', userId: 'u1' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await service.joinTeam('u1', 'team-xmass-482913');
      expect(prisma.teamMembership.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', userId: 'u1' },
      });
    });
  });

  describe('kickMember', () => {
    it('rejects a non-admin actor', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', adminUserId: 'admin-1' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.kickMember('team-1', 'not-admin', 'target-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects the admin trying to kick themselves — the only exit is destroying the team', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', adminUserId: 'admin-1' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.kickMember('team-1', 'admin-1', 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects kicking once the roster is locked', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', adminUserId: 'admin-1' });
      prisma.submission.findUnique.mockResolvedValue({ everSubmitted: true });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.kickMember('team-1', 'admin-1', 'target-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('404s kicking someone who is not actually a member', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', adminUserId: 'admin-1' });
      prisma.submission.findUnique.mockResolvedValue(null);
      prisma.teamMembership.deleteMany.mockResolvedValue({ count: 0 });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.kickMember('team-1', 'admin-1', 'target-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('succeeds and audits who kicked whom', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', eventId: 'event-1', adminUserId: 'admin-1' });
      prisma.submission.findUnique.mockResolvedValue(null);
      prisma.teamMembership.deleteMany.mockResolvedValue({ count: 1 });
      const audit = makeAudit();
      const service = new TeamsService(prisma, audit as any);

      await service.kickMember('team-1', 'admin-1', 'target-1');
      expect(audit.record).toHaveBeenCalledWith('admin-1', 'TEAM_MEMBER_KICKED', {
        eventId: 'event-1',
        teamId: 'team-1',
        targetUserId: 'target-1',
      });
    });
  });

  describe('regenerateLink', () => {
    it('changes only the suffix — the prefix passed to update is never touched', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        adminUserId: 'admin-1',
        joinLinkPrefix: 'team-xmass',
        joinLinkSuffix: '111111',
      });
      prisma.submission.findUnique.mockResolvedValue(null);
      prisma.team.update.mockResolvedValue({
        id: 'team-1',
        joinLinkPrefix: 'team-xmass',
        joinLinkSuffix: '222222',
      });
      const service = new TeamsService(prisma, makeAudit() as any);

      await service.regenerateLink('team-1', 'admin-1');

      const updateCall = prisma.team.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('joinLinkPrefix');
      expect(updateCall.data).toHaveProperty('joinLinkSuffix');
    });

    it('rejects a non-admin actor', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', adminUserId: 'admin-1' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.regenerateLink('team-1', 'not-admin')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects once the roster is locked', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', adminUserId: 'admin-1' });
      prisma.submission.findUnique.mockResolvedValue({ everSubmitted: true });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.regenerateLink('team-1', 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('deleteTeam', () => {
    it('rejects a non-admin actor', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', adminUserId: 'admin-1' });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.deleteTeam('team-1', 'not-admin')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.team.delete).not.toHaveBeenCalled();
    });

    it('rejects once the roster is locked — even for the team\'s own admin', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', adminUserId: 'admin-1' });
      prisma.submission.findUnique.mockResolvedValue({ everSubmitted: true });
      const service = new TeamsService(prisma, makeAudit() as any);

      await expect(service.deleteTeam('team-1', 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('succeeds and audits, relying on DB cascade for drafted content', async () => {
      const prisma = makePrisma();
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        eventId: 'event-1',
        adminUserId: 'admin-1',
        name: 'Team Xmass',
      });
      prisma.submission.findUnique.mockResolvedValue(null);
      const audit = makeAudit();
      const service = new TeamsService(prisma, audit as any);

      await service.deleteTeam('team-1', 'admin-1');

      expect(prisma.team.delete).toHaveBeenCalledWith({ where: { id: 'team-1' } });
      expect(audit.record).toHaveBeenCalledWith('admin-1', 'TEAM_DELETED', {
        eventId: 'event-1',
        teamId: 'team-1',
        name: 'Team Xmass',
      });
    });
  });
});
