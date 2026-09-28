import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Event, type Submission, type TrackAttachmentMode, type User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MarkdownService } from '../markdown/markdown.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSubmissionDto } from './dto/update-submission.dto';

// Submission Management — see docs/stages/05-submission-management.md.
// No creation endpoint is named anywhere in the doc (Section 5 starts
// from "PATCH /submissions/:id" as if the row already exists) — D80 in
// docs/DECISIONS.md covers the invented POST /events/:eventId/submissions
// shape below: auto-detects SOLO vs TEAM from the caller's current
// team membership for that event, since Section 3 treats that as a
// platform-enforced fact already, not a client-supplied choice.
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly markdown: MarkdownService,
  ) {}

  async startSubmission(eventId: string, userId: string) {
    const event = await this.getEventOrThrow(eventId);
    this.assertBeforeDeadline(event);

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
        message: 'You must be registered for this event before starting a submission.',
      });
    }

    const teamMembership = await this.prisma.teamMembership.findFirst({
      where: { userId, team: { eventId } },
    });

    if (teamMembership) {
      try {
        const created = await this.prisma.submission.create({
          data: { eventId, submissionType: 'TEAM', teamId: teamMembership.teamId },
        });
        return this.toPublicSubmission(created);
      } catch (err) {
        throw this.mapCreateConflict(err, 'This team already has a submission.');
      }
    }

    try {
      const created = await this.prisma.submission.create({
        data: { eventId, submissionType: 'SOLO', soloUserId: userId },
      });
      return this.toPublicSubmission(created);
    } catch (err) {
      throw this.mapCreateConflict(err, 'You already have a submission for this event.');
    }
  }

  async getMine(eventId: string, userId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: {
        eventId,
        OR: [{ soloUserId: userId }, { team: { members: { some: { userId } } } }],
      },
    });
    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'No submission found — start one first.',
      });
    }
    return this.toPublicSubmission(submission);
  }

  // Visibility per Section 6, extended by docs/design/05-submission-management.md
  // Section 4 (the deliberately-deferred "public gallery" feature
  // stages/05-submission-management.md's own Section 6 pointed at):
  // owner always; organizer/admin always once submitted (plus a
  // verification-status panel only they see); a draft is genuinely
  // invisible to everyone else, caller included, including anonymous
  // (404, not a 403 that would confirm a draft exists — D81); and now,
  // once submitted, **anyone at all**, matching `isDraft: false` being
  // exactly the field the backend doc named for this.
  async getById(submissionId: string, caller: { id: string; siteAdmin: boolean } | null) {
    const submission = await this.getSubmissionOrThrow(submissionId);

    const owner = caller ? await this.isOwner(submission, caller.id) : false;
    if (owner) {
      return this.toPublicSubmission(submission);
    }

    if (submission.isDraft) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'No such submission.',
      });
    }

    // Submitted (non-draft): public from here — but an organizer/admin
    // additionally gets the verification-status panel the design doc
    // calls for, so it's still worth knowing which caller this is.
    let verification: { finalDecision: string } | null = null;
    if (caller?.siteAdmin) {
      verification = await this.getVerificationSummary(submissionId);
    } else if (caller) {
      const organizerMembership = await this.prisma.eventMembership.findUnique({
        where: { userId_eventId: { userId: caller.id, eventId: submission.eventId } },
      });
      if (
        organizerMembership?.role === 'ORGANIZER' &&
        organizerMembership.invitationStatus === 'ACCEPTED'
      ) {
        verification = await this.getVerificationSummary(submissionId);
      }
    }

    const submitterName = await this.getSubmitterName(submission);
    return { ...this.toPublicSubmission(submission), submitterName, verification };
  }

  private async getSubmitterName(submission: Submission): Promise<string | null> {
    if (submission.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: submission.teamId },
        select: { name: true },
      });
      return team?.name ?? null;
    }
    if (submission.soloUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: submission.soloUserId },
        select: { displayName: true },
      });
      return user?.displayName ?? null;
    }
    return null;
  }

  private async getVerificationSummary(
    submissionId: string,
  ): Promise<{ finalDecision: string } | null> {
    const v = await this.prisma.submissionVerification.findUnique({
      where: { submissionId },
      select: { finalDecision: true },
    });
    return v ? { finalDecision: v.finalDecision } : null;
  }

  async patch(submissionId: string, userId: string, dto: UpdateSubmissionDto) {
    const submission = await this.getSubmissionOrThrow(submissionId);
    await this.assertOwner(submission, userId);

    const event = await this.getEventOrThrow(submission.eventId);
    this.assertBeforeDeadline(event);

    if (dto.trackIds !== undefined) {
      this.assertTrackSelectionShape(event.trackAttachmentMode, dto.trackIds);
      await this.assertTracksBelongToEvent(event.id, dto.trackIds);
    }

    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.repoUrl !== undefined ? { repoUrl: dto.repoUrl } : {}),
        ...(dto.demoVideoUrl !== undefined ? { demoVideoUrl: dto.demoVideoUrl } : {}),
        ...(dto.liveUrl !== undefined ? { liveUrl: dto.liveUrl } : {}),
        ...(dto.trackIds !== undefined ? { trackIds: dto.trackIds } : {}),
      },
    });
    return this.toPublicSubmission(updated);
  }

  // Section 5.2 — a distinct action, not implied by any PATCH. Requires
  // title/description non-empty, plus trackId(s) if the event isn't
  // trackAttachmentMode NONE, re-validated from scratch every time
  // (including resubmits after an unsubmit) — the server never trusts
  // that a previously-valid row is still valid after further edits.
  async submit(submissionId: string, userId: string) {
    const submission = await this.getSubmissionOrThrow(submissionId);
    await this.assertOwner(submission, userId);

    const event = await this.getEventOrThrow(submission.eventId);
    this.assertBeforeDeadline(event);

    const missing: string[] = [];
    if (!submission.title?.trim()) missing.push('title');
    if (!submission.description?.trim()) missing.push('description');
    if (event.trackAttachmentMode !== 'NONE' && submission.trackIds.length === 0) {
      missing.push('trackIds');
    }
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'MISSING_REQUIRED_FIELDS',
        message: `Cannot submit — missing required field(s): ${missing.join(', ')}.`,
        fields: missing,
      });
    }
    this.assertTrackSelectionShape(event.trackAttachmentMode, submission.trackIds);

    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: { isDraft: false, submittedAt: new Date(), everSubmitted: true },
    });

    await this.audit.record(userId, 'SUBMISSION_SUBMITTED', {
      eventId: submission.eventId,
      submissionId: submission.id,
    });
    return this.toPublicSubmission(updated);
  }

  // Section 5.3 — flips isDraft back to true. submittedAt is untouched
  // here; it only ever moves forward on the *next* submit (D per
  // Section 5.3: "always the most recent submit action's timestamp").
  // everSubmitted never resets, by design — Module 4's roster lock
  // reads it and must survive this cycle.
  async unsubmit(submissionId: string, userId: string) {
    const submission = await this.getSubmissionOrThrow(submissionId);
    await this.assertOwner(submission, userId);

    const event = await this.getEventOrThrow(submission.eventId);
    this.assertBeforeDeadline(event);

    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: { isDraft: true },
    });

    await this.audit.record(userId, 'SUBMISSION_UNSUBMITTED', {
      eventId: submission.eventId,
      submissionId: submission.id,
    });
    return this.toPublicSubmission(updated);
  }

  // Both the organizer's manage-submissions list AND the public gallery
  // (docs/design/05-submission-management.md Section 3) — always only
  // the submitted rows (Section 6: organizers have no access to drafts
  // at all, not even existence; the public never sees drafts either).
  // The event itself still needs the same draft-visibility check
  // `EventsService.getEventBySlug` applies — a submission list for a
  // DRAFT event is exactly as sensitive as the event page itself, so an
  // organizer/admin passes this the same way they pass that, and
  // everyone else 404s exactly when they would on the event page too.
  async listSubmittedForEvent(
    eventId: string,
    caller: { id: string; siteAdmin: boolean } | null,
  ) {
    const event = await this.getEventOrThrow(eventId);
    if (event.status !== 'PUBLISHED') {
      if (!caller) {
        throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
      }
      if (!caller.siteAdmin) {
        const membership = await this.prisma.eventMembership.findUnique({
          where: { userId_eventId: { userId: caller.id, eventId } },
        });
        if (!membership || membership.invitationStatus !== 'ACCEPTED') {
          throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
        }
      }
    }

    const submissions = await this.prisma.submission.findMany({
      where: { eventId, isDraft: false },
      orderBy: { submittedAt: 'asc' },
      include: { team: { select: { name: true } }, soloUser: { select: { displayName: true } } },
    });
    // Gallery cards need a human name, not a teamId/soloUserId (design
    // doc Section 3) — toPublicSubmission itself stays generic/unaware
    // of this join, since most other callers don't need it.
    return submissions.map(({ team, soloUser, ...s }) => ({
      ...this.toPublicSubmission(s),
      submitterName: team?.name ?? soloUser?.displayName ?? null,
    }));
  }

  // siteAdmin-only "drafts in progress" list (Section 6) — ownership and
  // timestamps only, via an explicit Prisma `select` rather than
  // fetching the full row and stripping fields after the fact, so
  // title/description/links are never even pulled out of the database
  // for this query.
  async listDraftsInProgressForEvent(eventId: string) {
    return this.prisma.submission.findMany({
      where: { eventId, isDraft: true },
      select: {
        id: true,
        submissionType: true,
        teamId: true,
        soloUserId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Same sanitized-render pattern as Event/Track descriptions (Section
  // 2) — markdown stored, HTML rendered fresh at response time through
  // one shared path, never persisted as HTML.
  private toPublicSubmission<T extends { description: string | null }>(
    submission: T,
  ): T & { descriptionHtml: string | null } {
    return {
      ...submission,
      descriptionHtml: submission.description
        ? this.markdown.renderToSafeHtml(submission.description)
        : null,
    };
  }

  private async getEventOrThrow(eventId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
    }
    return event;
  }

  private async getSubmissionOrThrow(submissionId: string): Promise<Submission> {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'No such submission.',
      });
    }
    return submission;
  }

  private async isOwner(submission: Submission, userId: string): Promise<boolean> {
    if (submission.submissionType === 'SOLO') {
      return submission.soloUserId === userId;
    }
    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId: submission.teamId!, userId } },
    });
    return membership != null;
  }

  private async assertOwner(submission: Submission, userId: string): Promise<void> {
    if (!(await this.isOwner(submission, userId))) {
      throw new ForbiddenException({
        code: 'NOT_SUBMISSION_OWNER',
        message: 'Only the submission owner (solo participant or a team member) can do that.',
      });
    }
  }

  // Server time only, on every write — a client-supplied timestamp or
  // disabled-button state is never trusted (Section 5.4, CLAUDE.md
  // principle 2).
  private assertBeforeDeadline(event: Event): void {
    if (Date.now() > event.submissionsCloseAt.getTime()) {
      throw new BadRequestException({
        code: 'SUBMISSIONS_CLOSED',
        message: 'The submission deadline for this event has passed.',
      });
    }
  }

  // Shape rules from Section 4/8, checked on every write (not just at
  // submit) — NONE rejects any track data outright rather than
  // silently ignoring it, SINGLE caps at one, MULTIPLE has no cap.
  private assertTrackSelectionShape(mode: TrackAttachmentMode, trackIds: string[]): void {
    if (mode === 'NONE' && trackIds.length > 0) {
      throw new BadRequestException({
        code: 'TRACKS_NOT_ALLOWED',
        message: 'This event has no tracks configured.',
      });
    }
    if (mode === 'SINGLE' && trackIds.length > 1) {
      throw new BadRequestException({
        code: 'TOO_MANY_TRACKS',
        message: 'This event only allows a single track per submission.',
      });
    }
  }

  // Cross-event isolation, same principle as Prizes (Module 3) — a
  // submission can't reference a track belonging to a different event.
  private async assertTracksBelongToEvent(eventId: string, trackIds: string[]): Promise<void> {
    if (trackIds.length === 0) return;
    const count = await this.prisma.track.count({
      where: { id: { in: trackIds }, eventId },
    });
    if (count !== new Set(trackIds).size) {
      throw new BadRequestException({
        code: 'TRACK_NOT_ON_EVENT',
        message: 'One or more selected tracks do not belong to this event.',
      });
    }
  }

  private mapCreateConflict(err: unknown, message: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException({ code: 'SUBMISSION_ALREADY_EXISTS', message });
    }
    return err;
  }
}
