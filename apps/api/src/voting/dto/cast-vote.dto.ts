import { IsOptional, IsString } from 'class-validator';

// Section 3/5, docs/stages/11-voting.md — single-choice ballot plus the
// two anti-abuse challenges. powChallengeId/powNonce are always
// required (invisible PoW on every vote submission); captcha fields
// are only required when VotingService's adaptive abuse-signal check
// says so (Section 5.1 — "most legitimate voters never see it"), so
// they're optional at the DTO level and checked conditionally in the
// service, not here.
export class CastVoteDto {
  @IsString()
  submissionId!: string;

  @IsString()
  powChallengeId!: string;

  @IsString()
  powNonce!: string;

  @IsOptional()
  @IsString()
  captchaChallengeId?: string;

  @IsOptional()
  @IsString()
  captchaAnswer?: string;
}
