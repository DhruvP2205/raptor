import { Equals, IsBoolean } from 'class-validator';

// Section 9, docs/stages/11-voting.md — reuses Module 10's confirm:true
// pattern for a consequential publish action.
export class PublishVotingResultsDto {
  @IsBoolean()
  @Equals(true)
  confirm!: boolean;
}
