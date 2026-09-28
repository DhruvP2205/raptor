import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Section 5.3, docs/stages/11-voting.md — admin review of a flagged
// IP/account pattern. Never automatic (D47); this is the one endpoint
// that actually acts on a flag. A BAN is by email (blocks
// re-registration too, D48) and requires a reason for the same
// audit-trail reasons as every other consequential action here.
// banUserIds lets the reviewer ban a subset of implicatedUserIds rather
// than forcing all-or-nothing — not stated explicitly by the doc, but a
// flagged IP can easily implicate an innocent account sharing a campus
// NAT alongside a genuinely abusive one; defaults to every implicated
// user if omitted.
export class ReviewAbuseFlagDto {
  @IsIn(['CLEAR', 'BAN'])
  action!: 'CLEAR' | 'BAN';

  @ValidateIf((o) => o.action === 'BAN')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  banReason?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  banUserIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  clearNote?: string;
}
