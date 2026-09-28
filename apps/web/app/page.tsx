'use client';

import { EventCard } from '@/components/events/EventCard';
import { EventResultCard } from '@/components/events/EventResultCard';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { listEvents } from '@/lib/api';
import { eventStage } from '@/lib/format';
import type { PublicEvent } from '@raptor/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line py-12">
      <Container>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
        </div>
        {children}
      </Container>
    </section>
  );
}

export default function HomePage() {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);

  useEffect(() => {
    listEvents()
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const live = events?.filter((e) => eventStage(e.phase) === 'live') ?? [];
  const upcoming = events?.filter((e) => eventStage(e.phase) === 'upcoming') ?? [];
  const results = events?.filter((e) => eventStage(e.phase) === 'results') ?? [];

  return (
    <div>
      <section className="border-b border-line">
        <Container className="flex flex-col gap-5 py-14 sm:py-16">
          <h1 className="max-w-2xl font-display text-3xl text-ink sm:text-4xl">
            Run your hackathon on infrastructure you actually own.
          </h1>
          <p className="max-w-xl text-base text-ink-muted">
            Register, form teams, submit projects, and track results — a
            self-hostable platform with no third-party service in the stack.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/events">
              <Button size="md">Browse all events</Button>
            </Link>
            <Link href="/signup">
              <Button size="md" variant="secondary">
                Create an account
              </Button>
            </Link>
          </div>
        </Container>
      </section>

      {events === null ? (
        <div className="py-16">
          <PageSpinner />
        </div>
      ) : (
        <>
          <Section title="Happening now" description="Registration, submissions, or judging currently open.">
            {live.length === 0 ? (
              <EmptyState title="Nothing happening right now" description="Check back soon." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {live.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Coming soon" description="Published, not yet open for registration.">
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing announced yet" description="New hackathons will show up here." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Results & prizes"
            description="Prizes each event has on offer — not a judged winner (judging isn't built yet)."
          >
            {results.length === 0 ? (
              <EmptyState title="No results announced yet" description="Finished events will show up here." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((e) => (
                  <EventResultCard key={e.id} event={e} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
