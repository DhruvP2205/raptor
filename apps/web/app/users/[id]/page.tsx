'use client';

import { Badge } from '@/components/ui/Badge';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { getUserCertificateGallery } from '@/lib/api';
import type { GalleryCertificate } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const ROLE_LABEL: Record<string, string> = {
  PARTICIPANT: 'Participant',
  JUDGE: 'Judge',
  WINNER: 'Winner',
  SPECIAL_AWARD_WINNER: 'Special Award Winner',
};

// design/12-certificates.md Section 3 — "reached at any user's profile
// URL, no auth required to view," flagged in that same doc as the seed
// of a future shared profile shell (Module 14's Global Ranking
// drill-down). This is deliberately just the certificate gallery for
// now — nothing else about a user is exposed by this module's backend.
export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [certificates, setCertificates] = useState<GalleryCertificate[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getUserCertificateGallery(id).then(setCertificates).catch(setError);
  }, [id]);

  if (error) {
    return (
      <Container className="py-16">
        <p className="text-sm text-danger">Couldn&apos;t load this profile.</p>
      </Container>
    );
  }
  if (!certificates) return <PageSpinner />;

  const displayName = certificates[0]?.recipientName ?? 'This user';

  return (
    <Container className="py-10">
      <h1 className="mb-1 font-display text-2xl text-ink">{displayName}</h1>
      <p className="mb-6 text-sm text-ink-muted">Certificates</p>

      {certificates.length === 0 ? (
        <EmptyState title="No certificates yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((c) => (
            <Link key={c.certificateId} href={`/certificates/${c.certificateId}`}>
              <Card className="flex h-full flex-col gap-2 transition-colors hover:border-accent-to">
                <p className="font-display text-base text-ink">{c.eventName}</p>
                <Badge tone="accent">{ROLE_LABEL[c.role] ?? c.role}</Badge>
                {c.projectName && <p className="text-sm text-ink-muted">{c.projectName}</p>}
                <p className="mt-auto text-xs text-ink-faint">{c.issuedDate}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
