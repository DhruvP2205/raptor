'use client';

import { PhaseBadge, StatusBadge } from '@/components/events/PhaseBadge';
import { TimelineList } from '@/components/events/TimelineList';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError, getEvent, registerForEvent } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { PublicEvent } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [registerState, setRegisterState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [registerError, setRegisterError] = useState<unknown>(null);

  useEffect(() => {
    getEvent(slug).then(setEvent).catch(setError);
  }, [slug]);

  async function handleRegister() {
    if (!event) return;
    setRegisterState('loading');
    setRegisterError(null);
    try {
      await registerForEvent(event.id);
      setRegisterState('done');
    } catch (err) {
      // Already-registered is not a real failure from the visitor's
      // point of view — treat it the same as success.
      if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED') {
        setRegisterState('done');
      } else {
        setRegisterError(err);
        setRegisterState('idle');
      }
    }
  }

  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">This event doesn&apos;t exist, or you don&apos;t have access to it.</Alert>
      </Container>
    );
  }
  if (!event) return <PageSpinner />;

  return (
    <Container className="grid gap-8 py-10 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-8">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <PhaseBadge phase={event.phase} />
            {user?.siteAdmin && <StatusBadge status={event.status} />}
          </div>
          <h1 className="mt-2 font-display text-3xl text-ink">{event.name}</h1>
        </div>

        {event.descriptionHtml && (
          <div className="prose-content" dangerouslySetInnerHTML={{ __html: event.descriptionHtml }} />
        )}

        {event.tracks && event.tracks.length > 0 && (
          <section>
            <h2 className="font-display text-lg text-ink">Tracks</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {event.tracks.map((t) => (
                <Badge key={t.id} tone="accent">
                  {t.name}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {event.prizes && event.prizes.length > 0 && (
          <section>
            <h2 className="font-display text-lg text-ink">Prizes</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {event.prizes
                .slice()
                .sort((a, b) => a.rank - b.rank)
                .map((p) => (
                  <li key={p.id} className="flex items-center justify-between border-b border-line pb-2 text-sm">
                    <span>
                      #{p.rank} — {p.name}
                    </span>
                    <span className="font-mono text-xs text-ink-faint">
                      {p.decidedBy === 'JUDGES' ? 'Judged' : 'Public vote'}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-display text-lg text-ink">Timeline</h2>
          <div className="mt-3">
            <TimelineList event={event} />
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <Card raised className="flex flex-col gap-3">
          {!user && (
            <>
              <p className="text-sm text-ink-muted">Log in to register for this event.</p>
              <Link href="/login">
                <Button fullWidth size="sm">
                  Log in
                </Button>
              </Link>
            </>
          )}
          {user && user.accountType === 'PARTICIPANT' && (
            <>
              <ApiErrorAlert error={registerError} />
              {registerState === 'done' ? (
                <Alert tone="success">You&apos;re registered.</Alert>
              ) : (
                <Button fullWidth size="sm" loading={registerState === 'loading'} onClick={handleRegister}>
                  Register
                </Button>
              )}
              <Link href={`/events/${slug}/team`}>
                <Button fullWidth size="sm" variant="secondary">
                  My team
                </Button>
              </Link>
              <Link href={`/events/${slug}/submission`}>
                <Button fullWidth size="sm" variant="secondary">
                  My submission
                </Button>
              </Link>
            </>
          )}
          {user && user.accountType === 'ORGANIZER' && (
            <Link href={`/events/${slug}/manage`}>
              <Button fullWidth size="sm" variant="secondary">
                Manage event
              </Button>
            </Link>
          )}
        </Card>
      </aside>
    </Container>
  );
}
