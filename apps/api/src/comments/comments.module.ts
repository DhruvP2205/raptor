import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentRateLimitGuard } from './guards/comment-rate-limit.guard';

@Module({
  controllers: [CommentsController],
  providers: [CommentsService, CommentRateLimitGuard],
})
export class CommentsModule {}
