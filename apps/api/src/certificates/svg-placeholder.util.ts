// Section 4, docs/stages/12-certificates.md — plain-text placeholder
// tokens (`{{recipientName}}`, `{{eventName}}`, etc.) substituted into
// an already-sanitized template at render time.
export interface CertificatePlaceholders {
  recipientName: string;
  eventName: string;
  role: string;
  projectName: string | null;
  teamName: string | null;
  issuedDate: string;
  certificateId: string;
  verifyUrl: string;
}

// Every value here can originate from user-controlled input
// (User.displayName, Submission.title, Team.name) — XML-escaped before
// substitution so a name like `<script>` or `Foo & Bar` can never break
// out of the surrounding SVG text node. This is the same class of risk
// docs/stages/11-voting.md's zerodepshack.com regression test warns
// about, one level down: identity is bound correctly (Section 2), but
// the bound name still has to be rendered safely.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const TOKEN_KEYS: (keyof CertificatePlaceholders)[] = [
  'recipientName', 'eventName', 'role', 'projectName', 'teamName',
  'issuedDate', 'certificateId', 'verifyUrl',
];

export function renderSvgFromTemplate(svgMarkup: string, values: CertificatePlaceholders): string {
  let output = svgMarkup;
  for (const key of TOKEN_KEYS) {
    const value = values[key] ?? '';
    output = output.split(`{{${key}}}`).join(escapeXml(value));
  }
  return output;
}
