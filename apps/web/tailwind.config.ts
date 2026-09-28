import type { Config } from 'tailwindcss';

// Custom tokens only — deliberately not extending Tailwind's default
// slate/indigo palette or radius scale. See docs-free design rationale
// in the session that introduced this file: warm paper/ink base, one
// confident accent, flat hairline-bordered shapes instead of heavy
// shadows/large radii, system-native font stacks (no Google Fonts
// dependency — see globals.css).
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      paper: '#F6F2EA',
      'paper-raised': '#FBF8F2',
      ink: '#1B1812',
      'ink-muted': '#6B6354',
      'ink-faint': '#958C78',
      line: '#E2DACA',
      'line-strong': '#CFC3AA',
      accent: '#B8541F',
      'accent-hover': '#9C4418',
      'accent-soft': '#F1DCC9',
      'accent-ink': '#FFF7EF',
      danger: '#9C3B2E',
      'danger-soft': '#F3DCD6',
      success: '#3F6B4A',
      'success-soft': '#DCE8DD',
      warning: '#8A6A1E',
      'warning-soft': '#F1E4C3',
    },
    fontFamily: {
      display: ['var(--font-display)'],
      sans: ['var(--font-body)'],
      mono: ['var(--font-mono)'],
    },
    borderRadius: {
      none: '0px',
      sm: '3px',
      DEFAULT: '5px',
      md: '6px',
      lg: '8px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      popover: '0 8px 24px -8px rgba(27, 24, 18, 0.25)',
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
