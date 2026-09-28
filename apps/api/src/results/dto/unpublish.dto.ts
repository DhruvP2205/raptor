import { IsString, MaxLength, MinLength } from 'class-validator';

// Section 5.4 — mandatory reason, same pattern as every other
// consequential action in this platform.
export class UnpublishDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
