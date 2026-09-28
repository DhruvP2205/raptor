'use client';

import { ManageNav } from '@/components/events/ManageNav';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError, getEvent, inviteJudge, listJudgeInvitations, resendJudgeInvitation } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useToast } from '@/lib/toast-context';
import type { InvitationStatus, JudgeInvitation, PublicEvent } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// docs/design/02-roles-and-membership.md Section 3 — maps the four
// backend invitation states onto the design system's four semantic
// status tones.
const STATUS_TONE: Record<InvitationStatus, Tone> = {
  PENDING: 'live',
  ACCEPTED: 'success',
  DECLINED: 'neutral',
  EXPIRED: 'danger',
};

function InviteJudgeForm({ eventId, onInvited }: { eventId: string; onInvited: (m: JudgeInvitation) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const membership = await inviteJudge(eventId, email);
      // The invite response doesn't include the joined user summary
      // (see MembershipService.inviteJudgeDirect's return type) — refetch
      // isn't strictly needed since we already know the email the caller
      // just typed; displayName isn't known yet, so it's filled with the
      // email as a reasonable placeholder until the list is next reloaded.
      onInvited({ ...membership, user: { id: membership.userId, email, displayName: email } });
      setEmail('');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field
          label="Judge's email"
          htmlFor="invite-judge-email"
          hint="Must already be a judge-track account — created via an admin's staff-account form."
        >
          <Input
            id="invite-judge-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
      </div>
      <Button type="submit" loading={loading} className="sm:mb-0.5">
        Invite
      </Button>
      {error instanceof ApiError && (
        <p className="text-xs font-medium text-danger sm:basis-full">
          {error.code === 'JUDGE_NOT_FOUND'
            ? 'No judge account with that email — create one first from Admin -> Staff accounts.'
            : error.message}
        </p>
      )}
    </form>
  );
}

function JudgeRow({
  eventId,
  invitation,
  onUpdated,
}: {
  eventId: string;
  invitation: JudgeInvitation;
  onUpdated: (m: JudgeInvitation) => void;
}) {
  const { showToast } = useToast();
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const canResend = invitation.invitationStatus !== 'ACCEPTED';

  async function handleResend() {
    setResending(true);
    setResendError(null);
    try {
      const updated = await resendJudgeInvitation(eventId, invitation.id);
      onUpdated({ ...invitation, ...updated });
      showToast('Invitation resent.');
    } catch {
      // Inline, per-row — one row's action failing shouldn't disrupt the
      // rest of the table (design doc's own note, Section 3 States).
      setResendError("Couldn't resend — try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
      <div>
        <p className="font-medium text-ink">{invitation.user.displayName}</p>
        <p className="text-sm text-ink-muted">{invitation.user.email}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-ink-faint">
          Invited {invitation.invitedAt ? formatDate(invitation.invitedAt) : '—'}
        </span>
        <Badge tone={STATUS_TONE[invitation.invitationStatus]}>{invitation.invitationStatus}</Badge>
        {canResend && (
          <Button size="sm" variant="secondary" loading={resending} onClick={handleResend}>
            Resend
          </Button>
        )}
      </div>
      {resendError && <p className="w-full text-xs font-medium text-danger">{resendError}</p>}
    </li>
  );
}

export default function ManageJudgesPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [invitations, setInvitations] = useState<JudgeInvitation[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        return listJudgeInvitations(e.id);
      })
      .then(setInvitations)
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
  if (!event || !invitations) return <PageSpinner />;

  return (
    <Container className="py-10">
      <ManageNav slug={slug} />
      <h1 className="mb-1 font-display text-2xl text-ink">{event.name} — judges</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Only accounts already created as judge-track staff accounts can be invited — see Admin -&gt;
        Staff accounts.
      </p>

      <Card>
        {invitations.length === 0 ? (
          <EmptyState
            title="No judges invited yet"
            description="Invite a judge-track account by email below."
          />
        ) : (
          <ul>
            {invitations.map((inv) => (
              <JudgeRow
                key={inv.id}
                eventId={event.id}
                invitation={inv}
                onUpdated={(updated) =>
                  setInvitations((list) => (list ? list.map((x) => (x.id === updated.id ? updated : x)) : list))
                }
              />
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-line pt-4">
          <InviteJudgeForm
            eventId={event.id}
            onInvited={(m) => setInvitations((list) => (list ? [...list, m] : [m]))}
          />
          {/* docs/design/02-roles-and-membership.md Section 3 also
              describes a "Generate joining link" path — the backend
              deliberately doesn't implement it yet (see
              MembershipService's own comment: no data-model shape
              exists for an invitation not yet addressed to a specific
              user). Noted here rather than building UI for a route
              that doesn't exist. */}
          <p className="mt-3 text-xs text-ink-faint">
            Inviting by shareable link isn&apos;t available yet — invite by email above.
          </p>
        </div>
      </Card>
    </Container>
  );
}
