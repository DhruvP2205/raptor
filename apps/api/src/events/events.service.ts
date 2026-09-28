import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Event, User } from '@prisma/client';
import { slugify } from '../common/slugify.util';
import { MarkdownService } from '../markdown/markdown.service';
import { MembershipService } from '../membership/membership.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { computeEventPhase, type EventPhase } from './utils/event-phase';
import {
  TIMELINE_FIELDS,
  validateTimelineEdit,
  validateTimelineOrdering,
  type EventTimeline,
} from './utils/event-timeline';

function parseFullTimeline(dto: CreateEventDto): EventTimeline {
  return {
    registrationOpensAt: new Date(dto.registrationOpensAt),
    registrationClosesAt: new Date(dto.registrationClosesAt),
    eventStartsAt: new Date(dto.eventStartsAt),
    submissionsOpenAt: new Date(dto.submissionsOpenAt),
    submissionsCloseAt: new Date(dto.submissionsCloseAt),
    eventEndsAt: new Date(dto.eventEndsAt),
    resultsAnnounceAt: new Date(dto.resultsAnnounceAt),
    votingOpensAt: new Date(dto.votingOpensAt),
    votingClosesAt: new Date(dto.votingClosesAt),
    votingWinnerAnnounceAt: new Date(dto.votingWinnerAnnounceAt),
  };
}

function parsePartialTimeline(dto: UpdateEventDto): Partial<EventTimeline> {
  const result: Partial<EventTimeline> = {};
  for (const field of TIMELINE_FIELDS) {
    const value = dto[field];
    if (value !== undefined) {
      result[field] = new Date(value);
    }
  }
  return result;
}

function extractTimeline(event: Event): EventTimeline {
  const result = {} as EventTimeline;
  for (const field of TIMELINE_FIELDS) {
    result[field] = event[field];
  }
  return result;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly markdown: MarkdownService,
  ) {}

  async createEvent(creator: User, dto: CreateEventDto) {
    // Checked before any write — an accountType mismatch must not leave
    // an orphaned Event row with no organizer membership behind it
    // (same reasoning as Module 2's minimal version, D59).
    this.membership.assertAccountTypeMatchesRole(
      creator.accountType,
      'ORGANIZER',
    );

    const timeline = parseFullTimeline(dto);
    validateTimelineOrdering(timeline);

    const slug = await this.resolveUniqueSlug(dto.slug ?? slugify(dto.name));

    const event = await this.prisma.event.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description ?? null,
        ...(dto.maxTeamSize !== undefined ? { maxTeamSize: dto.maxTeamSize } : {}),
        ...timeline,
      },
    });

    // The user who creates an event automatically becomes its first
    // organizer — immediate, no acceptance step (Section 3.1 of
    // docs/stages/02-roles-and-membership.md).
    await this.membership.createOrganizerMembership(
      event.id,
      creator.id,
      creator.accountType,
      null,
    );

    return this.toPublicEvent(event);
  }

  async updateEvent(eventId: string, dto: UpdateEventDto) {
    const event = await this.getEventOrThrow(eventId);

    if (dto.slug !== undefined && dto.slug !== event.slug) {
      // Editable only while DRAFT (Section 3.2) — once PUBLISHED, never
      // changeable again, under any circumstance.
      if (event.status !== 'DRAFT') {
        throw new BadRequestException({
          code: 'SLUG_IMMUTABLE',
          message: 'Slug can only be changed while the event is still a draft.',
        });
      }
      const existing = await this.prisma.event.findUnique({
        where: { slug: dto.slug },
      });
      if (existing && existing.id !== eventId) {
        throw new BadRequestException({
          code: 'SLUG_TAKEN',
          message: 'That slug is already in use by another event.',
        });
      }
    }

    const timelineUpdates = parsePartialTimeline(dto);

    // DRAFT: "full edit freedom... no phase-awareness restrictions at
    // all" (Section 3.1) — no per-field checks. PUBLISHED: phase-aware
    // (Section 3.2).
    if (event.status === 'PUBLISHED' && Object.keys(timelineUpdates).length > 0) {
      validateTimelineEdit(extractTimeline(event), timelineUpdates);
    }

    const mergedTimeline = { ...extractTimeline(event), ...timelineUpdates };
    validateTimelineOrdering(mergedTimeline);

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.maxTeamSize !== undefined ? { maxTeamSize: dto.maxTeamSize } : {}),
        ...timelineUpdates,
      },
    });

    return this.toPublicEvent(updated);
  }

  async publishEvent(eventId: string) {
    const event = await this.getEventOrThrow(eventId);
    if (event.status !== 'DRAFT') {
      throw new BadRequestException({
        code: 'NOT_DRAFT',
        message: 'Only a draft event can be published.',
      });
    }
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { status: 'PUBLISHED' },
    });
    return this.toPublicEvent(updated);
  }

  async archiveEvent(eventId: string) {
    const event = await this.getEventOrThrow(eventId);
    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException({
        code: 'NOT_PUBLISHED',
        message: 'Only a published event can be archived.',
      });
    }
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { status: 'ARCHIVED' },
    });
    return this.toPublicEvent(updated);
  }

  // Soft-delete only — CLAUDE.md principle 4, never a bare destructive
  // action. Allowed from DRAFT or PUBLISHED; not from ARCHIVED, which
  // is treated as a settled terminal state. The status diagram in the
  // stage doc shows DELETED branching off PUBLISHED specifically, but
  // blocking a DRAFT event (one nobody has acted on yet) from ever
  // being abandoned seemed like an unintended gap rather than a real
  // restriction — flagged as an inference, see D70 in docs/DECISIONS.md.
  async deleteEvent(eventId: string): Promise<void> {
    const event = await this.getEventOrThrow(eventId);
    if (event.status === 'ARCHIVED' || event.status === 'DELETED') {
      throw new BadRequestException({
        code: 'CANNOT_DELETE',
        message: 'Cannot delete an archived or already-deleted event.',
      });
    }
    await this.prisma.event.update({
      where: { id: eventId },
      data: { status: 'DELETED' },
    });
  }

  // Mixed access (Section 8): anonymous callers see only PUBLISHED
  // events; a non-published event is visible only to a member of that
  // specific event or siteAdmin — same 404 either way, never revealing
  // that a non-visible event exists at all.
  async getEventBySlug(
    slug: string,
    caller: { id: string; siteAdmin: boolean } | null,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: { tracks: true, prizes: true },
    });
    if (!event) {
      throw new NotFoundException();
    }
    if (event.status === 'PUBLISHED') {
      return this.toPublicEvent(event);
    }

    if (!caller) {
      throw new NotFoundException();
    }
    if (!caller.siteAdmin) {
      const membership = await this.prisma.eventMembership.findUnique({
        where: { userId_eventId: { userId: caller.id, eventId: event.id } },
      });
      if (!membership || membership.invitationStatus !== 'ACCEPTED') {
        throw new NotFoundException();
      }
    }

    return this.toPublicEvent(event);
  }

  async listPublicEvents(phaseFilter?: EventPhase) {
    const events = await this.prisma.event.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { eventStartsAt: 'asc' },
    });
    const withPhase = events.map((e) => this.toPublicEvent(e));
    return phaseFilter
      ? withPhase.filter((e) => e.phase === phaseFilter)
      : withPhase;
  }

  // Not named in the stage doc, but a necessary complement to
  // organizer-gated editing: an organizer needs some way to enumerate
  // their own events (including drafts) to manage them at all.
  async listMyEvents(userId: string) {
    const memberships = await this.prisma.eventMembership.findMany({
      where: { userId, invitationStatus: 'ACCEPTED' },
      include: { event: true },
    });
    return memberships.map((m) => this.toPublicEvent(m.event));
  }

  private async resolveUniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.event.findUnique({
        where: { slug: candidate },
      });
      if (!existing) return candidate;
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
  }

  private async getEventOrThrow(eventId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'No such event.',
      });
    }
    return event;
  }

  private toPublicEvent<
    T extends Event & { tracks?: unknown; prizes?: unknown },
  >(event: T) {
    return {
      ...event,
      phase: computeEventPhase(event),
      descriptionHtml: event.description
        ? this.markdown.renderToSafeHtml(event.description)
        : null,
    };
  }
}
