import type { Config } from 'tailwindcss';

// Enterprise-conservative palette per docs/DESIGN-SYSTEM.md (superseded
// the earlier warm-pastel -> monochrome -> +violet/teal/rose passes,
// D87/D89 — see docs/design/design-review-audit.md's conflict note for
// why this pass exists). Token *names* here are our own, chosen to be
// the shortest stable handle at each call site; each one maps 1:1 to a
// named layer in DESIGN-SYSTEM.md Section 3 (noted per token below) —
// change the value here, not at any call site, exactly per that doc's
// "raw palette, then semantic tokens" rule.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      paper: '#ffffff', // surface-default
      'paper-raised': '#F9FAFB', // surface-page (gray-50)
      ink: '#111827', // text-primary (gray-900)
      'ink-muted': '#4B5563', // text-secondary (gray-600)
      'ink-faint': '#6B7280', // text-muted (gray-500)
      'ink-placeholder': '#9CA3AF', // text-placeholder (gray-400)
      line: '#E5E7EB', // border-default (gray-200)
      'line-strong': '#9CA3AF', // border-hover (gray-400)
      accent: '#2563EB', // action-primary "from" (blue-600)
      'accent-to': '#1D4ED8', // action-primary "to" / border-focus text (blue-700)
      'accent-hover': '#1D4ED8',
      'accent-soft': '#EFF6FF', // surface-selected (blue-50)
      'accent-ink': '#ffffff', // text-on-primary
      danger: '#B91C1C', // status-danger-text (red-700)
      'danger-strong': '#DC2626', // action-danger "from" (red-600)
      'danger-soft': '#FEF2F2', // status-danger-bg (red-50)
      'danger-border': '#FECACA', // status-danger-border (red-200)
      success: '#15803D', // status-success-text (green-700)
      'success-soft': '#F0FDF4', // status-success-bg (green-50)
      'success-border': '#BBF7D0', // status-success-border (green-200)
      warning: '#B45309', // status-live-text (amber-700) — "warning" name kept, maps to the doc's "live" status
      'warning-soft': '#FFFBEB', // status-live-bg (amber-50)
      'warning-border': '#FDE68A', // status-live-border (amber-200)
    },
    fontFamily: {
      display: ['var(--font-display)'],
      sans: ['var(--font-body)'],
      mono: ['var(--font-mono)'],
    },
    borderRadius: {
      none: '0px',
      sm: '4px',
      DEFAULT: '6px', // radius-default
      md: '8px',
      lg: '10px',
      full: '9999px', // radius-pill
    },
    boxShadow: {
      none: 'none',
      flat: '0 1px 2px rgba(0,0,0,0.05)', // elevation-flat
      raised: '0 4px 12px rgba(0,0,0,0.08)', // elevation-raised
      overlay: '0 12px 32px rgba(0,0,0,0.14)', // elevation-overlay
      toast: '0 4px 16px rgba(0,0,0,0.12)', // elevation-toast
      popover: '0 12px 32px rgba(0,0,0,0.14)', // kept as an alias of `overlay` — old call sites still work
    },
    extend: {
      maxWidth: {
        prose: '68ch',
        page: '1200px',
      },
      zIndex: {
        header: '20',
        dropdown: '30',
        'modal-backdrop': '40',
        modal: '50',
        toast: '60',
      },
      ringColor: {
        focus: 'rgba(59, 130, 246, 0.25)', // ring-focus (blue-500 @ 25%)
      },
    },
  },
  plugins: [],
};

export default config;
