// Minimal hand-drawn line icons (stroke, currentColor) — no icon
// library dependency, no gradient/3D glyphs (that reads as generated).
type IconProps = { className?: string };

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export function UsersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="9" cy="7.5" r="3.25" />
      <path d="M17 8a2.75 2.75 0 1 0 0-5.5" />
      <path d="M20 19v-1.5a3.3 3.3 0 0 0-2.2-3.1" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 15V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" />
    </svg>
  );
}

export function SlidersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h9" />
      <path d="M17 6h3" />
      <circle cx="14" cy="6" r="2.25" />
      <path d="M4 12h3" />
      <path d="M11 12h9" />
      <circle cx="8" cy="12" r="2.25" />
      <path d="M4 18h9" />
      <path d="M17 18h3" />
      <circle cx="14" cy="18" r="2.25" />
    </svg>
  );
}
