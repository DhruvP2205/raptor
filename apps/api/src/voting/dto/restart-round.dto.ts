import { IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

// Section 7, docs/stages/11-voting.md — a full restart gets fresh
// organizer-set timeline values at creation time (never pre-populated
// from the dead round), plus a mandatory, non-empty reason, same
// pattern as every other consequential action in this platform.
export class RestartRoundDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @IsISO8601()
  votingOpensAt!: string;

  @IsISO8601()
  votingClosesAt!: string;

  @IsISO8601()
  votingWinnerAnnounceAt!: string;
}
