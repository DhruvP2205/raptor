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

  // Lowering this below an already-formed team's current size doesn't
  // retroactively kick anyone — it just blocks future joins. Not
  // addressed by either module's doc; accepted as-is rather than
  // inventing extra validation.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxTeamSize?: number;

  @IsOptional()
  @IsEnum(TrackAttachmentMode)
  trackAttachmentMode?: TrackAttachmentMode;

  // Lowering this below an already-assigned judge's current load
  // doesn't retroactively unassign anything — same "block future, don't
  // retroactively enforce" precedent as maxTeamSize above.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxProjectsPerJudge?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  finalScoreDisplayScale?: number;

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
  judgingClosesAt?: string;

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

  @IsOptional()
  @IsISO8601()
  eventClosedAt?: string;
}
