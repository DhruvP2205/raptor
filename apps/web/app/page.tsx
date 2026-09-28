'use client';

import { EventCard } from '@/components/events/EventCard';
import { EventResultCard } from '@/components/events/EventResultCard';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SlidersIcon, UploadIcon, UsersIcon } from '@/components/ui/icons';
import { PageSpinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { listEvents } from '@/lib/api';
import { eventStage } from '@/lib/format';
import type { PublicEvent } from '@raptor/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const TERMINAL_LINES = [
  { prompt: true, text: 'docker compose up' },
  { text: 'raptor-api    | Nest application successfully started' },
  { text: 'raptor-web    | ready on :3000' },
  { ok: true, text: 'No external accounts. No hosted services. Just your infra.' },
];

function Section({
  title,
  description,
  accent,
  children,
}: {
  title: string;
  description?: string;
  accent: 'success' | 'violet' | 'rose';
  children: React.ReactNode;
}) {
  const accentClass = {
    success: 'bg-success',
    violet: 'bg-violet',
    rose: 'bg-rose',
  }[accent];
  return (
    <section className="border-t border-line py-12">
      <Container>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={cn('h-6 w-1 rounded-full', accentClass)} aria-hidden />
            <div>
              <h2 className="font-display text-xl text-ink">{title}</h2>
              {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
            </div>
          </div>
        </div>
        {children}
      </Container>
    </section>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-3xl text-ink">{value}</p>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
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
      <section className="relative overflow-hidden border-b border-line">
        {/* Gradient-mesh background — a few large, blurred, low-opacity
            color blobs behind the content. Purely CSS, no imagery, and
            deliberately not full-bleed rainbow — the base UI stays
            monochrome, color shows up where it earns its keep. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-32 h-96 w-96 rounded-full bg-violet/25 blur-[100px]" />
          <div className="absolute right-0 top-10 h-80 w-80 rounded-full bg-accent/20 blur-[100px]" />
          <div className="absolute bottom-[-6rem] left-1/3 h-72 w-72 rounded-full bg-teal/20 blur-[100px]" />
        </div>

        <Container className="relative grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-24">
          <div className="flex flex-col gap-6">
            <h1 className="max-w-xl font-display text-4xl text-ink sm:text-5xl">
              Run your hackathon on infrastructure you actually own.
            </h1>
            <p className="max-w-md text-base text-ink-muted">
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
            {events !== null && events.length > 0 && (
              <div className="mt-2 flex gap-8 border-t border-line pt-5">
                <StatItem value={events.length} label="events hosted" />
                <StatItem value={live.length} label="live right now" />
                <StatItem value={upcoming.length} label="coming soon" />
              </div>
            )}
          </div>

          <div className="rounded-md border border-line-strong bg-ink text-white shadow-popover">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
            </div>
            <div className="space-y-2 px-4 py-5 font-mono text-xs leading-relaxed sm:text-sm">
              {TERMINAL_LINES.map((line, i) => (
                <p key={i} className={line.prompt ? 'text-white' : line.ok ? 'pt-2 text-white/70' : 'text-white/50'}>
                  {line.prompt ? <span className="text-teal">$ </span> : null}
                  {line.text}
                </p>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {events === null ? (
        <div className="py-16">
          <PageSpinner />
        </div>
      ) : (
        <>
          <Section
            accent="success"
            title="Happening now"
            description="Registration, submissions, or judging currently open."
          >
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

          <Section accent="violet" title="Coming soon" description="Published, not yet open for registration.">
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
            accent="rose"
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

      <section className="border-t border-line py-14">
        <Container>
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="flex flex-col gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-success-soft text-success">
                <UsersIcon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-base text-ink">Register &amp; team up</h3>
              <p className="text-sm text-ink-muted">
                Join solo or form a team with a join code. One participation
                track per event — no duplicate entries.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
                <UploadIcon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-base text-ink">Submit with confidence</h3>
              <p className="text-sm text-ink-muted">
                Save drafts freely, submit when ready, keep editing until the
                deadline — enforced on the server, not the browser clock.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-soft text-violet">
                <SlidersIcon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-base text-ink">Built for organizers</h3>
              <p className="text-sm text-ink-muted">
                Configure tracks, prizes, and the full event timeline. Every
                privileged action is written to an audit trail.
              </p>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
