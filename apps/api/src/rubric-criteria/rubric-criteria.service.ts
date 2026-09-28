import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ReplaceRubricDto } from './dto/replace-rubric.dto';

// Section 2.4, docs/stages/08-rubric-and-scoring.md — default threshold
// (20, i.e. 20% of the 100-point general base), a soft warning, not a
// hard block (Section 11's own open-question note: reversible to a hard
// cap with a one-line change if that's preferred later).
const BONUS_GUARDRAIL_THRESHOLD = 20;

// Module 8 (Rubric & Scoring) — see docs/stages/08-rubric-and-scoring.md
// Section 2. The rubric is replaced as a whole set, atomically, rather
// than edited per-criterion like Track/Prize — SCORING's weightPercent
// values must sum to exactly 100 across the *entire* set (D114), which
// can only be validated against a complete proposed set, never one row
// in isolation.
@Injectable()
export class RubricCriteriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async replace(eventId: string, actingUserId: string, dto: ReplaceRubricDto) {
    const event = await this.getEventOrThrow(eventId);
    this.assertRubricEditable(event);

    const scoring = dto.criteria.filter((c) => c.kind === 'SCORING');
    const bonus = dto.criteria.filter((c) => c.kind === 'BONUS');

    if (scoring.length === 0) {
      throw new BadRequestException({
        code: 'NO_SCORING_CRITERIA',
        message: 'A rubric needs at least one SCORING criterion.',
      });
    }

    // Per-kind shape correctness beyond what @ValidateIf can express on
    // its own — @ValidateIf only skips validation for the wrong kind,
    // it doesn't forbid the field being present at all.
    for (const c of dto.criteria) {
      if (c.kind === 'SCORING' && c.maxPoints !== undefined) {
        throw new BadRequestException({
          code: 'INVALID_CRITERION_SHAPE',
          message: `SCORING criterion "${c.label}" must not have maxPoints.`,
        });
      }
      if (c.kind === 'BONUS' && c.weightPercent !== undefined) {
        throw new BadRequestException({
          code: 'INVALID_CRITERION_SHAPE',
          message: `BONUS criterion "${c.label}" must not have weightPercent.`,
        });
      }
      if (c.kind === 'SPECIAL_AWARD' && (c.weightPercent !== undefined || c.maxPoints !== undefined)) {
        throw new BadRequestException({
          code: 'INVALID_CRITERION_SHAPE',
          message: `SPECIAL_AWARD criterion "${c.label}" must not have weightPercent or maxPoints.`,
        });
      }
    }

    // D114 — must sum to exactly 100, not merely <= 100. Checked against
    // the whole proposed set, which is the entire reason this endpoint
    // replaces all criteria atomically instead of one at a time.
    const weightSum = scoring.reduce((sum, c) => sum + (c.weightPercent ?? 0), 0);
    if (weightSum !== 100) {
      throw new BadRequestException({
        code: 'WEIGHT_SUM_INVALID',
        message: `SCORING criteria's weightPercent values must sum to exactly 100 (currently ${weightSum}).`,
      });
    }

    // Section 2.4 — soft warning + audit-on-override, not a hard block.
    const bonusSum = bonus.reduce((sum, c) => sum + (c.maxPoints ?? 0), 0);
    if (bonusSum > BONUS_GUARDRAIL_THRESHOLD && !dto.acknowledgeBonusOverage) {
      throw new ConflictException({
        code: 'BONUS_GUARDRAIL_ACK_REQUIRED',
        message: `Bonus tracks total ${bonusSum} points, above the recommended threshold of ${BONUS_GUARDRAIL_THRESHOLD}. This may let bonus outweigh actual project quality more than recommended. Resubmit with acknowledgeBonusOverage: true to proceed anyway.`,
        bonusSum,
        threshold: BONUS_GUARDRAIL_THRESHOLD,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Replace-all: existing Score rows cascade-delete with their
      // criterion (schema's onDelete: Cascade) — safe only because
      // assertRubricEditable already refused this call once judging
      // has begun, so no judge has ever been able to score against the
      // criteria being removed here.
      await tx.rubricCriterion.deleteMany({ where: { eventId } });
      const rows = await Promise.all(
        dto.criteria.map((c) =>
          tx.rubricCriterion.create({
            data: {
              eventId,
              kind: c.kind,
              label: c.label,
              description: c.description,
              weightPercent: c.weightPercent ?? null,
              maxPoints: c.maxPoints ?? null,
            },
          }),
        ),
      );
      return rows;
    });

    const metadata: Record<string, unknown> = {
      eventId,
      criterionCount: created.length,
      weightSum,
      bonusSum,
    };
    if (bonusSum > BONUS_GUARDRAIL_THRESHOLD) {
      metadata.bonusGuardrailAcknowledged = true;
      metadata.threshold = BONUS_GUARDRAIL_THRESHOLD;
    }
    await this.audit.record(actingUserId, 'RUBRIC_REPLACED', metadata as never);

    return created;
  }

  private async getEventOrThrow(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'No such event.' });
    }
    return event;
  }

  // Not stated explicitly by the stage doc, but required by the
  // replace-all design above: once judging has started (now() >=
  // eventEndsAt), a judge may already hold Score rows against the
  // current criteria — replacing them out from under an in-progress
  // review would silently destroy real work. Frozen from that point on,
  // same "protect a real record already in use" principle as
  // everything else in this platform (CLAUDE.md principle 4).
  private assertRubricEditable(event: { eventEndsAt: Date }): void {
    if (Date.now() >= event.eventEndsAt.getTime()) {
      throw new BadRequestException({
        code: 'RUBRIC_LOCKED',
        message: 'The rubric can no longer be changed once judging has begun.',
      });
    }
  }
}
