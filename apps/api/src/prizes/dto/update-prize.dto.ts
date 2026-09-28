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
}
