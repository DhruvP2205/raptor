import type { Config } from 'tailwindcss';

// Monochrome-first system (black/white/gray + one restrained blue
// accent for links/focus only — never a colored primary button),
// single sans typeface for everything, hairline borders, small radii.
// Deliberately modeled on Vercel/Geist's actual visual language, not a
// generic "SaaS template" palette — see docs/DECISIONS.md D87 for why
// the first pass (warm cream/amber, serif headlines, badge-pill hero)
// got scrapped. Token *names* are unchanged from that first pass so
// every component file that already references them doesn't need
// touching — only the values moved.
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
