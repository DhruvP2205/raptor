'use client';

import { useEffect, useRef, useState } from 'react';

// docs/design/home-page.md Section 2.2 / Section 6 — count-up on
// scroll-into-view, renders instantly (no animation) under
// prefers-reduced-motion. IntersectionObserver fires once
// (unobserve after) — this is an entrance effect, not a repeating one.
function useCountUp(target: number, active: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || target === 0) {
      setValue(target);
      return;
    }

    const durationMs = 900;
    const startedAt = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      setValue(Math.round(target * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [active, target]);

  return value;
}

function Stat({ label, value, active }: { label: string; value: number; active: boolean }) {
  const displayed = useCountUp(value, active);
  return (
    <div className="text-center">
      <p className="font-display text-3xl text-ink">{displayed.toLocaleString()}</p>
      <p className="mt-1 text-sm text-ink-muted">{label}</p>
    </div>
  );
}

export function StatStrip({
  stats,
  onRetry,
}: {
  // undefined = still loading (skeleton); null = failed (inline error
  // + retry, per Section 4: "that section shows its own inline error
  // + retry; the rest of the page is unaffected"); object = loaded.
  stats: { eventsCount: number; submissionsCount: number; participantsCount: number } | null | undefined;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || active) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  if (stats === null) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-danger-border bg-danger-soft p-4 text-sm text-danger">
        <span>Couldn&apos;t load platform stats.</span>
        <button type="button" onClick={onRetry} className="font-medium underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="grid grid-cols-1 gap-6 rounded-lg border border-line bg-white p-6 sm:grid-cols-3">
      {stats === undefined ? (
        <>
          <div className="h-14 animate-pulse rounded bg-paper-raised" />
          <div className="h-14 animate-pulse rounded bg-paper-raised" />
          <div className="h-14 animate-pulse rounded bg-paper-raised" />
        </>
      ) : (
        <>
          <Stat label="Events run" value={stats.eventsCount} active={active} />
          <Stat label="Projects submitted" value={stats.submissionsCount} active={active} />
          <Stat label="Participants" value={stats.participantsCount} active={active} />
        </>
      )}
    </div>
  );
}
