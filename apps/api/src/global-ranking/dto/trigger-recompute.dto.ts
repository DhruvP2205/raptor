import { IsOptional, IsString, MaxLength } from 'class-validator';

// Section 6, docs/stages/14-global-ranking.md — a manual admin
// recompute, distinct from the automatic result-publish trigger
// (GlobalRankingSnapshot.triggerReason is null for the latter).
export class TriggerRecomputeDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
