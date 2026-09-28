import { IsString, MaxLength, MinLength } from 'class-validator';

// Section 5 — the remark is mandatory (it's what actually lands on the
// original judge's User profile), unlike Module 6's APPROVED override
// where a remark is optional. There's no "no-remark" transfer path.
export class TransferAssignmentDto {
  @IsString()
  toJudgeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  remark!: string;
}
