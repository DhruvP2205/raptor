import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AssignmentStatus, Event, JudgeAssignment } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AutoAssignDto } from './dto/auto-assign.dto';
import type { CreateAssignmentDto } from './dto/create-assignment.dto';
import type { TransferAssignmentDto } from './dto/transfer-assignment.dto';

// Statuses that count as "currently holding a slot" for per-judge
// capacity purposes — TRANSFERRED rows are dead weight, they don't
// occupy the judge's workload anymore (Section 5).
const ACTIVE_STATUSES: AssignmentStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];

// Module 7 (Judge Assignment) — see docs/stages/07-judge-assignment.md.
// Decides who reviews what; scoring itself is Module 8. Every code path
// here treats `SubmissionVerification.finalDecision = APPROVED` as a
// structural gate (Section 2), not a UI-level filter — enforced in the
// query that builds the assignable/eligible pool, never as a
// after-the-fact check on a client-supplied submission id.
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAssignableSubmissions(eventId: string) {
    await this.getEventOrThrow(eventId);

    const submissions = await this.prisma.submission.findMany({
      where: { eventId, everSubmitted: true, verification: { is: { finalDecision: 'APPROVED' } } },
      include: {
        judgeAssignments: {
          where: { status: { in: ACTIVE_STATUSES } },
          include: { judge: { select: { id: true, displayName: true, email: true } } },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return submissions.map((s) => ({
      submissionId: s.id,
      title: s.title,
      trackIds: s.trackIds,
      assignedJudges: s.judgeAssignments.map((a) => ({
        assignmentId: a.id,
        judgeId: a.judge.id,
        displayName: a.judge.displayName,
        email: a.judge.email,
        status: a.status,
      })),
    }));
  }

  async list(eventId: string, judgeId?: string, submissionId?: string, status?: string) {
    await this.getEventOrThrow(eventId);

    return this.prisma.judgeAssignment.findMany({
      where: {
        eventId,
        ...(judgeId ? { judgeId } : {}),
        ...(submissionId ? { submissionId } : {}),
        ...(status ? { status: status as AssignmentStatus } : {}),
      },
      include: {
        judge: { select: { id: true, displayName: true, email: true } },
        submission: { select: { id: true, title: true } },
      },
      orderBy: { assignedAt: 'asc' },
    });
  }

  // Section 3 — one project, one or more judges, atomic (all requested
  // judges succeed or none do, so an organizer never ends up with a
  // half-applied batch they have to reason about).
  async manualAssign(eventId: string, actingUserId: string, dto: CreateAssignmentDto) {
    const event = await this.getEventOrThrow(eventId);
    const submission = await this.getApprovedSubmissionOrThrow(eventId, dto.submissionId);

    const judges = await this.prisma.eventMembership.findMany({
      where: {
        eventId,
        userId: { in: dto.judgeIds },
        role: 'JUDGE',
        invitationStatus: 'ACCEPTED',
      },
    });
    const foundJudgeIds = new Set(judges.map((j) => j.userId));
    const missing = dto.judgeIds.filter((id) => !foundJudgeIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'JUDGE_NOT_ELIGIBLE',
        message: `Not an accepted judge on this event: ${missing.join(', ')}.`,
      });
    }

    const existing = await this.prisma.judgeAssignment.findMany({
      where: {
        submissionId: submission.id,
        judgeId: { in: dto.judgeIds },
        status: { in: ACTIVE_STATUSES },
      },
    });
    if (existing.length > 0) {
      throw new BadRequestException({
        code: 'ALREADY_ASSIGNED',
        message: `Already assigned to this submission: ${existing.map((a) => a.judgeId).join(', ')}.`,
      });
    }

    const overCapacity: string[] = [];
    for (const judge of judges) {
      const limit = judge.projectLimitOverride ?? event.maxProjectsPerJudge;
      const currentCount = await this.prisma.judgeAssignment.count({
        where: { judgeId: judge.userId, status: { in: ACTIVE_STATUSES } },
      });
      if (currentCount + 1 > limit) {
        overCapacity.push(judge.userId);
      }
    }
    if (overCapacity.length > 0) {
      throw new BadRequestException({
        code: 'JUDGE_OVER_CAPACITY',
        message: `Assigning would exceed maxProjectsPerJudge for: ${overCapacity.join(', ')}. Raise projectLimitOverride first or pick a different judge.`,
        judgeIds: overCapacity,
      });
    }

    const created = await this.prisma.$transaction(
      dto.judgeIds.map((judgeId) =>
        this.prisma.judgeAssignment.create({
          data: { eventId, judgeId, submissionId: submission.id, assignmentMethod: 'MANUAL' },
        }),
      ),
    );

    await this.audit.record(actingUserId, 'ASSIGNMENT_CREATED', {
      eventId,
      submissionId: submission.id,
      judgeIds: dto.judgeIds,
      method: 'MANUAL',
    });

    return created;
  }

  // Section 4 — checkbox-driven strategy, round-robin with a per-run
  // randomized tiebreak. See runAutoAssign's own comment for exactly
  // what "randomized starting offset per judge" is implemented as here
  // and why it satisfies the doc's three guarantees (exact count where
  // capacity allows, load balanced within 1, no correlated clustering)
  // — a judgment call, since the doc names an outcome and a suggested
  // mechanism rather than a fully specified algorithm.
  async autoAssign(eventId: string, actingUserId: string, dto: AutoAssignDto) {
    const event = await this.getEventOrThrow(eventId);

    if (dto.strategy === 'BY_TRACK' && event.trackAttachmentMode === 'NONE') {
      throw new BadRequestException({
        code: 'NO_TRACKS_CONFIGURED',
        message: 'BY_TRACK requires the event to have tracks configured.',
      });
    }

    const submissions = await this.prisma.submission.findMany({
      where: { eventId, everSubmitted: true, verification: { is: { finalDecision: 'APPROVED' } } },
      include: {
        judgeAssignments: { where: { status: { in: ACTIVE_STATUSES } }, select: { judgeId: true } },
      },
    });

    const judgeMemberships = await this.prisma.eventMembership.findMany({
      where: { eventId, role: 'JUDGE', invitationStatus: 'ACCEPTED' },
    });

    const judgeCurrentCount = new Map<string, number>();
    for (const jm of judgeMemberships) {
      const count = await this.prisma.judgeAssignment.count({
        where: { judgeId: jm.userId, status: { in: ACTIVE_STATUSES } },
      });
      judgeCurrentCount.set(jm.userId, count);
    }
    const judgeLimit = (judgeId: string): number => {
      const jm = judgeMemberships.find((j) => j.userId === judgeId)!;
      return jm.projectLimitOverride ?? event.maxProjectsPerJudge;
    };
    const judgeCapacity = (judgeId: string): number => judgeLimit(judgeId) - judgeCurrentCount.get(judgeId)!;

    const eligibleJudgesFor = (submission: { trackIds: string[] }) => {
      if (dto.strategy === 'RANDOM') return judgeMemberships;
      return judgeMemberships.filter(
        (jm) => jm.trackIds.length === 0 || jm.trackIds.some((t) => submission.trackIds.includes(t)),
      );
    };

    // Shuffle submission processing order so any systematic id/creation
    // order never determines who gets priority pick of judges.
    const shuffledSubmissions = shuffle(submissions);

    const toCreate: { judgeId: string; submissionId: string }[] = [];
    const shortfalls: { submissionId: string; assigned: number; needed: number }[] = [];

    for (const submission of shuffledSubmissions) {
      const alreadyAssigned = new Set(submission.judgeAssignments.map((a) => a.judgeId));
      const stillNeeded = dto.reviewsPerProject - alreadyAssigned.size;
      if (stillNeeded <= 0) continue;

      const candidates = eligibleJudgesFor(submission)
        .filter((jm) => !alreadyAssigned.has(jm.userId) && judgeCapacity(jm.userId) > 0)
        // Least-loaded first (keeps load balanced within 1 across the
        // whole run); a fresh random key on every submission is the
        // "randomized offset" — it re-shuffles who wins ties between
        // equally-loaded judges each time, so the same small group never
        // systematically wins every tie (no correlated clustering).
        .map((jm) => ({ jm, tiebreak: Math.random() }))
        .sort((a, b) => {
          const loadDiff = judgeCurrentCount.get(a.jm.userId)! - judgeCurrentCount.get(b.jm.userId)!;
          return loadDiff !== 0 ? loadDiff : a.tiebreak - b.tiebreak;
        })
        .map((x) => x.jm);

      const picked = candidates.slice(0, stillNeeded);
      for (const jm of picked) {
        toCreate.push({ judgeId: jm.userId, submissionId: submission.id });
        judgeCurrentCount.set(jm.userId, judgeCurrentCount.get(jm.userId)! + 1);
      }
      if (picked.length < stillNeeded) {
        shortfalls.push({
          submissionId: submission.id,
          assigned: alreadyAssigned.size + picked.length,
          needed: dto.reviewsPerProject,
        });
      }
    }

    const created =
      toCreate.length > 0
        ? await this.prisma.$transaction(
            toCreate.map((pair) =>
              this.prisma.judgeAssignment.create({
                data: { eventId, ...pair, assignmentMethod: 'ALGORITHMIC' },
              }),
            ),
          )
        : [];

    await this.audit.record(actingUserId, 'AUTO_ASSIGN_RUN', {
      eventId,
      strategy: dto.strategy,
      reviewsPerProject: dto.reviewsPerProject,
      createdCount: created.length,
      shortfallCount: shortfalls.length,
    });

    return { created: created.length, shortfalls };
  }

  // Section 5 — no-show handling. COMPLETED is permanent (checked here,
  // not just relied on as a schema-level guarantee, since nothing in
  // the schema itself can express "final once reached").
  async transfer(
    eventId: string,
    assignmentId: string,
    actingUserId: string,
    dto: TransferAssignmentDto,
  ) {
    const event = await this.getEventOrThrow(eventId);
    const original = await this.prisma.judgeAssignment.findUnique({ where: { id: assignmentId } });
    if (!original || original.eventId !== eventId) {
      throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND', message: 'No such assignment on this event.' });
    }
    if (original.status === 'COMPLETED') {
      throw new BadRequestException({
        code: 'ASSIGNMENT_COMPLETED',
        message: 'A completed assignment can never be transferred, by anyone, under any circumstance.',
      });
    }
    if (original.status === 'TRANSFERRED') {
      throw new BadRequestException({
        code: 'ASSIGNMENT_ALREADY_TRANSFERRED',
        message: 'This assignment has already been transferred.',
      });
    }

    const receiving = await this.prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: dto.toJudgeId, eventId } },
    });
    if (!receiving || receiving.role !== 'JUDGE' || receiving.invitationStatus !== 'ACCEPTED') {
      throw new BadRequestException({
        code: 'JUDGE_NOT_ELIGIBLE',
        message: 'The receiving judge must be an accepted judge on this event.',
      });
    }

    const alreadyOnThisSubmission = await this.prisma.judgeAssignment.findFirst({
      where: { submissionId: original.submissionId, judgeId: dto.toJudgeId, status: { in: ACTIVE_STATUSES } },
    });
    if (alreadyOnThisSubmission) {
      throw new BadRequestException({
        code: 'ALREADY_ASSIGNED',
        message: 'The receiving judge is already assigned to this submission.',
      });
    }

    // Not explicitly required by the stage doc's transfer section, but
    // a transfer is still a new assignment increasing the receiving
    // judge's workload — applying the same cap here avoids silently
    // pushing them over it through a path that skips the manual
    // -assignment capacity check.
    const limit = receiving.projectLimitOverride ?? event.maxProjectsPerJudge;
    const receivingCount = await this.prisma.judgeAssignment.count({
      where: { judgeId: dto.toJudgeId, status: { in: ACTIVE_STATUSES } },
    });
    if (receivingCount + 1 > limit) {
      throw new BadRequestException({
        code: 'JUDGE_OVER_CAPACITY',
        message: 'Transferring would exceed the receiving judge\'s maxProjectsPerJudge.',
      });
    }

    const [, , newAssignment] = await this.prisma.$transaction([
      this.prisma.judgeAssignment.update({
        where: { id: original.id },
        data: { status: 'TRANSFERRED' },
      }),
      this.prisma.judgeReliabilityNote.create({
        data: {
          judgeUserId: original.judgeId,
          eventId,
          authorUserId: actingUserId,
          remark: dto.remark,
        },
      }),
      this.prisma.judgeAssignment.create({
        data: {
          eventId,
          judgeId: dto.toJudgeId,
          submissionId: original.submissionId,
          assignmentMethod: 'MANUAL',
          transferredFromAssignmentId: original.id,
        },
      }),
    ]);

    await this.audit.record(actingUserId, 'ASSIGNMENT_TRANSFERRED', {
      eventId,
      originalAssignmentId: original.id,
      fromJudgeId: original.judgeId,
      toJudgeId: dto.toJudgeId,
      submissionId: original.submissionId,
    });

    return newAssignment;
  }

  // Judge-facing: what has *this* judge been assigned, on this event.
  // Not gated on APPROVED/etc. filtering beyond what's already true of
  // any row in this table — a judge only ever sees their own queue,
  // never other judges' assignments or identities.
  async listMine(eventId: string, judgeUserId: string) {
    return this.prisma.judgeAssignment.findMany({
      where: { eventId, judgeId: judgeUserId },
      include: { submission: { select: { id: true, title: true } } },
      orderBy: { assignedAt: 'asc' },
    });
  }

  // Section 6, docs/stages/07-judge-assignment.md's sibling module —
  // actually specified in Module 8 Section 6 (live progress dashboard):
  // per-judge total/COMPLETED/IN_PROGRESS/PENDING, always computed live
  // from the current table state, never cached. Includes every
  // ACCEPTED judge on the event, even one with zero assignments so far
  // — an organizer needs to see who hasn't been given any work yet,
  // not just how the ones with work are doing.
  async progress(eventId: string) {
    await this.getEventOrThrow(eventId);

    const [judgeMemberships, assignments] = await Promise.all([
      this.prisma.eventMembership.findMany({
        where: { eventId, role: 'JUDGE', invitationStatus: 'ACCEPTED' },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      }),
      this.prisma.judgeAssignment.findMany({
        where: { eventId, status: { in: ACTIVE_STATUSES } },
        select: { judgeId: true, status: true },
      }),
    ]);

    return judgeMemberships.map((jm) => {
      const own = assignments.filter((a) => a.judgeId === jm.userId);
      return {
        judgeId: jm.userId,
        displayName: jm.user.displayName,
        email: jm.user.email,
        total: own.length,
        completed: own.filter((a) => a.status === 'COMPLETED').length,
        inProgress: own.filter((a) => a.status === 'IN_PROGRESS').length,
        pending: own.filter((a) => a.status === 'PENDING').length,
      };
    });
  }

  private async getEventOrThrow(eventId: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
    }
    return event;
  }

  private async getApprovedSubmissionOrThrow(eventId: string, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { verification: true },
    });
    if (!submission || submission.eventId !== eventId) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'No such submission on this event.',
      });
    }
    // Structural gate (Section 2) — checked here, at the point of
    // action, not just by filtering what the picker displays.
    if (submission.verification?.finalDecision !== 'APPROVED') {
      throw new BadRequestException({
        code: 'SUBMISSION_NOT_APPROVED',
        message: 'Only finalDecision: APPROVED submissions can be assigned to a judge.',
      });
    }
    return submission;
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
