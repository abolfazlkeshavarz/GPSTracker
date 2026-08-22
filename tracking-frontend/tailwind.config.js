/** @type {import('tailwindcss').Config} */

// Tokens live in src/styles/tokens.css as "R G B" triplets; this exposes them
// as Tailwind colours so opacity modifiers (bg-surface/60) keep working.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Driven by data-theme on <html>, which the theme toggle sets. Using a
  // selector rather than "media" so the in-app control can override the OS.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: token('page'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-raised'),
          sunken: token('surface-sunken'),
          inverse: token('surface-inverse'),
        },
        content: {
          DEFAULT: token('text-primary'),
          secondary: token('text-secondary'),
          muted: token('text-muted'),
          inverse: token('text-inverse'),
        },
        line: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        brand: {
          DEFAULT: token('brand'),
          hover: token('brand-hover'),
          subtle: token('brand-subtle'),
          ink: token('brand-ink'),
        },
        series: {
          1: token('series-1'),
          2: token('series-2'),
          3: token('series-3'),
          4: token('series-4'),
          5: token('series-5'),
          6: token('series-6'),
        },
        status: {
          good: token('status-good'),
          warning: token('status-warning'),
          serious: token('status-serious'),
          critical: token('status-critical'),
          'good-bg': token('status-good-bg'),
          'warning-bg': token('status-warning-bg'),
          'serious-bg': token('status-serious-bg'),
          'critical-bg': token('status-critical-bg'),
        },
      },
      boxShadow: {
        glow: 'var(--glow-brand)',
        'glow-good': 'var(--glow-good)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      borderRadius: {
        card: '14px',
        control: '10px',
      },
      fontFamily: {
        // Inter for Latin, Vazirmatn for Persian. Inter first so Latin text
        // gets its tighter metrics; Vazirmatn covers the Arabic-script range
        // Inter does not. Both are self-hosted — the production CSP blocks
        // external font hosts, so Google Fonts is not an option.
        sans: ['InterVariable', 'Inter', 'Vazirmatn', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Inter precision scale: negative tracking on display sizes, positive
        // on small uppercase labels. Inter set at default tracking reads loose
        // at large sizes and cramped at label sizes.
        'display': ['1.9375rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em', fontWeight: '650' }],
        'title': ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],
        'metric': ['1.75rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }],
        'metric-lg': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.03em' }],
        'label': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],
      },
      spacing: {
        // Density 8/10 (dashboard): the 8-32px rhythm the design system asks
        // for, as named steps so pages stop picking arbitrary values.
        'gutter': '1rem',
        'gutter-lg': '1.5rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        // Standard motion tier (300-450ms) with a slight overshoot, applied
        // as a CSS stagger rather than pulling in an animation library.
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(10px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'rise-in': 'rise-in 400ms cubic-bezier(0.22, 1, 0.36, 1) both',
        sweep: 'sweep 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
