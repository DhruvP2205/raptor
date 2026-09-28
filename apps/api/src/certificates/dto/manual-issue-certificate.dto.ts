import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { CertificateRole } from '@prisma/client';

// Section 2.2, docs/stages/12-certificates.md — the organizer/admin
// override for a case automatic issuance excludes (a disqualified
// submission's participants) or otherwise doesn't cover. Mandatory
// reason, fully audit-logged, same pattern as every other manual
// override in this platform.
export class ManualIssueCertificateDto {
  @IsString()
  userId!: string;

  @IsEnum(CertificateRole)
  role!: CertificateRole;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
