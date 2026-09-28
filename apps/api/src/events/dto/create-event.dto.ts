import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  // Optional — auto-generated from name (slugified) if omitted. See
  // D68 in docs/DECISIONS.md.
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug may only contain lowercase letters, numbers, and hyphens',
  })
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsISO8601()
  registrationOpensAt!: string;

  @IsISO8601()
  registrationClosesAt!: string;

  @IsISO8601()
  eventStartsAt!: string;

  @IsISO8601()
  submissionsOpenAt!: string;

  @IsISO8601()
  submissionsCloseAt!: string;

  @IsISO8601()
  eventEndsAt!: string;

  @IsISO8601()
  resultsAnnounceAt!: string;

  @IsISO8601()
  votingOpensAt!: string;

  @IsISO8601()
  votingClosesAt!: string;

  @IsISO8601()
  votingWinnerAnnounceAt!: string;
}
