import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CheckStatus, FinalDecision } from '@prisma/client';

// Three scopes, matching Section 2/7's trigger and re-run scopes
// exactly (D101 in docs/DECISIONS.md) — one endpoint, one DTO, the
// `scope` discriminator picks which of the other fields matter.
export class VerificationFilterDto {
  @IsOptional()
  @IsArray()
  @IsEnum(CheckStatus, { each: true })
  checkStatus?: CheckStatus[];

  @IsOptional()
  @IsArray()
  @IsEnum(FinalDecision, { each: true })
  finalDecision?: FinalDecision[];
}

export class TriggerVerificationDto {
  @IsIn(['ALL', 'FILTER', 'TARGETED'])
  scope!: 'ALL' | 'FILTER' | 'TARGETED';

  // ALL scope only. false (default): only submissions never checked
  // (checkStatus NOT_RUN or no verification row yet). true: re-run
  // everything for the event, including already-resolved ones —
  // Section 2's "or: every one, if 're-run all' is explicitly chosen."
  @IsOptional()
  @IsBoolean()
  includeAlreadyChecked?: boolean;

  // FILTER scope only.
  @IsOptional()
  @ValidateNested()
  @Type(() => VerificationFilterDto)
  filter?: VerificationFilterDto;

  // TARGETED scope only.
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  submissionIds?: string[];
}
