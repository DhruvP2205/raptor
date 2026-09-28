import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGithubTokenDto {
  // Admin-facing name only — never the token value itself (Section 5).
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  token!: string;
}
