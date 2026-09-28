import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

// Section 7, docs/stages/10-results-and-rankings.md — three distinct
// correction types, each a single, narrow override; `reason` is
// mandatory for all three, same non-negotiable pattern as
// disqualification (Module 6), bans, and voting-round restarts.
export class CreateCorrectionDto {
  @IsIn(['DISQUALIFY', 'REORDER', 'SCORE_OVERRIDE'])
  type!: 'DISQUALIFY' | 'REORDER' | 'SCORE_OVERRIDE';

  @IsString()
  submissionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @ValidateIf((o) => o.type === 'REORDER')
  @IsInt()
  @Min(1)
  newRank?: number;

  @ValidateIf((o) => o.type === 'SCORE_OVERRIDE')
  @IsNumber()
  displayScore?: number;
}
