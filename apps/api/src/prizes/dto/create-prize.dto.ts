import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePrizeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(1)
  rank!: number;

  @IsOptional()
  @IsString()
  trackId?: string;

  @IsIn(['JUDGES', 'PUBLIC_VOTE'])
  decidedBy!: 'JUDGES' | 'PUBLIC_VOTE';

  // Module 14's field (Global Ranking) — optional, no cash value
  // tracked if omitted. See the schema's own comment on Prize.prizeUsd.
  @IsOptional()
  @IsInt()
  @Min(0)
  prizeUsd?: number;
}
