/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: 'oklch(0.22 0.02 270)',
        'ink-2': 'oklch(0.42 0.02 270)',
        'ink-3': 'oklch(0.62 0.015 270)',
        line: 'oklch(0.92 0.008 270)',
        'line-2': 'oklch(0.86 0.01 270)',
        surface: 'oklch(1 0 0)',
        'surface-2': 'oklch(0.97 0.006 80)',
        bg: 'oklch(0.985 0.005 80)',

        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',

        'emerald-status': 'oklch(0.66 0.13 152)',
        'amber-status': 'oklch(0.74 0.13 70)',
        'rose-status': 'oklch(0.65 0.18 18)',
        'sky-status': 'oklch(0.70 0.12 230)',

        'recorder-bg': 'oklch(0.16 0.04 280)',
        'recorder-fg': 'oklch(0.97 0.01 270)',
      },
      boxShadow: {
        sm: '0 1px 2px oklch(0.20 0.02 270 / 0.05)',
        DEFAULT:
          '0 6px 24px -10px oklch(0.20 0.02 270 / 0.16), 0 1px 2px oklch(0.20 0.02 270 / 0.04)',
        lg: '0 24px 60px -22px oklch(0.20 0.02 270 / 0.30), 0 2px 6px oklch(0.20 0.02 270 / 0.06)',
        accent: '0 6px 16px -8px var(--accent), inset 0 0 0 1px oklch(1 0 0 / 0.18)',
        'accent-hover': '0 10px 24px -10px var(--accent)',
      },
      borderRadius: {
        card: '12px',
        hero: '18px',
        btn: '9px',
        pill: '999px',
      },
      keyframes: {
        'ma-pulse': {
          '0%,100%': { boxShadow: '0 0 0 0 currentColor', opacity: '1' },
          '70%': { boxShadow: '0 0 0 8px transparent', opacity: '.6' },
        },
        'ma-ring': {
          '0%': { transform: 'scale(.5)', opacity: '.6' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'ma-rec-pulse': {
          '0%': { transform: 'scale(.85)', opacity: '.9' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(.85)', opacity: '0' },
        },
        'ma-drift': {
          '0%': { transform: 'translate(0,0) scale(1)' },
          '100%': { transform: 'translate(40px,30px) scale(1.1)' },
        },
        'ma-fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'ma-fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'ma-slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-6px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'ma-pop': {
          '0%': { transform: 'scale(.4)', opacity: '0' },
          '60%': { transform: 'scale(1.12)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'ma-burst': {
          '0%': {
            transform: 'rotate(var(--angle)) translateY(0) scale(.4)',
            opacity: '0',
          },
          '20%': { opacity: '1' },
          '100%': {
            transform: 'rotate(var(--angle)) translateY(-110px) scale(1)',
            opacity: '0',
          },
        },
        'ma-caret': {
          '0%,100%': { opacity: '0' },
          '50%': { opacity: '1' },
        },
        'ma-draw': {
          to: { strokeDashoffset: '0' },
        },
        'ma-draw-edge': {
          to: { strokeDashoffset: '0' },
        },
        'ma-shimmer': {
          '0%': { backgroundPosition: '-100% 0' },
          '100%': { backgroundPosition: '100% 0' },
        },
        'ma-node-in': {
          '0%': { opacity: '0', transform: 'scale(.5)' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'ma-check-pop': {
          '0%': { transform: 'scale(.8)' },
          '60%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'ma-pulse': 'ma-pulse 1.6s ease-out infinite',
        'ma-ring': 'ma-ring 1.6s ease-out infinite',
        'ma-rec-pulse': 'ma-rec-pulse 2.4s ease-out infinite',
        'ma-drift': 'ma-drift 18s ease-in-out infinite alternate',
        'ma-fade-up': 'ma-fade-up .45s ease-out both',
        'ma-fade-in': 'ma-fade-in .35s ease-out both',
        'ma-slide-in': 'ma-slide-in .4s ease-out both',
        'ma-pop': 'ma-pop .6s cubic-bezier(0.34,1.56,0.64,1)',
        'ma-burst': 'ma-burst 1.1s cubic-bezier(0.16,0.78,0.30,1) forwards',
        'ma-caret': 'ma-caret 1s steps(2) infinite',
        'ma-draw': 'ma-draw .7s ease-out forwards',
        'ma-draw-edge': 'ma-draw-edge 1s ease-out forwards',
        'ma-shimmer': 'ma-shimmer 1.4s ease-in-out infinite',
        'ma-node-in': 'ma-node-in .5s cubic-bezier(0.34,1.56,0.64,1) forwards',
        'ma-check-pop': 'ma-check-pop .35s cubic-bezier(0.34,1.56,0.64,1)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        smooth: 'cubic-bezier(0.16, 0.78, 0.30, 1)',
      },
    },
  },
  plugins: [],
}
