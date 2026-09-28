import { Body, Controller, Post } from '@nestjs/common';
import { RenderMarkdownDto } from './dto/render-markdown.dto';
import { MarkdownService } from './markdown.service';

// Not named in the stage doc, but required by its own wording: preview
// must go "through the identical code path" as production rendering
// (Section 6, docs/stages/03-event-management.md). Since sanitization
// lives server-side (MarkdownService), a client-side preview has to
// call back to this same render path rather than reimplementing it —
// this endpoint is that call.
@Controller('markdown')
export class MarkdownController {
  constructor(private readonly markdown: MarkdownService) {}

  @Post('preview')
  preview(@Body() dto: RenderMarkdownDto) {
    return { html: this.markdown.renderToSafeHtml(dto.source) };
  }
}
