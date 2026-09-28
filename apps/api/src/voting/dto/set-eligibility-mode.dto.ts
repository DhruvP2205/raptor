import { IsEnum } from 'class-validator';
import { VotingEligibilityMode } from '@prisma/client';

// Section 2, docs/stages/11-voting.md — organizer-chosen once, at the
// event level. VotingService rejects this once round 1 already exists
// (D43 — "not re-configurable per round," a policy choice, not
// something expected to change mid-event).
export class SetEligibilityModeDto {
  @IsEnum(VotingEligibilityMode)
  mode!: VotingEligibilityMode;
}
