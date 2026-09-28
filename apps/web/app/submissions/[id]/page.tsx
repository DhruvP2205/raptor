'use client';

import { SubmissionCard } from '@/components/submissions/SubmissionCard';
import { Alert } from '@/components/ui/Alert';
import { Card, Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { getSubmission } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { Submission } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SubmissionDetailPage() {
  const { ready } = useRequireAuth();
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getSubmission(id).then(setSubmission).catch(setError);
  }, [ready, id]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        {/* Same message whether it genuinely doesn't exist or it's a
            draft you're not allowed to see (Section 6) — never reveal
            which. */}
        <Alert tone="danger">No such submission.</Alert>
      </Container>
    );
  }
  if (!submission) return <PageSpinner />;

  return (
    <Container className="max-w-3xl py-10">
      <Card>
        <SubmissionCard submission={submission} />
      </Card>
    </Container>
  );
}
