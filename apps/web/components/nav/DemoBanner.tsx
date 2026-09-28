'use client';

// Module 20 (docs/design/20-demo-environment.md Section 5) — a fixed
// bar above the normal nav, rendered only when GET /config/public
// reports demoMode: true. Deliberately not dismissible — no close
// button, no local-storage-remembered dismissal — the whole point is
// that it can't be forgotten for the rest of the session. Visually
// distinct from every status badge already in this design system
// (which all use a pale background + colored text, DESIGN-SYSTEM.md
// §3.2) — solid, dark, full-width, so it reads as categorically
// different rather than one more instance of that pattern.
import { useEffect, useState } from 'react';
import { getPublicConfig } from '@/lib/api';

export function DemoBanner() {
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicConfig()
      .then((config) => {
        if (!cancelled) setDemoMode(config.demoMode);
      })
      .catch(() => {
        // Fails closed — an unreachable config endpoint should never
        // itself be the reason a real instance shows (or hides) this.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!demoMode) return null;

  return (
    <div
      role="status"
      className="w-full px-4 py-2 text-center text-sm font-medium sm:px-6 lg:px-8"
      style={{ background: 'var(--text-primary)', color: 'var(--text-on-primary)' }}
    >
      Demo instance — sample data, not a real event.
    </div>
  );
}
