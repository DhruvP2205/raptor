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

// Primary is solid black, not a colored brand button — the accent
// color is reserved for links/focus rings only (Vercel/Geist's actual
// convention, not a generic colored-CTA template).
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-ink text-white border-ink hover:bg-ink/85',
  secondary: 'bg-white text-ink border-line-strong hover:border-ink',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-line/50',
  danger: 'bg-danger text-white border-danger hover:bg-danger/85',
};

const SIZE_CLASSES: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
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
        'inline-flex items-center justify-center gap-2 rounded border font-medium tracking-tight transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
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
