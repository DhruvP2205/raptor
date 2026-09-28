'use client';

import { getEvent, getOrganizerSummary } from '@/lib/api';
import type { OrganizerSummary, PublicEvent } from '@raptor/shared';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// design/15-organizer-shell.md — the shell layout fetches the event and
// the Overview summary exactly once per event, and every screen inside
// the shell (header, sidebar, admin-bypass banner, the Overview page
// itself) reads from this one context instead of each re-fetching the
// same data independently.
interface OrganizerShellValue {
  event: PublicEvent | null;
  summary: OrganizerSummary | null;
  error: unknown;
  refresh: () => void;
}

const OrganizerShellContext = createContext<OrganizerShellValue | null>(null);

export function OrganizerShellProvider({
  slug,
  ready,
  children,
}: {
  slug: string;
  ready: boolean;
  children: React.ReactNode;
}) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [summary, setSummary] = useState<OrganizerSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!ready) return;
    setError(null);
    getEvent(slug)
      .then(async (e) => {
        setEvent(e);
        setSummary(await getOrganizerSummary(e.id));
      })
      .catch(setError);
  }, [ready, slug, tick]);

  return (
    <OrganizerShellContext.Provider value={{ event, summary, error, refresh }}>
      {children}
    </OrganizerShellContext.Provider>
  );
}

export function useOrganizerShell(): OrganizerShellValue {
  const ctx = useContext(OrganizerShellContext);
  if (!ctx) {
    throw new Error('useOrganizerShell must be used within OrganizerShellProvider');
  }
  return ctx;
}
