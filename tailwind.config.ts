import type { Config } from 'tailwindcss'

/**
 * Noir, gris, blanc. Aucune autre couleur n'est exposée : ce qui n'est pas
 * ici ne peut pas apparaître dans l'interface par accident.
 */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        // `fg` plutôt que `text` : sinon chaque couleur de texte s'écrirait
        // `text-text-2`, et le nom cesse de se lire.
        fg: 'var(--text)',
        'fg-2': 'var(--text-2)',
        'fg-3': 'var(--text-3)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-glow': 'var(--accent-glow)',
      },
      borderColor: {
        DEFAULT: 'var(--line)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r-md)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        lift: 'var(--lift)',
        'lift-high': 'var(--lift-high)',
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        spring: 'var(--spring)',
        ease: 'var(--ease)',
      },
    },
  },
  plugins: [],
} satisfies Config
