'use client';

import { cn } from '@/lib/cn';
import React, { useState } from 'react';

// DESIGN-SYSTEM.md 7.4 — border-default at rest, border-hover on plain
// hover, border-focus + ring-focus on focus; `aria-invalid` (set by
// Field below whenever an error is passed) swaps both the resting and
// focus border to status-danger instead — this is what gives every
// invalid field a real red border, not just the error text beneath it.
const baseInputClasses =
  'w-full rounded border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-placeholder ' +
  'hover:border-line-strong ' +
  'focus:outline-none focus:border-accent-to focus:ring-2 focus:ring-focus ' +
  'aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger-border ' +
  'disabled:bg-paper-raised disabled:text-ink-placeholder disabled:cursor-not-allowed disabled:hover:border-line';

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseInputClasses, className)} {...rest} />;
}

// DESIGN-SYSTEM.md 7.5 — same treatment as Input, minimum `minRows`
// visible rows, vertical resize only (horizontal breaks layout).
export function Textarea({
  className,
  minRows = 3,
  rows,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  return (
    <textarea
      rows={rows ?? minRows}
      className={cn(baseInputClasses, 'resize-y', className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(baseInputClasses, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

// Section 0, design/01-auth.md — "Always has a show/hide toggle (eye
// icon) — typing a password blind, twice, is real friction for no real
// security benefit on a client-side field." The toggle's accessible
// label changes with state, not just the icon (Section 5).
export function PasswordInput({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={cn(baseInputClasses, 'pr-10', className)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-faint hover:text-ink-muted"
      >
        {visible ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M2.28 2.22a.75.75 0 00-1.06 1.06l15.5 15.5a.75.75 0 101.06-1.06l-1.756-1.757c1.86-1.402 3.107-3.312 3.652-4.427a1.5 1.5 0 000-1.07C18.512 8.4 15.6 4.5 10 4.5c-1.62 0-3.017.33-4.196.87L2.28 2.22zM6.86 6.8l1.318 1.318a2.5 2.5 0 003.303 3.303l1.318 1.318a4 4 0 01-5.94-5.94zM10 15.5c-4.6 0-7.512-3.9-8.451-5.65a1.5 1.5 0 010-1.07 15 15 0 012.166-3.014l1.062 1.063A13.6 13.6 0 003.14 9.5C4.024 11.15 6.462 14 10 14c.848 0 1.618-.116 2.31-.316l1.14 1.14A9 9 0 0110 15.5z" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M10 4.5c5.6 0 8.512 3.9 9.451 5.65a1.5 1.5 0 010 1.07C18.512 13.1 15.6 17 10 17s-8.512-3.9-9.451-5.65a1.5 1.5 0 010-1.07C1.488 8.4 4.4 4.5 10 4.5zM10 6a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        )}
      </button>
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  // Section 5, design/01-auth.md — errors are programmatically
  // associated with their field (aria-describedby), not just visually
  // positioned nearby. The single child is assumed to be the actual
  // form control (Input/PasswordInput/etc.), so it's cloned rather
  // than requiring every call site to wire this up by hand.
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      {child}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
