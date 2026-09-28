import sanitizeHtml from 'sanitize-html';

// Section 4, docs/stages/12-certificates.md (D36) — strips <script>,
// on* event attributes, <foreignObject>, and external resource
// references, via a real parser (htmlparser2, underneath
// sanitize-html — already a dependency, used the same way
// MarkdownService uses it for Event/Track descriptions), never
// string/regex replacement. Explicit allowlists throughout: nothing is
// permitted by omission.
//
// `<style>`, `<use>`, and `<image>` are deliberately excluded entirely
// (not just their dangerous attributes) — none are needed to satisfy
// this stage's placeholder-token template model, and each is a
// plausible vector for exactly the kind of external-reference/script
// -adjacent risk this function exists to close (an <image href> or
// <use xlink:href> pointing off-platform, a <style> block with
// @import/url()).
const ALLOWED_TAGS = [
  'svg', 'g', 'defs', 'title', 'desc',
  'text', 'tspan',
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path',
  'linearGradient', 'radialGradient', 'stop', 'clipPath',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': [
    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'viewBox',
    'preserveAspectRatio', 'xmlns',
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'transform',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'letter-spacing', 'text-anchor', 'dominant-baseline',
    'offset', 'stop-color', 'stop-opacity',
    'gradientUnits', 'gradientTransform', 'clipPathUnits',
    'id',
  ],
};

// Case-sensitive SVG attributes (viewBox, preserveAspectRatio,
// gradientUnits, etc.) would otherwise be silently lower-cased by
// sanitize-html's default HTML-oriented parser, breaking any template
// that relies on them.
const PARSER_OPTIONS = { lowerCaseTags: false, lowerCaseAttributeNames: false };

export function sanitizeSvgTemplate(rawSvgMarkup: string): string {
  return sanitizeHtml(rawSvgMarkup, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
    // Discard the CONTENT of these, not just the tag — a <script> or
    // <foreignObject> stripped down to its inner text would otherwise
    // leak that text (or nested markup, re-escaped) into the output.
    nonTextTags: ['script', 'style', 'foreignObject', 'iframe', 'textarea', 'option'],
    parser: PARSER_OPTIONS,
  });
}
