'use client';

import { RankResultsList, SpecialAwardsList } from '@/components/results/ResultsLists';
import { Alert } from '@/components/ui/Alert';
import { Card, Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { getEvent, getPublicResults } from '@/lib/api';
import type { PublicEvent, PublishedResultVersion } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PublicResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [version, setVersion] = useState<PublishedResultVersion | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        return getPublicResults(e.id);
      })
      .then(setVersion)
      .catch(setError);
  }, [slug]);

  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">This event doesn&apos;t exist, or you don&apos;t have access to it.</Alert>
      </Container>
    );
  }
  if (!event || version === undefined) return <PageSpinner />;

  return (
    <Container className="py-10">
      <div className="mb-6">
        <Link href={`/events/${slug}`} className="text-xs text-ink-muted hover:text-accent">
          ← {event.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">Results</h1>
      </div>

      {/* Section 2's own most important state — a phase reaching
          RESULTS_ANNOUNCED never implies data exists; only a LIVE
          PublishedResultVersion does. Never a countdown here, since the
          organizer controls this manually in MANUAL mode. */}
      {version === null ? (
        <Card>
          <p className="text-sm text-ink-muted">Results haven&apos;t been published yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-3 font-display text-lg text-ink">Ranking</h2>
            <RankResultsList
              rankEntries={version.rankEntries}
              finalScoreDisplayScale={event.finalScoreDisplayScale}
              correctedSubmissionId={version.correctedSubmissionId}
              correctionReason={version.correctionReason}
            />
          </Card>
          {version.specialAwardEntries.length > 0 && (
            <Card>
              <h2 className="mb-3 font-display text-lg text-ink">Special awards</h2>
              <SpecialAwardsList entries={version.specialAwardEntries} />
            </Card>
          )}
        </div>
      )}
    </Container>
  );
}
