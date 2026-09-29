'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { getEvent, getOrganizerAuditLog } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { OrganizerAuditLogEntry, PublicEvent } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// Module 24 (Release Closeout, B1) — an organizer's read-only view of
// their own event's audit trail. Same list-of-Card-rows pattern as
// every other organizer-shell list (e.g. judging-progress) rather than
// an HTML <table> — that's what "renders as cards" already means
// throughout this app, on any screen size, not a separate mobile-only
// variant.
export default function AuditLogPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [entries, setEntries] = useState<OrganizerAuditLogEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        return getOrganizerAuditLog(e.id);
      })
      .then((page) => {
        setEntries(page.entries);
        setCursor(page.nextCursor);
      })
      .catch(setError);
  }, [ready, slug]);

  const loadMore = () => {
    if (!event || !cursor) return;
    setLoadingMore(true);
    getOrganizerAuditLog(event.id, { cursor })
      .then((page) => {
        setEntries((prev) => [...(prev ?? []), ...page.entries]);
        setCursor(page.nextCursor);
      })
      .catch(setError)
      .finally(() => setLoadingMore(false));
  };

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event&apos;s audit log — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event || !entries) return <PageSpinner />;

  return (
    <Container className="py-10">
      <h1 className="mb-2 font-display text-2xl text-ink">{event.name} — audit log</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Every privileged or destructive action recorded for this event — who, what, and why.
      </p>

      <Card>
        {entries.length === 0 ? (
          <EmptyState title="No audit-log entries for this event yet." />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-medium text-ink">{entry.action}</p>
                  <p className="font-mono text-xs text-ink-faint">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-xs text-ink-muted">{entry.actor}</p>
                {entry.reason !== '(unavailable)' && (
                  <p className="text-sm text-ink-muted">Reason: {entry.reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {cursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </Container>
  );
}
