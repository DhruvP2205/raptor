import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

// Section 4.1, docs/stages/08-rubric-and-scoring.md — any subset, at
// any time, no completeness requirement. Range-checking a criterion's
// value against its own kind (SCORING 0-100, BONUS 0-maxPoints,
// SPECIAL_AWARD 0/1) happens in the service, since it depends on data
// (the criterion's kind/maxPoints) this DTO has no way to see.
export class ScoreInputDto {
  @IsString()
  criterionId!: string;

  @IsInt()
  value!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class SaveDraftDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  scores?: ScoreInputDto[];

  @IsOptional()
  @IsString()
  overallFeedback?: string;
}
