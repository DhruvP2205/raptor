'use client';

import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSpinner } from '@/components/ui/Spinner';
import { previewInvitation, respondToInvitation } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import { formatDate } from '@/lib/format';
import type { InvitationPreview } from '@raptor/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

// docs/design/02-roles-and-membership.md Section 4.
type Screen = 'loading' | 'invalid' | 'expired' | 'accepted' | 'declined' | 'pending';

function RespondScreen() {
  const { ready } = useRequireAuth();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [screen, setScreen] = useState<Screen>('loading');
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);

  useEffect(() => {
    if (!ready || !token) return;
    previewInvitation(token)
      .then((p) => {
        setPreview(p);
        if (p.status === 'EXPIRED') setScreen('expired');
        else if (p.status === 'ACCEPTED') setScreen('accepted');
        else if (p.status === 'DECLINED') setScreen('declined');
        else setScreen('pending');
      })
      .catch(() => setScreen('invalid'));
  }, [ready, token]);

  if (!ready || screen === 'loading') return <PageSpinner />;

  async function act(accept: boolean) {
    setActionLoading(true);
    try {
      await respondToInvitation(token, accept);
      setScreen(accept ? 'accepted' : 'declined');
    } catch {
      // A response that fails here (expired between preview and click,
      // or already resolved elsewhere) — re-preview to land on the
      // correct idempotent state rather than showing a raw error.
      const p = await previewInvitation(token).catch(() => null);
      if (p?.status === 'EXPIRED') setScreen('expired');
      else if (p?.status === 'ACCEPTED') setScreen('accepted');
      else if (p?.status === 'DECLINED') setScreen('declined');
      else setScreen('invalid');
    } finally {
      setActionLoading(false);
      setConfirmDecline(false);
    }
  }

  if (screen === 'invalid') {
    return (
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-display text-lg text-ink">This invitation isn&apos;t for this account</h1>
      </Card>
    );
  }

  if (screen === 'expired') {
    return (
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-display text-lg text-ink">This invitation has expired</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Judge invitations close once the event has started.
        </p>
      </Card>
    );
  }

  if (screen === 'accepted') {
    return (
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-display text-lg text-ink">
          You&apos;re judging <strong>{preview?.eventName}</strong>.
        </h1>
        {preview && (
          <Link href={`/events/${preview.eventId}`} className="mt-4 inline-block">
            <Button type="button">Go to event</Button>
          </Link>
        )}
      </Card>
    );
  }

  if (screen === 'declined') {
    return (
      <Card className="w-full max-w-sm text-center">
        <h1 className="font-display text-lg text-ink">Invitation declined</h1>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm text-center">
      <h1 className="font-display text-lg text-ink">{preview?.eventName}</h1>
      {preview && (
        <p className="mt-1 text-xs text-ink-muted">
          {formatDate(preview.eventStartsAt)} – {formatDate(preview.eventEndsAt)}
        </p>
      )}
      <p className="mt-3 text-sm text-ink-muted">You&apos;ve been invited to judge this event.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="secondary" onClick={() => setConfirmDecline(true)} disabled={actionLoading}>
          Decline
        </Button>
        <Button loading={actionLoading} onClick={() => act(true)}>
          Accept
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDecline}
        danger={false}
        title="Decline this invitation?"
        description="You won't be able to judge this event unless you're invited again."
        confirmLabel="Decline invitation"
        loading={actionLoading}
        onConfirm={() => act(false)}
        onCancel={() => setConfirmDecline(false)}
      />
    </Card>
  );
}

export default function RespondToInvitationPage() {
  return (
    <Container className="flex justify-center py-16">
      <Suspense fallback={<PageSpinner />}>
        <RespondScreen />
      </Suspense>
    </Container>
  );
}
