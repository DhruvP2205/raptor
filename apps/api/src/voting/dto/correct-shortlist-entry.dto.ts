import { IsString, MaxLength, MinLength } from 'class-validator';

// Section 6, docs/stages/11-voting.md — a minor in-place correction
// (here: fixing a wrong-project swap on a shortlist entry). Zero effect
// on Vote rows or the tally — VotingService only ever updates
// ShortlistEntry.submissionId, never touches already-cast votes.
// Mandatory reason, fully audit-logged, same as every other correction
// in this platform.
export class CorrectShortlistEntryDto {
  @IsString()
  newSubmissionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
