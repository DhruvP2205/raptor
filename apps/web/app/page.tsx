'use client';

import { EventCard } from '@/components/events/EventCard';
import { EventResultCard } from '@/components/events/EventResultCard';
import { StatStrip } from '@/components/events/StatStrip';
import { GlobalRankingTeaser } from '@/components/ranking/GlobalRankingTeaser';
import { Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { listEvents, getPlatformStats } from '@/lib/api';
import { eventStage } from '@/lib/format';
import type { PlatformStats, PublicEvent } from '@raptor/shared';
import { useMemo, useState, useEffect } from 'react';

type Tab = 'all' | 'live' | 'upcoming' | 'results';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'results', label: 'Results' },
];

// The homepage IS the discovery tool — no hero pitch, no "why choose
// us" marketing section. Every incumbent this project is measured
// against (Devpost, Devfolio, Unstop, HackerEarth, ...) makes their
// homepage a searchable/filterable listing of real events, not a
// product pitch to the people who'd actually use it (D90,
// docs/DECISIONS.md).
export default function HomePage() {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  // undefined = still loading, null = failed, object = loaded — kept
  // distinct so a failed fetch shows nothing rather than an indefinite
  // skeleton (docs/design/home-page.md Section 4: "that section shows
  // its own inline error... the rest of the page is unaffected").
  const [stats, setStats] = useState<PlatformStats | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const loadStats = () => {
    setStats(undefined);
    getPlatformStats()
      .then(setStats)
      .catch(() => setStats(null));
  };

  useEffect(() => {
    listEvents()
      .then(setEvents)
      .catch(() => setEvents([]));
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const all = events ?? [];
    return {
      all: all.length,
      live: all.filter((e) => eventStage(e.phase) === 'live').length,
      upcoming: all.filter((e) => eventStage(e.phase) === 'upcoming').length,
      results: all.filter((e) => eventStage(e.phase) === 'results').length,
    };
  }, [events]);

  const filtered = useMemo(() => {
    let list = events ?? [];
    if (tab !== 'all') list = list.filter((e) => eventStage(e.phase) === tab);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [events, tab, query]);

  return (
    <Container className="py-10">
      <div className="mb-8">
        <StatStrip stats={stats} onRetry={loadStats} />
      </div>

      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Hackathons</h1>
        <p className="mt-1 text-sm text-ink-muted">Everything currently published on this instance.</p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-md border border-line-strong p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.key ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink',
              )}
            >
              {t.label}
              <span className="ml-1.5 opacity-60">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <Input
          type="search"
          placeholder="Search hackathons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:w-64"
        />
      </div>

      {events === null ? (
        <PageSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={events.length === 0 ? 'Nothing published yet' : 'No matches'}
          description={
            events.length === 0
              ? 'Check back soon, or create your own event if you’re an organizer.'
              : 'Try a different tab or search term.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) =>
            tab === 'results' || (tab === 'all' && eventStage(e.phase) === 'results') ? (
              <EventResultCard key={e.id} event={e} />
            ) : (
              <EventCard key={e.id} event={e} />
            ),
          )}
        </div>
      )}

      <div className="mt-12">
        <GlobalRankingTeaser />
      </div>
    </Container>
  );
}
