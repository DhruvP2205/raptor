'use client';

import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { generateMyCertificates, getEvent, listMyCertificates } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { Certificate, PublicEvent } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const ROLE_LABEL: Record<string, string> = {
  PARTICIPANT: 'Participant',
  JUDGE: 'Judge',
  WINNER: 'Winner',
  SPECIAL_AWARD_WINNER: 'Special Award Winner',
};

export default function MyCertificatesPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [certificates, setCertificates] = useState<Certificate[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then(async (e) => {
        setEvent(e);
        return listMyCertificates(e.id);
      })
      .then(setCertificates)
      .catch(setError);
  }, [ready, slug]);

  async function handleGenerate() {
    if (!event) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateMyCertificates(event.id);
      setCertificates(result);
      setAttempted(true);
    } catch (err) {
      setGenerateError(err);
    } finally {
      setGenerating(false);
    }
  }

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">This event doesn&apos;t exist, or you don&apos;t have access to it.</Alert>
      </Container>
    );
  }
  if (!event || !certificates) return <PageSpinner />;

  return (
    <Container className="py-10">
      <div className="mb-6">
        <Link href={`/events/${slug}`} className="text-xs text-ink-muted hover:text-accent">
          ← {event.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">My certificates</h1>
      </div>

      {!event.certificatesEnabled ? (
        <Alert tone="neutral">Certificates aren&apos;t available for this event yet.</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <ApiErrorAlert error={generateError} />
          <div>
            <Button size="sm" loading={generating} onClick={handleGenerate}>
              Get my certificate
            </Button>
          </div>

          {certificates.length === 0 ? (
            attempted && (
              <EmptyState title="You don't have any certificates for this event." />
            )
          ) : (
            <ul className="flex flex-col gap-2">
              {certificates.map((c) => (
                <li key={c.id}>
                  <Link href={`/certificates/${c.id}`}>
                    <Card className="flex items-center justify-between transition-colors hover:border-accent-to">
                      <span className="font-medium text-ink">{event.name}</span>
                      <Badge tone="accent">{ROLE_LABEL[c.role] ?? c.role}</Badge>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Container>
  );
}
