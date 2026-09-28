'use client';

import { EventForm } from '@/components/events/EventForm';
import { StatusBadge } from '@/components/events/PhaseBadge';
import { PosterUpload } from '@/components/events/PosterUpload';
import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSpinner } from '@/components/ui/Spinner';
import { archiveEvent, deleteEvent, getEvent, publishEvent, updateEvent } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { PublicEvent } from '@raptor/shared';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ManageSettingsPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug).then(setEvent).catch(setError);
  }, [ready, slug]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">
          Couldn&apos;t load this event for management — you may not be its organizer.
        </Alert>
      </Container>
    );
  }
  if (!event) return <PageSpinner />;

  async function handlePublish() {
    setActionLoading(true);
    setActionError(null);
    try {
      setEvent(await publishEvent(event!.id));
    } catch (err) {
      setActionError(err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleArchive() {
    setActionLoading(true);
    setActionError(null);
    try {
      setEvent(await archiveEvent(event!.id));
    } catch (err) {
      setActionError(err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteEvent(event!.id);
      router.push('/');
    } catch (err) {
      setActionError(err);
      setActionLoading(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Container className="py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl text-ink">{event.name}</h1>
          <StatusBadge status={event.status} />
        </div>
        <div className="flex gap-2">
          {event.status === 'DRAFT' && (
            <Button size="sm" loading={actionLoading} onClick={handlePublish}>
              Publish
            </Button>
          )}
          {event.status === 'PUBLISHED' && (
            <Button size="sm" variant="secondary" loading={actionLoading} onClick={handleArchive}>
              Archive
            </Button>
          )}
          {(event.status === 'DRAFT' || event.status === 'PUBLISHED') && (
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <ApiErrorAlert error={actionError} />
      </div>

      <Card className="mb-6 max-w-3xl">
        <h2 className="mb-3 font-display text-lg text-ink">Poster</h2>
        <PosterUpload
          eventId={event.id}
          posterUrl={event.posterUrl}
          onUploaded={(posterUrl) => setEvent((e) => (e ? { ...e, posterUrl } : e))}
        />
      </Card>

      <Card className="mb-6 max-w-3xl">
        <h2 className="mb-1 font-display text-lg text-ink">Comments</h2>
        <p className="mb-3 text-xs text-ink-muted">
          When off, no new comments can be posted — existing ones stay visible.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={event.commentsEnabled}
            disabled={actionLoading}
            onChange={async (e) => {
              setActionLoading(true);
              setActionError(null);
              try {
                setEvent(await updateEvent(event.id, { commentsEnabled: e.target.checked }));
              } catch (err) {
                setActionError(err);
              } finally {
                setActionLoading(false);
              }
            }}
          />
          Comments enabled for this event
        </label>
      </Card>

      <Card className="max-w-3xl">
        <EventForm
          submitLabel="Save changes"
          initial={{ ...event, description: event.description ?? undefined }}
          onSubmit={async (values) => {
            const updated = await updateEvent(event.id, values);
            setEvent(updated);
          }}
        />
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this event?"
        description="This soft-deletes the event. It will no longer be visible or manageable."
        confirmLabel="Delete event"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Container>
  );
}
