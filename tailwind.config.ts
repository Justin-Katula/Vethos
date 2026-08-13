import type { Config } from 'tailwindcss'

/**
 * Les tokens du hall des départs. Une seule échelle, un seul rouge.
 * Toute couleur qui n'est pas ici n'a pas sa place sur un panneau émaillé.
 */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hall: 'var(--hall)',
        panel: 'var(--panel)',
        'panel-lit': 'var(--panel-lit)',
        rail: 'var(--rail)',
        'rail-strong': 'var(--rail-strong)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        /* Le seul rouge : « maintenant » et « ça a changé ». Jamais décoratif. */
        signal: 'var(--signal)',
        'signal-lit': 'var(--signal-lit)',
        'signal-wash': 'var(--signal-wash)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        control: 'var(--radius-control)',
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        sweep: 'var(--ease-sweep)',
      },
    },
  },
  plugins: [],
} satisfies Config
