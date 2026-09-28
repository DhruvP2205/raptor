import { sanitizeSvgTemplate } from './svg-template-sanitizer.util';

// Section 4/9, docs/stages/12-certificates.md (D36) — "verified by
// inspecting the stored svgMarkup, not just the rendered output."
describe('sanitizeSvgTemplate', () => {
  it('strips <script> tags and their content entirely', () => {
    const out = sanitizeSvgTemplate('<svg><script>alert(document.cookie)</script><text>{{recipientName}}</text></svg>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
    expect(out).toContain('{{recipientName}}');
  });

  it('strips on* event handler attributes', () => {
    const out = sanitizeSvgTemplate('<svg><rect onload="evil()" onclick="evil2()" width="10" height="10" fill="red"/></svg>');
    expect(out).not.toContain('onload');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('evil');
    expect(out).toContain('fill="red"');
  });

  it('strips <foreignObject> and discards its nested content, not just the tag', () => {
    const out = sanitizeSvgTemplate('<svg><foreignObject><div onclick="evil()">leaked text</div></foreignObject></svg>');
    expect(out).not.toContain('foreignObject');
    expect(out).not.toContain('leaked text');
    expect(out).not.toContain('onclick');
  });

  it('strips <style> and its content (potential @import/url() vector)', () => {
    const out = sanitizeSvgTemplate('<svg><style>@import url(evil.css);</style><text>ok</text></svg>');
    expect(out).not.toContain('style');
    expect(out).not.toContain('evil.css');
  });

  it('strips <use>/<image> and any href/xlink:href entirely (external resource references)', () => {
    const out = sanitizeSvgTemplate('<svg><use xlink:href="http://evil.example/x.svg#y"/><image href="http://evil.example/x.png"/></svg>');
    expect(out).not.toContain('evil.example');
    expect(out).not.toContain('href');
  });

  it('preserves case-sensitive SVG attributes like viewBox', () => {
    const out = sanitizeSvgTemplate('<svg viewBox="0 0 100 100"><text>hi</text></svg>');
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).not.toContain('viewbox=');
  });

  it('preserves all documented placeholder tokens as literal text', () => {
    const tokens = ['{{recipientName}}', '{{eventName}}', '{{role}}', '{{projectName}}', '{{teamName}}', '{{issuedDate}}', '{{certificateId}}', '{{verifyUrl}}'];
    const out = sanitizeSvgTemplate(`<svg><text>${tokens.join(' ')}</text></svg>`);
    for (const token of tokens) {
      expect(out).toContain(token);
    }
  });

  it('escapes rather than breaks on raw & in text content', () => {
    const out = sanitizeSvgTemplate('<svg><text>Alice & Bob</text></svg>');
    expect(out).toContain('&amp;');
  });
});
