import { IsString, MinLength } from 'class-validator';

// Section 4, docs/stages/12-certificates.md — sanitized on upload
// (D36) by CertificateTemplatesService, not here; this DTO only
// validates shape/presence.
export class UpsertCertificateTemplateDto {
  @IsString()
  @MinLength(1)
  svgMarkup!: string;
}
