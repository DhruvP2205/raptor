import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { DeleteCommentDto } from './dto/delete-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentRateLimitGuard } from './guards/comment-rate-limit.guard';

// Section 2/6, docs/stages/13-comments.md — reading is mixed access
// (public, but organizer/admin can additionally request soft-deleted
// comments via @OptionalAuth); every mutating route requires a real
// session, enforced by the global SessionAuthGuard default.
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post('submissions/:submissionId/comments')
  @UseGuards(CommentRateLimitGuard)
  create(@Param('submissionId') submissionId: string, @CurrentUser() user: User, @Body() dto: CreateCommentDto) {
    return this.comments.create(submissionId, user.id, dto);
  }

  @Get('submissions/:submissionId/comments')
  @OptionalAuth()
  list(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: User | undefined,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.comments.listForSubmission(submissionId, user ?? null, includeDeleted === 'true');
  }

  @Patch('comments/:commentId')
  update(@Param('commentId') commentId: string, @CurrentUser() user: User, @Body() dto: UpdateCommentDto) {
    return this.comments.update(commentId, user.id, dto);
  }

  @Delete('comments/:commentId')
  remove(@Param('commentId') commentId: string, @CurrentUser() user: User, @Body() dto: DeleteCommentDto) {
    return this.comments.remove(commentId, user, dto.reason);
  }
}
