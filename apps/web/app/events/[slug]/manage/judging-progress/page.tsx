'use client';

import { Alert } from '@/components/ui/Alert';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { assignmentProgress, getEvent } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { JudgeProgress, PublicEvent } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// docs/design/08-rubric-and-scoring.md Section 3 — a small horizontal
// stacked bar per judge (completed/in-progress/not-started), same
// underlying data as Module 7's assignment board (which shows counts,
// not the bar) — this screen is pure monitoring, sorted least-complete
// -first to surface who needs a nudge.
function ProgressBar({ judge }: { judge: JudgeProgress }) {
  const total = judge.total || 1; // avoid div-by-zero for a zero-assignment judge
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-line">
      {judge.completed > 0 && <div className="bg-success" style={{ width: pct(judge.completed) }} />}
      {judge.inProgress > 0 && <div className="bg-warning" style={{ width: pct(judge.inProgress) }} />}
      {judge.pending > 0 && <div className="bg-ink-faint" style={{ width: pct(judge.pending) }} />}
    </div>
  );
}

export default function JudgingProgressPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [progress, setProgress] = useState<JudgeProgress[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        // Always live-fetched, never cached/memoized (design doc's own
        // explicit warning against a naive cached-count implementation).
        return assignmentProgress(e.id);
      })
      .then(setProgress)
      .catch(setError);
  }, [ready, slug]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event || !progress) return <PageSpinner />;

  const sorted = [...progress].sort((a, b) => {
    const aFrac = a.total === 0 ? 0 : a.completed / a.total;
    const bFrac = b.total === 0 ? 0 : b.completed / b.total;
    return aFrac - bFrac;
  });

  return (
    <Container className="py-10">
      <h1 className="mb-6 font-display text-2xl text-ink">{event.name} — judging progress</h1>

      <Card>
        {sorted.length === 0 ? (
          <EmptyState title="No judges have accepted an invitation yet." />
        ) : (
          <ul className="flex flex-col gap-4">
            {sorted.map((j) => (
              <li key={j.judgeId}>
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium text-ink">{j.displayName}</p>
                  <p className="font-mono text-xs text-ink-faint">
                    {j.total} total · {j.completed} completed · {j.inProgress} in progress · {j.pending} not started
                  </p>
                </div>
                <div className="mt-1.5">
                  <ProgressBar judge={j} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Container>
  );
}
