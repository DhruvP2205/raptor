'use client';

import { Alert } from '@/components/ui/Alert';
import { Container } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import { OrganizerShellProvider, useOrganizerShell } from '@/components/events/OrganizerShellContext';
import { PhaseBadge } from '@/components/events/PhaseBadge';
import { getMyEvents } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequireAuth } from '@/lib/use-require-auth';
import type { PublicEvent } from '@raptor/shared';
import { cn } from '@/lib/cn';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// design/15-organizer-shell.md Section 2 — 13 items, flat list, no
// grouping, pipeline order (setup-shaped first, wrap-up-shaped last).
// Corrected post-audit (D164, D165) from the doc's original 10-item
// draft: Settings and Tracks & prizes were missing entirely, and
// Submissions/Verification were wrongly conflated into one slot.
function sidebarItems(slug: string) {
  return [
    { href: `/events/${slug}/manage`, label: 'Overview' },
    { href: `/events/${slug}/manage/settings`, label: 'Settings' },
    { href: `/events/${slug}/manage/tracks-prizes`, label: 'Tracks & prizes' },
    { href: `/events/${slug}/manage/judges`, label: 'Judges' },
    { href: `/events/${slug}/manage/rubric`, label: 'Rubric' },
    { href: `/events/${slug}/manage/submissions`, label: 'Submissions' },
    { href: `/events/${slug}/manage/verification`, label: 'Verification' },
    { href: `/events/${slug}/manage/assignments`, label: 'Assignment' },
    { href: `/events/${slug}/manage/judging-progress`, label: 'Progress' },
    { href: `/events/${slug}/manage/normalization`, label: 'Normalization' },
    { href: `/events/${slug}/manage/results`, label: 'Results' },
    { href: `/events/${slug}/manage/voting`, label: 'Voting' },
    { href: `/events/${slug}/manage/certificates`, label: 'Certificates' },
  ];
}

function SidebarLinks({ slug, onNavigate }: { slug: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {sidebarItems(slug).map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'block rounded px-3 py-2 text-sm font-medium',
              active ? 'bg-paper-raised text-accent' : 'text-ink-muted hover:bg-paper-raised hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

// Section 2 — event name + ▾ event switcher, current phase badge, and
// a plain "View public page" link, always present.
function EventSwitcher({ event }: { event: PublicEvent }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [others, setOthers] = useState<PublicEvent[] | null>(null);

  useEffect(() => {
    if (!open || others) return;
    getMyEvents(user?.siteAdmin ? undefined : 'ORGANIZER')
      .then((list) => setOthers(list.filter((e) => e.id !== event.id)))
      .catch(() => setOthers([]));
  }, [open, others, user, event.id]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-ink hover:text-accent"
      >
        {event.name} <span aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-dropdown" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-dropdown mt-1 w-64 rounded border border-line bg-white py-1 shadow-overlay">
            {others === null ? (
              <p className="px-3 py-2 text-xs text-ink-muted">Loading…</p>
            ) : others.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-muted">No other events.</p>
            ) : (
              others.map((e) => (
                <Link
                  key={e.id}
                  href={`/events/${e.slug}/manage`}
                  className="block px-3 py-2 text-sm text-ink hover:bg-paper-raised"
                  onClick={() => setOpen(false)}
                >
                  {e.name}
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// This app already has a global, site-wide SiteNav rendered by the root
// layout above every route (including this one) — the design doc's own
// mockup assumed a single unified header, but this codebase's existing
// architecture means the shell header is necessarily a second,
// contextual bar underneath it, not a replacement. Deliberately doesn't
// repeat the "Raptor" logo/hamburger SiteNav already provides — this
// bar only adds the event-specific chrome the shell actually needs.
function ShellHeader({ slug, onMenuClick }: { slug: string; onMenuClick: () => void }) {
  const { event } = useOrganizerShell();
  return (
    <header className="sticky top-0 z-header flex h-14 items-center gap-4 border-b border-line bg-white px-4 sm:px-6">
      {event && (
        <>
          <EventSwitcher event={event} />
          <PhaseBadge phase={event.phase} />
        </>
      )}
      <div className="ml-auto flex items-center gap-4">
        {event && (
          <Link href={`/events/${slug}`} className="text-sm font-medium text-ink-muted hover:text-accent">
            View public page
          </Link>
        )}
        <button
          type="button"
          aria-label="Open organizer menu"
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded border border-line-strong lg:hidden"
        >
          <span className="relative block h-3.5 w-4">
            <span className="absolute left-0 top-0 h-[1.5px] w-full bg-ink" />
            <span className="absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 bg-ink" />
            <span className="absolute bottom-0 left-0 h-[1.5px] w-full bg-ink" />
          </span>
        </button>
      </div>
    </header>
  );
}

// Section 2 — amber, not red: a legitimate, expected capability, not an
// error. Present on every screen for the duration of the session, not
// just on entry.
function AdminBypassBanner() {
  const { summary } = useOrganizerShell();
  if (!summary?.isAdminBypass) return null;
  return (
    <div className="border-b border-warning-border bg-warning-soft px-4 py-2 text-center text-sm text-warning sm:px-6">
      You&apos;re viewing this as a site admin, not as an organizer of this event. This is logged.
    </div>
  );
}

function ShellBody({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { error } = useOrganizerShell();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="danger">Couldn&apos;t load this event for management — you may not be its organizer.</Alert>
      </Container>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ShellHeader slug={slug} onMenuClick={() => setDrawerOpen(true)} />
      <AdminBypassBanner />
      <div className="mx-auto flex w-full max-w-page flex-1">
        <nav
          aria-label="Organizer navigation"
          className="hidden w-52 shrink-0 flex-col gap-1 border-r border-line px-3 py-6 lg:flex"
        >
          <SidebarLinks slug={slug} />
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-modal lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <nav
            aria-label="Organizer navigation"
            className="absolute left-0 top-0 flex h-full w-64 flex-col gap-1 overflow-y-auto bg-paper px-3 py-6 shadow-overlay"
          >
            <SidebarLinks slug={slug} onNavigate={() => setDrawerOpen(false)} />
          </nav>
        </div>
      )}
    </div>
  );
}

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireAuth();
  const { slug } = useParams<{ slug: string }>();

  if (!ready) return <PageSpinner />;

  return (
    <OrganizerShellProvider slug={slug} ready={ready}>
      <ShellBody slug={slug}>{children}</ShellBody>
    </OrganizerShellProvider>
  );
}
