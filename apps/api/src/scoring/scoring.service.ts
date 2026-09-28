import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { RubricCriterion } from '@prisma/client';
import { CalibrationService } from '../calibration/calibration.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SaveDraftDto } from './dto/save-draft.dto';

// Module 8 (Rubric & Scoring) — see docs/stages/08-rubric-and-scoring.md
// Section 4. Judge-owned: not nested under /events/:eventId (mirrors
// Module 5's /submissions/:id precedent, D78) — the assignment id alone
// resolves everything; ownership is checked here, not via EventRoleGuard.
@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calibration: CalibrationService,
  ) {}

  async getForScoring(assignmentId: string, userId: string) {
    const assignment = await this.getOwnedAssignmentOrThrow(assignmentId, userId);
    const [criteria, scores, review] = await Promise.all([
      this.prisma.rubricCriterion.findMany({ where: { eventId: assignment.eventId } }),
      this.prisma.score.findMany({ where: { judgeAssignmentId: assignmentId } }),
      this.prisma.judgeReview.findUnique({ where: { judgeAssignmentId: assignmentId } }),
    ]);
    return {
      assignmentId: assignment.id,
      status: assignment.status,
      submissionId: assignment.submissionId,
      criteria,
      scores,
      overallFeedback: review?.overallFeedback ?? null,
      revisionCount: review?.revisionCount ?? 0,
    };
  }

  // Section 4.1 — any subset, any time, no completeness requirement.
  // Never writes a ScoreRevision (D111) — only submitReview does.
  async saveDraft(assignmentId: string, userId: string, dto: SaveDraftDto) {
    const assignment = await this.getOwnedAssignmentOrThrow(assignmentId, userId);
    await this.assertJudgingStillOpen(assignment.eventId);

    if (dto.scores?.length) {
      const criteria = await this.prisma.rubricCriterion.findMany({
        where: { eventId: assignment.eventId, id: { in: dto.scores.map((s) => s.criterionId) } },
      });
      const byId = new Map(criteria.map((c) => [c.id, c]));

      for (const input of dto.scores) {
        const criterion = byId.get(input.criterionId);
        if (!criterion) {
          throw new BadRequestException({
            code: 'CRITERION_NOT_ON_EVENT',
            message: `Criterion ${input.criterionId} does not belong to this event's rubric.`,
          });
        }
        this.assertValueInRange(criterion, input.value);
      }

      await this.prisma.$transaction(
        dto.scores.map((input) =>
          this.prisma.score.upsert({
            where: { judgeAssignmentId_criterionId: { judgeAssignmentId: assignmentId, criterionId: input.criterionId } },
            create: {
              judgeAssignmentId: assignmentId,
              criterionId: input.criterionId,
              value: input.value,
              note: input.note ?? null,
            },
            update: { value: input.value, note: input.note ?? null },
          }),
        ),
      );
    }

    if (dto.overallFeedback !== undefined) {
      // Draft save touches only overallFeedback — submittedAt/
      // revisionCount are exclusively submitReview's concern (Section
      // 4.1's "draft saves do not create a revision-history entry").
      await this.prisma.judgeReview.upsert({
        where: { judgeAssignmentId: assignmentId },
        create: { judgeAssignmentId: assignmentId, overallFeedback: dto.overallFeedback, submittedAt: new Date() },
        update: { overallFeedback: dto.overallFeedback },
      });
    }

    return this.getForScoring(assignmentId, userId);
  }

  // Section 4.2 — validates against whatever is currently persisted
  // (from prior draft saves), same "no request body, just finalize
  // current state" shape as Submission.submit() (Module 5). Can be
  // called again after COMPLETED, any number of times, until
  // judgingClosesAt (Section 4.2/4.3) — the assignment-ownership lock
  // (Module 7, D106) is a completely separate property from this
  // content mutability.
  async submitReview(assignmentId: string, userId: string) {
    const assignment = await this.getOwnedAssignmentOrThrow(assignmentId, userId);
    await this.assertJudgingStillOpen(assignment.eventId);

    const [criteria, scores, review] = await Promise.all([
      this.prisma.rubricCriterion.findMany({ where: { eventId: assignment.eventId } }),
      this.prisma.score.findMany({ where: { judgeAssignmentId: assignmentId } }),
      this.prisma.judgeReview.findUnique({ where: { judgeAssignmentId: assignmentId } }),
    ]);

    const scoredCriterionIds = new Set(scores.map((s) => s.criterionId));
    const missingScoring = criteria.filter((c) => c.kind === 'SCORING' && !scoredCriterionIds.has(c.id));
    const missing: string[] = missingScoring.map((c) => `criterion:${c.id}`);
    if (!review || !review.overallFeedback.trim()) {
      missing.push('overallFeedback');
    }
    if (missing.length > 0 || !review) {
      throw new BadRequestException({
        code: 'INCOMPLETE_REVIEW',
        message: `Cannot submit — missing required field(s): ${missing.join(', ')}.`,
        fields: missing,
      });
    }

    const now = new Date();
    const nextRevisionNumber = (review.revisionCount ?? 0) + 1;

    await this.prisma.$transaction([
      this.prisma.judgeReview.update({
        where: { judgeAssignmentId: assignmentId },
        data: { submittedAt: now, revisionCount: nextRevisionNumber },
      }),
      this.prisma.scoreRevision.create({
        data: {
          judgeAssignmentId: assignmentId,
          revisionNumber: nextRevisionNumber,
          scoresSnapshotJson: scores.map((s) => ({ criterionId: s.criterionId, value: s.value, note: s.note })) as never,
          overallFeedbackSnapshot: review.overallFeedback,
          submittedAt: now,
        },
      }),
      this.prisma.judgeAssignment.update({
        where: { id: assignmentId },
        data: {
          status: 'COMPLETED',
          // completedAt stamped only on the first submit (Section 4.2)
          // — never overwritten on a later resubmit.
          ...(assignment.completedAt ? {} : { completedAt: now }),
        },
      }),
    ]);

    // Module 9 (Normalization) — recomputed after *every* submit-review,
    // first submit or resubmit (D110/D111), across this judge's full
    // history, not just this event. Runs after the transaction commits;
    // this is a derived-profile refresh, not part of the atomic write
    // itself.
    await this.calibration.recompute(assignment.judgeId);

    return this.getForScoring(assignmentId, userId);
  }

  private async getOwnedAssignmentOrThrow(assignmentId: string, userId: string) {
    const assignment = await this.prisma.judgeAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) {
      throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND', message: 'No such assignment.' });
    }
    if (assignment.judgeId !== userId) {
      throw new ForbiddenException({
        code: 'NOT_ASSIGNMENT_OWNER',
        message: 'Only the assigned judge can score this assignment.',
      });
    }
    return assignment;
  }

  // Server time only, on every write (CLAUDE.md principle 2) — same
  // deadline-enforcement shape as every other timestamp boundary in
  // this platform.
  private async assertJudgingStillOpen(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    if (Date.now() > event.judgingClosesAt.getTime()) {
      throw new BadRequestException({
        code: 'JUDGING_CLOSED',
        message: 'The judging window for this event has closed.',
      });
    }
  }

  private assertValueInRange(criterion: RubricCriterion, value: number): void {
    if (criterion.kind === 'SCORING' && (value < 0 || value > 100)) {
      throw new BadRequestException({
        code: 'VALUE_OUT_OF_RANGE',
        message: `"${criterion.label}" must be scored 0-100.`,
      });
    }
    if (criterion.kind === 'BONUS' && (value < 0 || value > (criterion.maxPoints ?? 0))) {
      throw new BadRequestException({
        code: 'VALUE_OUT_OF_RANGE',
        message: `"${criterion.label}" must be scored 0-${criterion.maxPoints}.`,
      });
    }
    if (criterion.kind === 'SPECIAL_AWARD' && value !== 0 && value !== 1) {
      throw new BadRequestException({
        code: 'VALUE_OUT_OF_RANGE',
        message: `"${criterion.label}" is a nomination flag — value must be 0 or 1.`,
      });
    }
  }
}
