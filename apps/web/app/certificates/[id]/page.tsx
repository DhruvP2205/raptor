'use client';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { certificateDownloadUrl, getPublicCertificate } from '@/lib/api';
import type { PublicCertificate } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const ROLE_LABEL: Record<string, string> = {
  PARTICIPANT: 'Participant',
  JUDGE: 'Judge',
  WINNER: 'Winner',
  SPECIAL_AWARD_WINNER: 'Special Award Winner',
};

export default function PublicCertificatePage() {
  const { id } = useParams<{ id: string }>();
  const [certificate, setCertificate] = useState<PublicCertificate | null>(null);
  // Distinguished from "loading" so a bad/guessed UUID renders a plain
  // 404, never a "did you mean..." list (design doc Section 2 —
  // avoiding the exact enumeration risk the UUID scheme exists to
  // prevent).
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getPublicCertificate(id)
      .then(setCertificate)
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <Container className="py-16">
        <p className="text-sm text-ink-muted">Not found.</p>
      </Container>
    );
  }
  if (!certificate) return <PageSpinner />;

  const roleLabel = ROLE_LABEL[certificate.role] ?? certificate.role;

  return (
    <Container className="py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div
          className="w-full overflow-hidden rounded border border-line [&_svg]:h-auto [&_svg]:w-full"
          // Server-rendered from a sanitized template + escaped, frozen
          // payload facts (never user-editable at view time) — same
          // trust boundary as descriptionHtml elsewhere in this app.
          dangerouslySetInnerHTML={{ __html: certificate.svg }}
        />

        <Card>
          {certificate.verified ? (
            <Alert tone="success">Verified ✓</Alert>
          ) : (
            <Alert tone="danger">
              This certificate&apos;s signature doesn&apos;t match its data — it may have been tampered with.
            </Alert>
          )}

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-faint">Recipient</dt>
              <dd className="text-ink">{certificate.recipientName}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">Event</dt>
              <dd className="text-ink">{certificate.eventName}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">Role</dt>
              <dd>
                <Badge tone="accent">{roleLabel}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">Issued</dt>
              <dd className="text-ink">{certificate.issuedDate}</dd>
            </div>
            {certificate.projectName && (
              <div>
                <dt className="text-xs text-ink-faint">Project</dt>
                <dd className="text-ink">{certificate.projectName}</dd>
              </div>
            )}
            {certificate.teamName && (
              <div>
                <dt className="text-xs text-ink-faint">Team</dt>
                <dd className="text-ink">{certificate.teamName}</dd>
              </div>
            )}
          </dl>

          <div className="mt-5">
            {certificate.canDownload ? (
              <a href={certificateDownloadUrl(certificate.certificateId)}>
                <Button size="sm">Download PDF</Button>
              </a>
            ) : (
              <div>
                <Button size="sm" disabled>
                  Download PDF
                </Button>
                <p className="mt-1.5 text-xs text-ink-muted">
                  Only the recipient or an event organizer can download this.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </Container>
  );
}
