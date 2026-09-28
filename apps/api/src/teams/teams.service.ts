import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Team, type TeamMembership } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { generateSixDigitCode } from '../common/six-digit-code.util';
import { slugify } from '../common/slugify.util';
import { PrismaService } from '../prisma/prisma.service';

const JOIN_CODE_PATTERN = /^(.+)-(\d{6})$/;

// Team Management — see docs/stages/04-team-management.md. Deliberately
// NOT implemented: a generic "leave" action for a non-admin member.
// Section 6/8 enumerate membership-management actions exhaustively
// (add via join link, kick, regenerate link, delete) and every one of
// them is admin-exclusive — there's no separate "leave" action named
// anywhere. A member who wants off a team has to ask the admin to kick
// them. Read as deliberate (keeps team composition always
// admin-controlled), not an oversight — flagged here in case that
// reading is wrong.
@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Not named in the stage doc — added because the frontend has no
  // other way to re-fetch "am I on a team, and who else is" after the
  // initial create/join response (create returns only the Team row, no
  // roster; join returns only the caller's own TeamMembership row, not
  // the team). Mirrors the same "/mine" convenience shape Module 5 uses
  // for submissions (D80).
  async getMyTeam(eventId: string, userId: string) {
    const membership = await this.prisma.teamMembership.findFirst({
      where: { userId, team: { eventId } },
      include: { team: { include: { members: { include: { user: true } } } } },
    });
    if (!membership) {
      throw new NotFoundException({
        code: 'NO_TEAM',
        message: 'You are not on a team for this event.',
      });
    }
    const { team } = membership;
    // The frontend's roster-lock messaging (docs/design/04-team-management.md
    // Section 3 — Kick/Regenerate/join-via-link go absent, with an
    // explanation, once locked) needs to know this without a second
    // round trip; same `everSubmitted` flag assertRosterNotLocked below
    // checks server-side on every mutating action regardless.
    const submission = await this.prisma.submission.findUnique({
      where: { teamId: team.id },
      select: { everSubmitted: true },
    });
    return {
      ...team,
      everSubmitted: submission?.everSubmitted ?? false,
      members: team.members.map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        joinedAt: m.joinedAt,
      })),
    };
  }

  async createTeam(eventId: string, userId: string, name: string): Promise<Team> {
    await this.assertRegisteredParticipant(eventId, userId);
    await this.assertNotAlreadyOnATeam(eventId, userId);
    await this.assertNoSoloSubmission(eventId, userId);

    const existing = await this.prisma.team.findUnique({
      where: { eventId_name: { eventId, name } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'TEAM_NAME_TAKEN',
        message: 'A team with this name already exists on this event.',
      });
    }

    // Slugified name, generated once — never regenerated, since the
    // name it's derived from can never change (Section 4.1). The doc's
    // format line `team-{slugified-team-name}-{6-digit-random}` reads
    // as a literal "team-" constant, but its own worked example (name
    // "Team Xmass" -> "team-xmass-482913") only resolves if the prefix
    // is slugify(name) alone: slugifying the full name already yields
    // "team-xmass", so prepending another literal "team-" would double
    // it to "team-team-xmass", which the example doesn't show.
    const joinLinkPrefix = slugify(name);

    return this.prisma.$transaction(async (tx) => {
      const team = await this.withUniqueSuffix((joinLinkSuffix) =>
        tx.team.create({
          data: { eventId, name, adminUserId: userId, joinLinkPrefix, joinLinkSuffix },
        }),
      );
      await tx.teamMembership.create({ data: { teamId: team.id, userId } });
      return team;
    });
  }

  async joinTeam(userId: string, code: string): Promise<TeamMembership> {
    const match = JOIN_CODE_PATTERN.exec(code.trim());
    if (!match) {
      throw new NotFoundException({
        code: 'INVALID_JOIN_CODE',
        message: 'This join code is invalid.',
      });
    }
    const [, joinLinkPrefix, joinLinkSuffix] = match;

    const team = await this.prisma.team.findUnique({
      where: { joinLinkPrefix_joinLinkSuffix: { joinLinkPrefix, joinLinkSuffix } },
    });
    if (!team) {
      throw new NotFoundException({
        code: 'INVALID_JOIN_CODE',
        message: 'This join code is invalid.',
      });
    }

    // Requirements from Section 5, all server-side:
    await this.assertRegisteredParticipant(team.eventId, userId);
    await this.assertNotAlreadyOnATeam(team.eventId, userId);
    await this.assertNoSoloSubmission(team.eventId, userId);
    // "add via join link" is explicitly one of the roster-lock-governed
    // actions (Section 6) — a team that's already submitted can't gain
    // new members either.
    await this.assertRosterNotLocked(team.id);

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: team.eventId },
    });
    // Admin counts toward the total (Section 5) — a plain row count
    // already includes the admin's own TeamMembership row.
    const memberCount = await this.prisma.teamMembership.count({
      where: { teamId: team.id },
    });
    if (memberCount >= event.maxTeamSize) {
      throw new ConflictException({
        code: 'TEAM_FULL',
        message: 'This team is already at its maximum size.',
      });
    }

    return this.prisma.teamMembership.create({ data: { teamId: team.id, userId } });
  }

  async kickMember(
    teamId: string,
    actingUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const team = await this.getTeamOrThrow(teamId);
    this.assertIsAdmin(team, actingUserId);

    // No "leave" action exists, but the admin kicking themselves would
    // be the same thing through a side door — Section 6 is explicit
    // that the only way the admin's relationship to the team ends is by
    // destroying the team itself.
    if (targetUserId === team.adminUserId) {
      throw new BadRequestException({
        code: 'CANNOT_KICK_ADMIN',
        message:
          'The admin cannot kick themselves — regenerate the join link to stay solo, or delete the team instead.',
      });
    }

    await this.assertRosterNotLocked(team.id);

    const deleted = await this.prisma.teamMembership.deleteMany({
      where: { teamId, userId: targetUserId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'NOT_A_MEMBER',
        message: 'That user is not a member of this team.',
      });
    }

    await this.audit.record(actingUserId, 'TEAM_MEMBER_KICKED', {
      eventId: team.eventId,
      teamId,
      targetUserId,
    });
  }

  // Added per docs/design/04-team-management.md Section 3 States
  // ("Leave team" shown to non-admin members, "own action, no
  // confirmation modal needed") — the module-level comment above
  // originally read the backend spec's silence on this as deliberate,
  // but the frontend design pass wants it and there's no real reason a
  // non-admin member shouldn't be able to remove themselves the same
  // way an admin removes them (same roster-lock condition, no
  // additional risk). TODO: undocumented decision, needs confirmation
  // against stages/04-team-management.md, which never named this
  // action either way.
  async leaveTeam(teamId: string, actingUserId: string): Promise<void> {
    const team = await this.getTeamOrThrow(teamId);
    if (actingUserId === team.adminUserId) {
      // Unconditional, not just "while others remain" — an admin
      // leaving even as the sole member would orphan the team (a team
      // is never, at any point, without an admin/member — Section 6).
      // The admin's only paths off a team are Delete or, once solo,
      // Regenerate-and-restart; "leave" isn't one of them at all.
      throw new BadRequestException({
        code: 'ADMIN_CANNOT_LEAVE',
        message:
          'The admin cannot leave this team — kick every other member first, then delete the team or regenerate the join link to stay solo.',
      });
    }
    await this.assertRosterNotLocked(team.id);

    const deleted = await this.prisma.teamMembership.deleteMany({
      where: { teamId, userId: actingUserId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'NOT_A_MEMBER',
        message: 'You are not a member of this team.',
      });
    }

    await this.audit.record(actingUserId, 'TEAM_MEMBER_LEFT', {
      eventId: team.eventId,
      teamId,
    });
  }

  async regenerateLink(teamId: string, actingUserId: string): Promise<Team> {
    const team = await this.getTeamOrThrow(teamId);
    this.assertIsAdmin(team, actingUserId);
    await this.assertRosterNotLocked(team.id);

    const updated = await this.withUniqueSuffix((joinLinkSuffix) =>
      this.prisma.team.update({ where: { id: team.id }, data: { joinLinkSuffix } }),
    );

    await this.audit.record(actingUserId, 'TEAM_LINK_REGENERATED', {
      eventId: team.eventId,
      teamId,
    });
    return updated;
  }

  // Admin-only, permitted only before the team's submission has ever
  // been finalized (Section 7) — same permanent-lock condition as
  // membership changes, not merely "currently in draft." Cascades onto
  // any drafted/submitted content via the DB's own onDelete: Cascade
  // (Submission.team, TeamMembership.team) — a single delete, no
  // orphaned rows survive it.
  async deleteTeam(teamId: string, actingUserId: string): Promise<void> {
    const team = await this.getTeamOrThrow(teamId);
    this.assertIsAdmin(team, actingUserId);
    await this.assertRosterNotLocked(team.id);

    await this.prisma.team.delete({ where: { id: team.id } });
    await this.audit.record(actingUserId, 'TEAM_DELETED', {
      eventId: team.eventId,
      teamId,
      name: team.name,
    });
  }

  private async assertRegisteredParticipant(eventId: string, userId: string): Promise<void> {
    const membership = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId, eventId } },
    });
    if (
      !membership ||
      membership.role !== 'PARTICIPANT' ||
      membership.invitationStatus !== 'ACCEPTED'
    ) {
      throw new ForbiddenException({
        code: 'NOT_REGISTERED',
        message: 'You must be registered for this event before creating or joining a team.',
      });
    }
  }

  // Mirrors the "second-team-join" hard-reject (Section 5) — a user can
  // be on at most one team per event, checked across all of the
  // event's teams, never a silent swap.
  private async assertNotAlreadyOnATeam(eventId: string, userId: string): Promise<void> {
    const existing = await this.prisma.teamMembership.findFirst({
      where: { userId, team: { eventId } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_ON_A_TEAM',
        message:
          'Leave your current team first before joining or creating a different one for this event.',
      });
    }
  }

  // Module 5's "one participation track per user per event" rule
  // (docs/stages/05-submission-management.md Section 3), extended back
  // into Module 4: a user who already has a solo submission for this
  // event can't create or join a team here either, until they delete
  // it. The mirror-image check (can't start a solo submission while on
  // a team) lives in SubmissionsService, not here.
  private async assertNoSoloSubmission(eventId: string, userId: string): Promise<void> {
    const existing = await this.prisma.submission.findUnique({
      where: { eventId_soloUserId: { eventId, soloUserId: userId } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_HAS_SOLO_SUBMISSION',
        message:
          'You already have a solo submission for this event — delete it first if you want to join a team instead.',
      });
    }
  }

  private async getTeamOrThrow(teamId: string): Promise<Team> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException({
        code: 'TEAM_NOT_FOUND',
        message: 'No such team.',
      });
    }
    return team;
  }

  private assertIsAdmin(team: Team, userId: string): void {
    if (team.adminUserId !== userId) {
      throw new ForbiddenException({
        code: 'NOT_TEAM_ADMIN',
        message: "Only this team's admin can do that.",
      });
    }
  }

  private async assertRosterNotLocked(teamId: string): Promise<void> {
    const submission = await this.prisma.submission.findUnique({ where: { teamId } });
    if (submission?.everSubmitted) {
      throw new BadRequestException({
        code: 'ROSTER_LOCKED',
        message: 'This team has submitted at least once — its roster is now permanently locked.',
      });
    }
  }

  // Shared by createTeam (first issue) and regenerateLink (re-issue) —
  // one retry loop for the astronomically rare case where a randomly
  // generated suffix collides with an existing one for the same
  // prefix.
  private async withUniqueSuffix<T>(
    attemptFn: (suffix: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = generateSixDigitCode();
      try {
        return await attemptFn(suffix);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          continue;
        }
        throw err;
      }
    }
    throw new Error('Could not generate a unique join code after 5 attempts.');
  }
}
