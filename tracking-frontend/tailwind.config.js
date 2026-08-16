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
        sans: ['Vazirmatn', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // Slightly tightened tracking on the large sizes; default Tailwind
        // display sizes read loose at these weights.
        'display': ['2rem', { lineHeight: '2.375rem', letterSpacing: '-0.02em' }],
        'metric': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],
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
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
