import { renderSvgFromTemplate } from './svg-placeholder.util';

const BASE_VALUES = {
  recipientName: 'Ada Lovelace',
  eventName: 'Test Hack',
  role: 'PARTICIPANT',
  projectName: 'Analytical Engine',
  teamName: null,
  issuedDate: '2026-09-15',
  certificateId: 'cert-1',
  verifyUrl: 'http://localhost:3000/certificates/cert-1',
};

describe('renderSvgFromTemplate', () => {
  it('substitutes every placeholder token', () => {
    const template = '<svg><text>{{recipientName}} - {{eventName}} - {{role}}</text></svg>';
    const out = renderSvgFromTemplate(template, BASE_VALUES);
    expect(out).toBe('<svg><text>Ada Lovelace - Test Hack - PARTICIPANT</text></svg>');
  });

  it('XML-escapes a user-controlled value that contains markup, so it cannot break out of the SVG text node', () => {
    const template = '<svg><text>{{recipientName}}</text></svg>';
    const out = renderSvgFromTemplate(template, { ...BASE_VALUES, recipientName: '</text><script>alert(1)</script>' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;/text&gt;&lt;script&gt;');
  });

  it('renders null teamName/projectName as empty string, not the literal "null"', () => {
    const template = '<svg><text>{{teamName}}</text></svg>';
    const out = renderSvgFromTemplate(template, { ...BASE_VALUES, teamName: null });
    expect(out).toBe('<svg><text></text></svg>');
  });

  it('escapes ampersands and quotes', () => {
    const template = '<svg><text>{{recipientName}}</text></svg>';
    const out = renderSvgFromTemplate(template, { ...BASE_VALUES, recipientName: `Bob & "Alice's" Co` });
    expect(out).toBe('<svg><text>Bob &amp; &quot;Alice&apos;s&quot; Co</text></svg>');
  });
});
