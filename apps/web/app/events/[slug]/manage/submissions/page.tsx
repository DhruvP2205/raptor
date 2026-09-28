'use client';

import { ManageNav } from '@/components/events/ManageNav';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { formatDateTime } from '@/lib/format';
import { getEvent, listDraftsInProgress, listSubmittedForEvent } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { DraftInProgressSummary, PublicEvent, Submission } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ManageSubmissionsPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [submitted, setSubmitted] = useState<Submission[] | null>(null);
  const [drafts, setDrafts] = useState<DraftInProgressSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then(async (e) => {
        setEvent(e);
        const submittedList = await listSubmittedForEvent(e.id);
        setSubmitted(submittedList);
        if (user?.siteAdmin) {
          setDrafts(await listDraftsInProgress(e.id));
        }
      })
      .catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, slug]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load submissions — you may not be this event&apos;s organizer.</Alert>
      </Container>
    );
  }
  if (!event || !submitted) return <PageSpinner />;

  return (
    <Container className="py-10">
      <ManageNav slug={slug} />
      <h1 className="mb-2 font-display text-2xl text-ink">{event.name} — submissions</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Organizers only see finalized submissions — drafts in progress are invisible here, by
        design.
      </p>

      {submitted.length === 0 ? (
        <EmptyState title="No submissions yet" description="Nothing has been finalized for this event." />
      ) : (
        <div className="flex flex-col gap-3">
          {submitted.map((s) => (
            <Link key={s.id} href={`/submissions/${s.id}`}>
              <Card className="flex flex-col gap-1 transition-colors hover:border-ink-faint sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-ink">{s.title || 'Untitled submission'}</p>
                  <p className="text-xs text-ink-faint">
                    {s.submissionType === 'TEAM' ? 'Team' : 'Solo'} submission
                  </p>
                </div>
                <p className="font-mono text-xs text-ink-muted">Submitted {formatDateTime(s.submittedAt)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {user?.siteAdmin && (
        <section className="mt-10">
          <h2 className="font-display text-lg text-ink">Drafts in progress (admin view)</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Ownership and timestamps only — content is never shown here, for anyone.
          </p>
          {!drafts ? (
            <PageSpinner />
          ) : drafts.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No drafts in progress.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {drafts.map((d) => (
                <li key={d.id} className="flex items-center justify-between border-b border-line py-2 text-sm">
                  <span>
                    <Badge tone="neutral">{d.submissionType}</Badge>{' '}
                    <span className="font-mono text-xs text-ink-faint">{d.teamId ?? d.soloUserId}</span>
                  </span>
                  <span className="font-mono text-xs text-ink-faint">
                    updated {formatDateTime(d.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Container>
  );
}
