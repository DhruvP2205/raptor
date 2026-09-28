import type { Config } from 'tailwindcss';

// Black/white/gray base (chrome, buttons, borders, text) with a wider
// set of saturated status/accent hues (violet, teal, rose, plus the
// original blue/success/warning/danger) reserved for things that
// genuinely vary — event phase, badges, the hero's background treatment
// — never the UI chrome itself. See docs/DECISIONS.md D87 (why the
// first, warm-pastel pass got scrapped for being templated) and D89
// (why pure monochrome then read as flat, and color came back in a
// targeted way). Token *names* are stable across all three passes so
// component files don't need touching when only values move.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      paper: '#ffffff',
      'paper-raised': '#fafafa',
      ink: '#0a0a0a',
      'ink-muted': '#666666',
      'ink-faint': '#8f8f8f',
      line: '#eaeaea',
      'line-strong': '#d4d4d4',
      accent: '#0070f3',
      'accent-hover': '#0761d1',
      'accent-soft': '#eaf3ff',
      'accent-ink': '#ffffff',
      danger: '#e5484d',
      'danger-soft': '#feeced',
      success: '#12805c',
      'success-soft': '#e6f6f0',
      warning: '#b36b00',
      'warning-soft': '#fef3e2',
      violet: '#7c3aed',
      'violet-soft': '#f3ebfe',
      teal: '#0d9488',
      'teal-soft': '#e3f7f4',
      rose: '#e11d6f',
      'rose-soft': '#fdeaf2',
    },
    fontFamily: {
      display: ['var(--font-display)'],
      sans: ['var(--font-body)'],
      mono: ['var(--font-mono)'],
    },
    borderRadius: {
      none: '0px',
      sm: '4px',
      DEFAULT: '6px',
      md: '8px',
      lg: '10px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      popover: '0 12px 32px -12px rgba(0, 0, 0, 0.28)',
    },
    extend: {
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
};

export default config;
