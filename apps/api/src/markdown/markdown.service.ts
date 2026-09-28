import { Injectable } from '@nestjs/common';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

// Explicit, deliberate allowlist — not sanitize-html's defaults,
// extended. Writing it out fully means nothing is inherited by
// accident if a future sanitize-html version changes its defaults.
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'strike', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title'],
};

const md = new MarkdownIt({
  // Raw HTML embedded in markdown source is passed through to
  // sanitizeHtml below rather than escaped-and-displayed — this is
  // what makes "strips raw <script> tags, on* event attributes, and
  // any HTML embedded directly in the markdown source" (Section 6,
  // docs/stages/03-event-management.md) literally true: the dangerous
  // markup disappears, rather than showing up as visible escaped text.
  html: true,
  linkify: true,
  breaks: false,
});

// THE single render path for markdown source anywhere in this
// project (Event.description, Track.description, and whatever else
// adopts markdown later) — called identically from preview and
// production rendering, per Section 6's explicit requirement that the
// two must never diverge into separate implementations.
@Injectable()
export class MarkdownService {
  renderToSafeHtml(source: string): string {
    const rawHtml = md.render(source);
    return sanitizeHtml(rawHtml, {
      allowedTags: ALLOWED_TAGS,
      allowedAttributes: ALLOWED_ATTRIBUTES,
      allowedSchemes: ['http', 'https', 'mailto'],
      disallowedTagsMode: 'discard',
    });
  }
}
