'use client';

import { cn } from '@/lib/cn';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

// DESIGN-SYSTEM.md 7.1/7.2/7.3 — primary/danger are a two-stop gradient
// with an inset top highlight and their own hover/active treatment
// (brightness bump + deeper shadow on hover, press-down on active);
// secondary/ghost stay flat.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'border-transparent text-white shadow-[0_1px_2px_rgba(29,78,216,0.15),inset_0_1px_0_rgba(255,255,255,0.12)] ' +
    'bg-[linear-gradient(180deg,#2563EB_0%,#1D4ED8_100%)] ' +
    'hover:brightness-[1.06] hover:shadow-[0_4px_10px_rgba(29,78,216,0.28),inset_0_1px_0_rgba(255,255,255,0.15)] ' +
    'active:translate-y-px active:scale-[0.99] ' +
    'disabled:bg-none disabled:bg-line disabled:text-ink-placeholder disabled:shadow-none',
  secondary:
    'bg-white text-ink-muted border-line hover:bg-paper-raised hover:text-ink ' +
    'disabled:text-ink-placeholder disabled:hover:bg-white',
  ghost:
    'bg-transparent text-ink-muted border-transparent hover:bg-paper-raised hover:text-ink ' +
    'disabled:text-ink-placeholder disabled:hover:bg-transparent',
  danger:
    'border-transparent text-white shadow-[0_1px_2px_rgba(185,28,28,0.15),inset_0_1px_0_rgba(255,255,255,0.12)] ' +
    'bg-[linear-gradient(180deg,#DC2626_0%,#B91C1C_100%)] ' +
    'hover:brightness-[1.06] hover:shadow-[0_4px_10px_rgba(185,28,28,0.28),inset_0_1px_0_rgba(255,255,255,0.15)] ' +
    'active:translate-y-px active:scale-[0.99] ' +
    'disabled:bg-none disabled:bg-line disabled:text-ink-placeholder disabled:shadow-none',
};

const SIZE_CLASSES: Record<Size, string> = {
  md: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, fullWidth, disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded border font-medium tracking-tight',
        'transition-[filter,box-shadow,transform,background-color,color,border-color] duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});
