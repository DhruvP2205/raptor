import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TrackAttachmentMode } from '@prisma/client';

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

  // Module 4's field (Team Management) — see D75 in docs/DECISIONS.md.
  // Admin counts toward the total. Defaults to 4 if omitted.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxTeamSize?: number;

  // Module 5's field (Submission Management) — see D75/D80 in
  // docs/DECISIONS.md for why it lives on CreateEventDto even though
  // Event itself is Module 3's table, same precedent as maxTeamSize.
  // Defaults to NONE if omitted.
  @IsOptional()
  @IsEnum(TrackAttachmentMode)
  trackAttachmentMode?: TrackAttachmentMode;

  // Module 7's field (Judge Assignment) — same additive-field precedent
  // as maxTeamSize/trackAttachmentMode above. Defaults to 20 if omitted.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxProjectsPerJudge?: number;

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
