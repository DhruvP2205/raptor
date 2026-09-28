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
}
