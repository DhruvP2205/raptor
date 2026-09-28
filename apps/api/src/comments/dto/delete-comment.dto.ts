import { IsOptional, IsString, MaxLength } from 'class-validator';

// Section 6, docs/stages/13-comments.md — reason is mandatory only for
// a moderation delete (someone other than the comment's own author);
// self-deletion needs none. That distinction is checked in
// CommentsService, which knows who's deleting and who authored it —
// this DTO can't see either, so it stays permissive.
export class DeleteCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
