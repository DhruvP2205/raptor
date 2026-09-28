import { cn } from '@/lib/cn';

// DESIGN-SYSTEM.md 7.10 — no photo-upload anywhere in the backend spec,
// so this always renders initials on a deterministic background color
// derived from the person's id (same person always gets the same
// color without a stored color field). Palette restricted to the
// system's own tokens, same reasoning as EventCard's poster placeholder.
const TONES = ['bg-ink', 'bg-accent', 'bg-ink-muted', 'bg-success', 'bg-warning', 'bg-danger'];

function toneFor(id: string): string {
  const hash = id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return TONES[hash % TONES.length];
}

const SIZE_CLASSES = {
  small: 'h-6 w-6 text-[10px]',
  default: 'h-8 w-8 text-xs',
  large: 'h-10 w-10 text-sm',
};

export function Avatar({
  name,
  id,
  size = 'default',
  className,
}: {
  name: string;
  /** Stable identity to derive the color from — falls back to `name` if omitted. */
  id?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white',
        SIZE_CLASSES[size],
        toneFor(id ?? name),
        className,
      )}
    >
      {initial}
    </span>
  );
}
