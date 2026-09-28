import { IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

// Every field optional — a draft save can be an effectively empty shell
// (Section 5.1) with no completeness requirement. `submit` (not this
// DTO) is what enforces non-empty required fields.
export class UpdateSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Well-formedness only (Section 2) — no reachability check, no
  // outbound request.
  @IsOptional()
  @IsUrl()
  repoUrl?: string;

  @IsOptional()
  @IsUrl()
  demoVideoUrl?: string;

  @IsOptional()
  @IsUrl()
  liveUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trackIds?: string[];
}
