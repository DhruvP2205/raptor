import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

function makePrisma() {
  return {
    event: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    eventMembership: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function makeMembership() {
  return {
    assertAccountTypeMatchesRole: jest.fn(),
    createOrganizerMembership: jest.fn(),
  };
}

function makeMarkdown() {
  return { renderToSafeHtml: jest.fn((s: string) => `<p>${s}</p>`) };
}

// A full, valid, strictly-ordered timeline — tests override individual
// fields to exercise specific violations.
function validTimelineDto() {
  const base = Date.UTC(2027, 0, 1);
  const day = 24 * 60 * 60 * 1000;
  return {
    name: 'Test Hackathon',
    registrationOpensAt: new Date(base).toISOString(),
    registrationClosesAt: new Date(base + day).toISOString(),
    eventStartsAt: new Date(base + day).toISOString(),
    submissionsOpenAt: new Date(base + 2 * day).toISOString(),
    submissionsCloseAt: new Date(base + 3 * day).toISOString(),
    eventEndsAt: new Date(base + 3 * day).toISOString(),
    judgingClosesAt: new Date(base + 4 * day).toISOString(),
    resultsAnnounceAt: new Date(base + 4 * day).toISOString(),
    votingOpensAt: new Date(base + 5 * day).toISOString(),
    votingClosesAt: new Date(base + 6 * day).toISOString(),
    votingWinnerAnnounceAt: new Date(base + 7 * day).toISOString(),
  };
}

describe('EventsService', () => {
  describe('createEvent', () => {
    it('rejects a non-ORGANIZER creator before creating any Event row (no orphaned event)', async () => {
      const prisma = makePrisma();
      const membership = makeMembership();
      membership.assertAccountTypeMatchesRole.mockImplementation(() => {
        throw new ForbiddenException({ code: 'ACCOUNT_TYPE_MISMATCH' });
      });
      const service = new EventsService(prisma as any, membership as any, makeMarkdown() as any);

      await expect(
        service.createEvent({ id: 'u1', accountType: 'PARTICIPANT' } as any, validTimelineDto() as any),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.event.create).not.toHaveBeenCalled();
      expect(membership.createOrganizerMembership).not.toHaveBeenCalled();
    });

    it('rejects a timeline that violates the ordering chain, naming the pair', async () => {
      const prisma = makePrisma();
      const dto = validTimelineDto();
      dto.registrationClosesAt = dto.registrationOpensAt; // must be strictly before
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      await expect(
        service.createEvent({ id: 'u1', accountType: 'ORGANIZER' } as any, dto as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('auto-generates a slug from the name when none is given, and creates the organizer membership', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue(null); // slug not taken
      prisma.event.create.mockResolvedValue({ id: 'event-1', ...parsedDates(validTimelineDto()) });
      const membership = makeMembership();
      const service = new EventsService(prisma as any, membership as any, makeMarkdown() as any);

      await service.createEvent({ id: 'u1', accountType: 'ORGANIZER' } as any, validTimelineDto() as any);

      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'test-hackathon' }) }),
      );
      expect(membership.createOrganizerMembership).toHaveBeenCalledWith('event-1', 'u1', 'ORGANIZER', null);
    });

    it('appends a numeric suffix when the generated slug is already taken', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique
        .mockResolvedValueOnce({ id: 'other-event', slug: 'test-hackathon' })
        .mockResolvedValueOnce(null);
      prisma.event.create.mockResolvedValue({ id: 'event-1', ...parsedDates(validTimelineDto()) });
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      await service.createEvent({ id: 'u1', accountType: 'ORGANIZER' } as any, validTimelineDto() as any);

      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'test-hackathon-2' }) }),
      );
    });
  });

  describe('updateEvent', () => {
    it('rejects changing the slug once the event is PUBLISHED', async () => {
      const prisma = makePrisma();
      const event = { id: 'e1', status: 'PUBLISHED', slug: 'original', ...parsedDates(validTimelineDto()) };
      prisma.event.findUnique.mockResolvedValue(event);
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      await expect(
        service.updateEvent('e1', { slug: 'new-slug' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('allows changing the slug while DRAFT', async () => {
      const prisma = makePrisma();
      const event = { id: 'e1', status: 'DRAFT', slug: 'original', ...parsedDates(validTimelineDto()) };
      prisma.event.findUnique
        .mockResolvedValueOnce(event) // getEventOrThrow
        .mockResolvedValueOnce(null); // new slug not taken
      prisma.event.update.mockResolvedValue({ ...event, slug: 'new-slug' });
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      await service.updateEvent('e1', { slug: 'new-slug' } as any);

      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'new-slug' }) }),
      );
    });

    it('rejects editing a timeline field whose phase has already passed, on a PUBLISHED event', async () => {
      const prisma = makePrisma();
      const timeline = parsedDates(validTimelineDto());
      const event = { id: 'e1', status: 'PUBLISHED', slug: 'x', ...timeline };
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      // Fixture timestamps, manipulated into the past relative to real
      // now() — never waited-for in a test, per CLAUDE.md's testing
      // philosophy.
      const pastEvent = {
        ...event,
        registrationOpensAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      };
      prisma.event.findUnique.mockResolvedValue(pastEvent);

      await expect(
        service.updateEvent('e1', { registrationOpensAt: new Date().toISOString() } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('allows extending a not-yet-passed deadline later, rejects moving it earlier than its current value', async () => {
      const prisma = makePrisma();
      const timeline = parsedDates(validTimelineDto());
      const event = { id: 'e1', status: 'PUBLISHED', slug: 'x', ...timeline };
      prisma.event.findUnique.mockResolvedValue(event);
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      const earlier = new Date(timeline.votingWinnerAnnounceAt.getTime() - 1000).toISOString();
      await expect(
        service.updateEvent('e1', { votingWinnerAnnounceAt: earlier } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.event.update.mockResolvedValue(event);
      const later = new Date(timeline.votingWinnerAnnounceAt.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
      await service.updateEvent('e1', { votingWinnerAnnounceAt: later } as any);
      expect(prisma.event.update).toHaveBeenCalled();
    });
  });

  describe('getEventBySlug', () => {
    it('returns a PUBLISHED event to an anonymous caller', async () => {
      const prisma = makePrisma();
      const event = { id: 'e1', status: 'PUBLISHED', slug: 'x', ...parsedDates(validTimelineDto()) };
      prisma.event.findUnique.mockResolvedValue(event);
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      const result = await service.getEventBySlug('x', null);
      expect(result.id).toBe('e1');
    });

    it('404s a DRAFT event for an anonymous caller, never revealing it exists', async () => {
      const prisma = makePrisma();
      const event = { id: 'e1', status: 'DRAFT', slug: 'x', ...parsedDates(validTimelineDto()) };
      prisma.event.findUnique.mockResolvedValue(event);
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      await expect(service.getEventBySlug('x', null)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s a DRAFT event for a logged-in caller with no membership on it', async () => {
      const prisma = makePrisma();
      const event = { id: 'e1', status: 'DRAFT', slug: 'x', ...parsedDates(validTimelineDto()) };
      prisma.event.findUnique.mockResolvedValue(event);
      prisma.eventMembership.findUnique.mockResolvedValue(null);
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      await expect(
        service.getEventBySlug('x', { id: 'u2', siteAdmin: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('shows a DRAFT event to a member of that event', async () => {
      const prisma = makePrisma();
      const event = { id: 'e1', status: 'DRAFT', slug: 'x', ...parsedDates(validTimelineDto()) };
      prisma.event.findUnique.mockResolvedValue(event);
      prisma.eventMembership.findUnique.mockResolvedValue({ invitationStatus: 'ACCEPTED' });
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      const result = await service.getEventBySlug('x', { id: 'u1', siteAdmin: false });
      expect(result.id).toBe('e1');
    });

    it('shows a DRAFT event to siteAdmin without checking membership', async () => {
      const prisma = makePrisma();
      const event = { id: 'e1', status: 'DRAFT', slug: 'x', ...parsedDates(validTimelineDto()) };
      prisma.event.findUnique.mockResolvedValue(event);
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      const result = await service.getEventBySlug('x', { id: 'admin-1', siteAdmin: true });
      expect(result.id).toBe('e1');
      expect(prisma.eventMembership.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('deleteEvent', () => {
    it('rejects deleting an already-ARCHIVED event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ id: 'e1', status: 'ARCHIVED' });
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      await expect(service.deleteEvent('e1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows deleting a DRAFT event', async () => {
      const prisma = makePrisma();
      prisma.event.findUnique.mockResolvedValue({ id: 'e1', status: 'DRAFT' });
      const service = new EventsService(prisma as any, makeMembership() as any, makeMarkdown() as any);

      await service.deleteEvent('e1');
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { status: 'DELETED' },
      });
    });
  });
});

function parsedDates(dto: ReturnType<typeof validTimelineDto>) {
  return {
    registrationOpensAt: new Date(dto.registrationOpensAt),
    registrationClosesAt: new Date(dto.registrationClosesAt),
    eventStartsAt: new Date(dto.eventStartsAt),
    submissionsOpenAt: new Date(dto.submissionsOpenAt),
    submissionsCloseAt: new Date(dto.submissionsCloseAt),
    eventEndsAt: new Date(dto.eventEndsAt),
    judgingClosesAt: new Date(dto.judgingClosesAt),
    resultsAnnounceAt: new Date(dto.resultsAnnounceAt),
    votingOpensAt: new Date(dto.votingOpensAt),
    votingClosesAt: new Date(dto.votingClosesAt),
    votingWinnerAnnounceAt: new Date(dto.votingWinnerAnnounceAt),
  };
}
