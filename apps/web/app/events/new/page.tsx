'use client';

import { EventForm } from '@/components/events/EventForm';
import { Alert } from '@/components/ui/Alert';
import { Card, Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { createEvent } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import { useRouter } from 'next/navigation';

export default function NewEventPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const router = useRouter();

  if (!ready) return <PageSpinner />;

  // UX-only gate — the backend independently checks accountType ===
  // ORGANIZER on POST /events and rejects otherwise (see
  // MembershipService.assertAccountTypeMatchesRole).
  if (user?.accountType !== 'ORGANIZER') {
    return (
      <Container className="py-16">
        <Alert tone="warning">Only organizer accounts can create events.</Alert>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <h1 className="mb-6 font-display text-2xl text-ink">Create an event</h1>
      <Card className="max-w-3xl">
        <EventForm
          submitLabel="Create event"
          onSubmit={async (values) => {
            const event = await createEvent(values);
            router.push(`/events/${event.slug}/manage`);
          }}
        />
      </Card>
    </Container>
  );
}
