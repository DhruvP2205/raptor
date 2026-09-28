import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

// Section 9, docs/stages/11-voting.md: "Post-publish correction
// (disqualify a winner, adjust which submission is credited)... same
// rules apply" as Module 10, Section 7. Two narrow types, mirroring
// that module's CreateCorrectionDto shape: DISQUALIFY (excludes an
// entry going forward) and REASSIGN_CREDIT ("adjust which submission
// is credited" — e.g. a duplicate/mis-tagged project's votes need to be
// attributed to the correct submission).
export class CreateVotingCorrectionDto {
  @IsIn(['DISQUALIFY', 'REASSIGN_CREDIT'])
  type!: 'DISQUALIFY' | 'REASSIGN_CREDIT';

  @IsString()
  submissionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @ValidateIf((o) => o.type === 'REASSIGN_CREDIT')
  @IsString()
  newSubmissionId?: string;
}
