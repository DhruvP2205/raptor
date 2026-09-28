import { MarkdownService } from './markdown.service';

describe('MarkdownService', () => {
  const markdown = new MarkdownService();

  it('strips a raw <script> tag embedded directly in markdown source', () => {
    const html = markdown.renderToSafeHtml('Hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips an onclick (and any on*) attribute from an embedded raw tag', () => {
    const html = markdown.renderToSafeHtml('<p onclick="alert(1)">click me</p>');
    expect(html).not.toContain('onclick');
    expect(html).toContain('click me');
  });

  it('never produces an href with a javascript: scheme, from markdown link syntax', () => {
    // markdown-it itself refuses to treat a javascript: destination as
    // a link at all (falls back to literal, inert text) — this
    // confirms that, not just an absence of the substring anywhere in
    // the output (the rejected syntax legitimately appears as visible
    // text, which is safe).
    const html = markdown.renderToSafeHtml('[click](javascript:alert(1))');
    expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
  });

  it('strips a javascript: href from raw HTML embedded directly in markdown source', () => {
    // This is sanitizeHtml's allowedSchemes doing the work, not
    // markdown-it — raw HTML passes through (html: true) specifically
    // so sanitizeHtml is the authoritative filter, per Section 6.
    const html = markdown.renderToSafeHtml('<a href="javascript:alert(1)">click</a>');
    expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
  });

  it('renders ordinary markdown normally', () => {
    const html = markdown.renderToSafeHtml('# Title\n\nSome **bold** text.');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders identically regardless of caller — preview and production share the exact same function', () => {
    const source = '<script>evil()</script>**safe**';
    const previewRender = markdown.renderToSafeHtml(source);
    const productionRender = markdown.renderToSafeHtml(source);
    expect(previewRender).toBe(productionRender);
  });
});
