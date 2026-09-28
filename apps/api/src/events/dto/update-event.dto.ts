import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Hand-written rather than PartialType(CreateEventDto) — that helper
// lives in @nestjs/mapped-types, a package not otherwise needed in
// this project; not worth a new dependency for this one convenience.
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

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

  @IsOptional()
  @IsISO8601()
  registrationOpensAt?: string;

  @IsOptional()
  @IsISO8601()
  registrationClosesAt?: string;

  @IsOptional()
  @IsISO8601()
  eventStartsAt?: string;

  @IsOptional()
  @IsISO8601()
  submissionsOpenAt?: string;

  @IsOptional()
  @IsISO8601()
  submissionsCloseAt?: string;

  @IsOptional()
  @IsISO8601()
  eventEndsAt?: string;

  @IsOptional()
  @IsISO8601()
  resultsAnnounceAt?: string;

  @IsOptional()
  @IsISO8601()
  votingOpensAt?: string;

  @IsOptional()
  @IsISO8601()
  votingClosesAt?: string;

  @IsOptional()
  @IsISO8601()
  votingWinnerAnnounceAt?: string;
}
