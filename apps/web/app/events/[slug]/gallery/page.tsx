'use client';

import { Badge } from '@/components/ui/Badge';
import { Card, Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { getEvent, listSubmittedForEvent } from '@/lib/api';
import type { PublicEvent, Submission } from '@raptor/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

// docs/design/05-submission-management.md Section 3 — "Grid of
// submission cards... Search + track filter toolbar, same visual
// pattern as the events list toolbar." Scoped per-event: tracks belong
// to one event, and the doc's own flow ("into this module: solo path
// from event detail directly") reads as an event-scoped gallery, not a
// cross-event one. TODO: undocumented decision, needs confirmation —
// the module map's "public gallery" line doesn't say per-event or
// global explicitly.
function SubmissionGalleryCard({
  submission,
  trackNames,
}: {
  submission: Submission;
  trackNames: Map<string, string>;
}) {
  return (
    <Link href={`/submissions/${submission.id}`} className="block">
      <Card className="flex h-full flex-col gap-2 transition-colors hover:border-accent-to">
        <h2 className="font-display text-base text-ink">{submission.title || 'Untitled submission'}</h2>
        <p className="text-sm text-ink-muted">{submission.submitterName ?? 'Unknown submitter'}</p>
        {submission.trackIds.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {submission.trackIds.map((id) => (
              <Badge key={id} tone="neutral">
                {trackNames.get(id) ?? 'Track'}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}

export default function EventGalleryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  useEffect(() => {
    getEvent(slug)
      .then((e) => {
        setEvent(e);
        return listSubmittedForEvent(e.id);
      })
      .then(setSubmissions)
      .catch(setError);
  }, [slug]);

  const trackNames = useMemo(
    () => new Map((event?.tracks ?? []).map((t) => [t.id, t.name])),
    [event],
  );

  const filtered = useMemo(() => {
    if (!submissions) return [];
    return submissions.filter((s) => {
      const matchesQuery =
        !query ||
        s.title?.toLowerCase().includes(query.toLowerCase()) ||
        s.submitterName?.toLowerCase().includes(query.toLowerCase());
      const matchesTrack = !trackFilter || s.trackIds.includes(trackFilter);
      return matchesQuery && matchesTrack;
    });
  }, [submissions, query, trackFilter]);

  if (error) {
    return (
      <Container className="py-16">
        <p className="text-sm text-danger">This event doesn&apos;t exist, or you don&apos;t have access to it.</p>
      </Container>
    );
  }
  if (!event || !submissions) return <PageSpinner />;

  return (
    <Container className="py-10">
      <div className="mb-6">
        <Link href={`/events/${slug}`} className="text-xs text-ink-muted hover:text-accent">
          ← {event.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl text-ink">Gallery</h1>
      </div>

      {submissions.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search submissions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:max-w-xs"
          />
          {event.tracks && event.tracks.length > 0 && (
            <Select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)} className="sm:max-w-xs">
              <option value="">All tracks</option>
              {event.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {/* No call-to-action here (unlike the events-list empty state) —
          browsing the gallery isn't the moment to prompt someone to
          submit; that prompt belongs on event detail instead (Section 3). */}
      {submissions.length === 0 ? (
        <EmptyState title="No submissions yet" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No submissions match your search." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <SubmissionGalleryCard key={s.id} submission={s} trackNames={trackNames} />
          ))}
        </div>
      )}
    </Container>
  );
}
