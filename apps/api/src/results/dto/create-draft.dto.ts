import { IsIn, IsOptional, IsString } from 'class-validator';

// Section 2, docs/stages/10-results-and-rankings.md — normalizationRunId
// defaults to the most recent run for the event when omitted (organizer
// can pick a different one instead). publishMode defaults to MANUAL
// (the schema's own default) when omitted.
export class CreateDraftDto {
  @IsOptional()
  @IsString()
  normalizationRunId?: string;

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'])
  publishMode?: 'AUTO' | 'MANUAL';
}
