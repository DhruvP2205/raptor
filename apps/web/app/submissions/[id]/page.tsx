'use client';

import { CommentsSection } from '@/components/comments/CommentsSection';
import { SubmissionCard } from '@/components/submissions/SubmissionCard';
import { Alert } from '@/components/ui/Alert';
import { Card, Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { getSubmission } from '@/lib/api';
import type { Submission } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// docs/design/05-submission-management.md Section 4 — public once
// submitted (a draft still 404s for anyone but its owner/organizer/
// admin, enforced server-side regardless of what this page does) — no
// useRequireAuth() here, deliberately, unlike this page's earlier
// organizer-only-feeling version.
export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getSubmission(id).then(setSubmission).catch(setError);
  }, [id]);

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
      <CommentsSection
        submissionId={submission.id}
        commentsEnabled={submission.event?.commentsEnabled ?? true}
        isOrganizerOrAdmin={submission.isOrganizerOrAdmin ?? false}
      />
    </Container>
  );
}
