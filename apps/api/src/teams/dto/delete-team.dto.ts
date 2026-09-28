import { Equals, IsBoolean } from 'class-validator';

// Confirmation step required before an irreversible, destructive action
// — same mechanism as Module 2's staff-account creation, which this
// stage's doc explicitly cross-references by name (Section 7).
export class DeleteTeamDto {
  @IsBoolean()
  @Equals(true)
  confirm!: boolean;
}
