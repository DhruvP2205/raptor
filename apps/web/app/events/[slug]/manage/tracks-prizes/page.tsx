'use client';

import { Alert, ApiErrorAlert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Container } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { createPrize, createTrack, getEvent, updatePrize, updateTrack } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { Prize, PublicEvent, Track } from '@raptor/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

function NewTrackForm({ eventId, onCreated }: { eventId: string; onCreated: (t: Track) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const track = await createTrack(eventId, { name, description: description || undefined });
      onCreated(track);
      setName('');
      setDescription('');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Track name" htmlFor="new-track-name" required>
        <Input id="new-track-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Description" htmlFor="new-track-desc" hint="Markdown supported, optional.">
        <Textarea id="new-track-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <ApiErrorAlert error={error} />
      <Button type="submit" size="sm" loading={loading} className="self-start">
        Add track
      </Button>
    </form>
  );
}

function TrackRow({ eventId, track, onUpdated }: { eventId: string; track: Track; onUpdated: (t: Track) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);
  const [description, setDescription] = useState(track.description ?? '');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const updated = await updateTrack(eventId, track.id, { name, description });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <li className="flex items-start justify-between gap-3 border-b border-line py-3">
        <div>
          <p className="font-medium text-ink">{track.name}</p>
          {track.description && <p className="mt-1 text-sm text-ink-muted">{track.description}</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 border-b border-line py-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      <ApiErrorAlert error={error} />
      <div className="flex gap-2">
        <Button size="sm" loading={loading} onClick={handleSave}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </li>
  );
}

function PrizeRow({
  eventId,
  prize,
  tracks,
  onUpdated,
}: {
  eventId: string;
  prize: Prize;
  tracks: Track[];
  onUpdated: (p: Prize) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(prize.name);
  const [rank, setRank] = useState(prize.rank);
  const [decidedBy, setDecidedBy] = useState(prize.decidedBy);
  const [trackId, setTrackId] = useState(prize.trackId ?? '');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const updated = await updatePrize(eventId, prize.id, {
        name,
        rank,
        decidedBy,
        trackId: trackId || null,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between border-b border-line py-3 text-sm">
        <span>
          #{prize.rank} — {prize.name}
        </span>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{prize.decidedBy === 'JUDGES' ? 'Judges' : 'Public vote'}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 border-b border-line py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="number" min={1} value={rank} onChange={(e) => setRank(Number(e.target.value))} />
        <Select value={decidedBy} onChange={(e) => setDecidedBy(e.target.value as 'JUDGES' | 'PUBLIC_VOTE')}>
          <option value="JUDGES">Judges</option>
          <option value="PUBLIC_VOTE">Public vote</option>
        </Select>
        <Select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          <option value="">No specific track</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <ApiErrorAlert error={error} />
      <div className="flex gap-2">
        <Button size="sm" loading={loading} onClick={handleSave}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </li>
  );
}

function NewPrizeForm({
  eventId,
  tracks,
  onCreated,
}: {
  eventId: string;
  tracks: Track[];
  onCreated: (p: Prize) => void;
}) {
  const [name, setName] = useState('');
  const [rank, setRank] = useState(1);
  const [decidedBy, setDecidedBy] = useState<'JUDGES' | 'PUBLIC_VOTE'>('JUDGES');
  const [trackId, setTrackId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const prize = await createPrize(eventId, {
        name,
        rank,
        decidedBy,
        trackId: trackId || undefined,
      });
      onCreated(prize);
      setName('');
      setRank(1);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prize name" htmlFor="new-prize-name" required>
          <Input id="new-prize-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Rank" htmlFor="new-prize-rank" required>
          <Input
            id="new-prize-rank"
            type="number"
            min={1}
            value={rank}
            onChange={(e) => setRank(Number(e.target.value))}
            required
          />
        </Field>
        <Field label="Decided by" htmlFor="new-prize-decided">
          <Select
            id="new-prize-decided"
            value={decidedBy}
            onChange={(e) => setDecidedBy(e.target.value as 'JUDGES' | 'PUBLIC_VOTE')}
          >
            <option value="JUDGES">Judges</option>
            <option value="PUBLIC_VOTE">Public vote</option>
          </Select>
        </Field>
        <Field label="Track (optional)" htmlFor="new-prize-track">
          <Select id="new-prize-track" value={trackId} onChange={(e) => setTrackId(e.target.value)}>
            <option value="">No specific track</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ApiErrorAlert error={error} />
      <Button type="submit" size="sm" loading={loading} className="self-start">
        Add prize
      </Button>
    </form>
  );
}

export default function TracksPrizesPage() {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    getEvent(slug).then(setEvent).catch(setError);
  }, [ready, slug]);

  if (!ready) return <PageSpinner />;
  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event — you may not be its organizer.</Alert>
      </Container>
    );
  }
  if (!event) return <PageSpinner />;

  const tracks = event.tracks ?? [];
  const prizes = event.prizes ?? [];

  return (
    <Container className="py-10">
      <h1 className="mb-6 font-display text-2xl text-ink">{event.name} — tracks &amp; prizes</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg text-ink">Tracks</h2>
          <p className="mt-1 text-xs text-ink-muted">
            No delete — removal semantics are an open question upstream. Create and edit only.
          </p>
          <ul className="mt-4">
            {tracks.map((t) => (
              <TrackRow
                key={t.id}
                eventId={event.id}
                track={t}
                onUpdated={(updated) =>
                  setEvent((e) => (e ? { ...e, tracks: e.tracks?.map((x) => (x.id === updated.id ? updated : x)) } : e))
                }
              />
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-4">
            <NewTrackForm
              eventId={event.id}
              onCreated={(t) => setEvent((e) => (e ? { ...e, tracks: [...(e.tracks ?? []), t] } : e))}
            />
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg text-ink">Prizes</h2>
          <ul className="mt-4">
            {prizes
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((p) => (
                <PrizeRow
                  key={p.id}
                  eventId={event.id}
                  prize={p}
                  tracks={tracks}
                  onUpdated={(updated) =>
                    setEvent((e) => (e ? { ...e, prizes: e.prizes?.map((x) => (x.id === updated.id ? updated : x)) } : e))
                  }
                />
              ))}
          </ul>
          <div className="mt-4 border-t border-line pt-4">
            <NewPrizeForm
              eventId={event.id}
              tracks={tracks}
              onCreated={(p) => setEvent((e) => (e ? { ...e, prizes: [...(e.prizes ?? []), p] } : e))}
            />
          </div>
        </Card>
      </div>
    </Container>
  );
}
