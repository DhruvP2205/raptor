import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RubricCriterionKind } from '@prisma/client';

// Section 2, docs/stages/08-rubric-and-scoring.md. weightPercent only
// makes sense for SCORING, maxPoints only for BONUS — @ValidateIf
// checks the sibling `kind` field on this same object.
export class RubricCriterionInputDto {
  @IsEnum(RubricCriterionKind)
  kind!: RubricCriterionKind;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @ValidateIf((o) => o.kind === 'SCORING')
  @IsInt()
  @Min(1)
  @Max(100)
  weightPercent?: number;

  @ValidateIf((o) => o.kind === 'BONUS')
  @IsInt()
  @Min(1)
  maxPoints?: number;
}

// PUT, not POST/PATCH — this replaces the whole rubric atomically
// (Section 2's "defined once"), not per-criterion CRUD like Track/Prize.
// See RubricCriteriaService for why (the SCORING weightPercent-sums-to
// -100 constraint can't be validated one row at a time).
export class ReplaceRubricDto {
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionInputDto)
  @ArrayMinSize(1)
  criteria!: RubricCriterionInputDto[];

  // Section 2.4's "organizer can still proceed past the warning" step —
  // set true on a resubmit after seeing the bonus-guardrail warning
  // response. Absent/false on the first attempt.
  @IsOptional()
  @IsBoolean()
  acknowledgeBonusOverage?: boolean;
}
