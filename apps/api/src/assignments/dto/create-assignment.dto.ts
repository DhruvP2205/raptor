import { ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';

// Section 3 — one project at a time, one or more judges per call.
export class CreateAssignmentDto {
  @IsString()
  submissionId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  judgeIds!: string[];
}
