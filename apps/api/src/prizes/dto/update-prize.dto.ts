import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdatePrizeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rank?: number;

  // Explicit null clears the track association (prize no longer tied
  // to a specific track); omitted leaves it unchanged.
  @IsOptional()
  @IsString()
  trackId?: string | null;

  @IsOptional()
  @IsIn(['JUDGES', 'PUBLIC_VOTE'])
  decidedBy?: 'JUDGES' | 'PUBLIC_VOTE';

  // Explicit null clears a previously-set value; omitted leaves it
  // unchanged — same convention as trackId above.
  @IsOptional()
  @IsInt()
  @Min(0)
  prizeUsd?: number | null;
}
