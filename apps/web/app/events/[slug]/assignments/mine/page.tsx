'use client';

import { Badge, type Tone } from '@/components/ui/Badge';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { getEvent, listMyAssignments } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { AssignmentStatus, MyAssignmentRow, PublicEvent } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

// docs/design/07-judge-assignment.md Section 3 — "Not started" /
// "In progress" / "Completed", mapped to neutral/live/success.
const STATUS_TONE: Record<AssignmentStatus, Tone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'live',
  COMPLETED: 'success',
  TRANSFERRED: 'neutral',
};
const STATUS_LABEL: Record<AssignmentStatus, string> = {
  PENDING: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  TRANSFERRED: 'Transferred away',
};

export default function MyAssignmentsPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [assignments, setAssignments] = useState<MyAssignmentRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        return listMyAssignments(e.id);
      })
      .then(setAssignments)
      .catch(setError);
  }, [ready, slug]);

  const trackNames = useMemo(() => new Map((event?.tracks ?? []).map((t) => [t.id, t.name])), [event]);

  // Not-started-first (surfaces what needs attention) — TRANSFERRED rows
  // are no longer this judge's work at all, sorted last alongside done ones.
  const sorted = useMemo(() => {
    if (!assignments) return [];
    const rank: Record<AssignmentStatus, number> = { PENDING: 0, IN_PROGRESS: 1, COMPLETED: 2, TRANSFERRED: 3 };
    return [...assignments].sort((a, b) => rank[a.status] - rank[b.status]);
  }, [assignments]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <p className="text-sm text-danger">Couldn&apos;t load this event.</p>
      </Container>
    );
  }
  if (!event || !assignments) return <PageSpinner />;

  return (
    <Container className="py-10">
      <div className="mb-6">
        <Link href={`/events/${slug}`} className="text-xs text-ink-muted hover:text-accent">
          ← {event.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">My assigned projects</h1>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="You haven't been assigned any projects yet." />
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((a) => {
            const disqualified = a.submission?.disqualified ?? false;
            // Module 8's scoring interface is the real hand-off target
            // now that it exists — a disqualified or already-transferred
            // -away assignment has nothing to score, so those stay plain
            // cards rather than linking somewhere that would just reject
            // the write anyway.
            const linkable = !disqualified && a.status !== 'TRANSFERRED';
            const content = (
              <Card
                className={`flex flex-wrap items-center justify-between gap-2 ${linkable ? 'transition-colors hover:border-accent-to' : ''}`}
              >
                <div>
                  <p className="font-medium text-ink">{a.submission?.title || 'Untitled submission'}</p>
                  {a.submission && a.submission.trackIds.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {a.submission.trackIds.map((id) => (
                        <Badge key={id} tone="neutral">
                          {trackNames.get(id) ?? 'Track'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {disqualified ? (
                  <Badge tone="neutral">No longer eligible</Badge>
                ) : (
                  <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                )}
              </Card>
            );
            return (
              <li key={a.id}>
                {linkable ? <Link href={`/events/${slug}/assignments/${a.id}/score`}>{content}</Link> : content}
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
