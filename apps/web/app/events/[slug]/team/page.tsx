'use client';

import { CreateTeamForm } from '@/components/teams/CreateTeamForm';
import { JoinTeamForm } from '@/components/teams/JoinTeamForm';
import { TeamPanel } from '@/components/teams/TeamPanel';
import { Alert } from '@/components/ui/Alert';
import { Card, Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError, getEvent, getMyTeam } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { PublicEvent, TeamWithMembers } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function TeamPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [team, setTeam] = useState<TeamWithMembers | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);

  const loadTeam = useCallback((eventId: string) => {
    getMyTeam(eventId)
      .then(setTeam)
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_TEAM') {
          setTeam(null);
        } else {
          setError(err);
        }
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        loadTeam(e.id);
      })
      .catch(setError);
  }, [ready, slug, loadTeam]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event.</Alert>
      </Container>
    );
  }
  if (!event || team === undefined) return <PageSpinner />;

  return (
    <Container className="py-10">
      <div className="mb-6">
        <Link href={`/events/${slug}`} className="text-xs text-ink-muted hover:text-accent">
          ← {event.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">Your team</h1>
      </div>

      {team ? (
        <Card className="max-w-xl">
          <TeamPanel
            team={team}
            currentUserId={user!.id}
            onTeamUpdated={setTeam}
            onTeamDeleted={() => setTeam(null)}
          />
        </Card>
      ) : (
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="font-display text-lg text-ink">Create a team</h2>
            <p className="mt-1 text-xs text-ink-muted">
              You&apos;ll be its admin. Make sure you&apos;ve registered for this event first.
            </p>
            <div className="mt-4">
              <CreateTeamForm eventId={event.id} onCreated={() => loadTeam(event.id)} />
            </div>
          </Card>
          <Card>
            <h2 className="font-display text-lg text-ink">Join with a code</h2>
            <p className="mt-1 text-xs text-ink-muted">Get this from your team&apos;s admin.</p>
            <div className="mt-4">
              <JoinTeamForm onJoined={() => loadTeam(event.id)} />
            </div>
          </Card>
        </div>
      )}
    </Container>
  );
}
