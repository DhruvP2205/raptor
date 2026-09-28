import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Module 7's mechanics for the two fields Module 2 introduced but left
// unwired ("the mechanics of actually scoping a judge's assignment by
// track are explicitly out of scope until judge assignment") — see
// docs/stages/07-judge-assignment.md Sections 4/7.
export class UpdateJudgeMembershipDto {
  // Empty array = all tracks (Section 4). Track-id membership in this
  // event is validated in the service, same as Submission.trackIds.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trackIds?: string[];

  // null explicitly clears the override, reverting to Event.
  // maxProjectsPerJudge — @IsOptional lets the field be entirely absent
  // (no change) while still accepting an explicit null (clear it).
  @IsOptional()
  @IsInt()
  @Min(0)
  projectLimitOverride?: number | null;
}
