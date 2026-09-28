import { Injectable } from '@nestjs/common';
import type { Event, User } from '@prisma/client';
import { MembershipService } from '../membership/membership.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';

// Deliberately minimal — see D59 in docs/DECISIONS.md. Just enough to
// anchor EventMembership and unblock Module 2. Module 3
// (Event Management) owns the real Event feature set and will extend
// this additively.
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
  ) {}

  async createEvent(creator: User, dto: CreateEventDto): Promise<Event> {
    // Checked before any write — an accountType mismatch must not leave
    // an orphaned Event row with no organizer membership behind it.
    this.membership.assertAccountTypeMatchesRole(
      creator.accountType,
      'ORGANIZER',
    );

    const event = await this.prisma.event.create({
      data: { name: dto.name, eventStartsAt: new Date(dto.eventStartsAt) },
    });

    // The user who creates an event automatically becomes its first
    // organizer — immediate, no acceptance step (Section 3.1).
    await this.membership.createOrganizerMembership(
      event.id,
      creator.id,
      creator.accountType,
      null,
    );

    return event;
  }
}
