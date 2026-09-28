'use client';

import { EventCard } from '@/components/events/EventCard';
import { ApiErrorAlert } from '@/components/ui/Alert';
import { Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { listEvents } from '@/lib/api';
import type { PublicEvent } from '@raptor/shared';
import { useEffect, useState } from 'react';

export default function EventsPage() {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    listEvents().then(setEvents).catch(setError);
  }, []);

  return (
    <Container className="py-10">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Browse events</h1>
        <p className="mt-1 text-sm text-ink-muted">Every event currently published.</p>
      </div>
      <ApiErrorAlert error={error} />
      {!events && !error && <PageSpinner />}
      {events && events.length === 0 && (
        <EmptyState
          title="Nothing published yet"
          description="Check back soon, or create your own event if you're an organizer."
        />
      )}
      {events && events.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </Container>
  );
}
