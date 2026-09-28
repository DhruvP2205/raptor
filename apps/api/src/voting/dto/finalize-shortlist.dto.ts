import { ArrayMinSize, ArrayUnique, IsArray, IsString } from 'class-validator';

// Section 4, docs/stages/11-voting.md — the organizer's final,
// freely-adjusted set (auto-suggested top N plus any manual
// adds/removes). One atomic bulk-create; VotingService rejects this
// call entirely once the round already has any ShortlistEntry rows
// ("locked once finalized for round 1" — corrections after that point
// go through Section 6's per-entry correction endpoint instead).
export class FinalizeShortlistDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  submissionIds!: string[];
}
