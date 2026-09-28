import { IsString, MaxLength, MinLength } from 'class-validator';

// Section 5, docs/stages/13-comments.md — author-only, no time limit.
export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
