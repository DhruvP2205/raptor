import { IsInt, Min } from 'class-validator';

// Section 3, docs/stages/14-global-ranking.md — admin-editable,
// platform-wide, one row per award kind. awardKind itself comes from
// the route param, not the body.
export class UpdatePointsConfigDto {
  @IsInt()
  @Min(0)
  points!: number;
}
