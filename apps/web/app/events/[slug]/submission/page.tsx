'use client';

import { SubmissionForm } from '@/components/submissions/SubmissionForm';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError, getEvent, getMySubmission, startSubmission } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { PublicEvent, Submission } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SubmissionEditorPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [submission, setSubmission] = useState<Submission | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        return getMySubmission(e.id);
      })
      .then(setSubmission)
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'SUBMISSION_NOT_FOUND') {
          setSubmission(null);
        } else {
          setError(err);
        }
      });
  }, [ready, slug]);

  async function handleStart() {
    if (!event) return;
    setStarting(true);
    setStartError(null);
    try {
      setSubmission(await startSubmission(event.id));
    } catch (err) {
      setStartError(err);
    } finally {
      setStarting(false);
    }
  }

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event.</Alert>
      </Container>
    );
  }
  if (!event || submission === undefined) return <PageSpinner />;

  return (
    <Container className="py-10">
      <div className="mb-6">
        <Link href={`/events/${slug}`} className="text-xs text-ink-muted hover:text-accent">
          ← {event.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">Your submission</h1>
      </div>

      {submission ? (
        <Card className="max-w-3xl">
          <SubmissionForm event={event} submission={submission} onChange={setSubmission} />
        </Card>
      ) : (
        <Card className="max-w-xl">
          <p className="text-sm text-ink-muted">
            You haven&apos;t started a submission for this event yet. Register and, if you&apos;re
            entering as a team, form or join one first — this starts a solo entry if you&apos;re not
            on a team, or attaches to your team automatically if you are.
          </p>
          <div className="mt-4">
            <ApiErrorAlert error={startError} />
          </div>
          <Button className="mt-4" loading={starting} onClick={handleStart}>
            Start submission
          </Button>
        </Card>
      )}
    </Container>
  );
}
