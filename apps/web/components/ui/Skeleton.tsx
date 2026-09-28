import { cn } from '@/lib/cn';

// DESIGN-SYSTEM.md 7.11 — for loading states where the shape of
// incoming content is already known (table rows, stat numbers, cards).
// When the shape is unpredictable, use Spinner instead (see
// design/01-auth.md's "Verifying your email…" state).
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block animate-pulse rounded bg-line motion-reduce:animate-none',
        className,
      )}
    />
  );
}
