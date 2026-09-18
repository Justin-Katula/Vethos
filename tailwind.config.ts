import type { Config } from 'tailwindcss'

/**
 * Le vocabulaire de l'interface.
 *
 * Ce qui n'est pas ici ne peut pas apparaître dans l'interface par accident.
 * Chaque nom pointe vers une variable de `globals.css` : le fichier CSS reste
 * la source unique des valeurs, celui-ci ne fait que les rendre nommables
 * depuis les classes.
 *
 * Un seul vocabulaire par chose. Le fond s'écrit `base`, jamais `bg` ; l'encre
 * s'écrit `fg`, jamais `text` — sinon la couleur de texte la plus courante
 * s'écrirait `text-text-2`, et le nom cesse de se lire. Les classes qui ne
 * respectaient pas ça (`bg-bg`, `text-text-3`) ne résolvaient rien du tout et
 * laissaient tout en blanc hérité.
 *
 * Aucun nom ne dit « clair » ou « sombre ». Les deux thèmes réécrivent les
 * mêmes variables (`globals.css`), donc les classes écrites ici marchent des
 * deux côtés sans variante `dark:`. Une classe `dark:` dans un composant serait
 * le signe qu'un jeton manque.
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
        fg: 'var(--text)',
        'fg-2': 'var(--text-2)',
        'fg-3': 'var(--text-3)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'accent-on': 'var(--accent-on)',
        'accent-soft': 'var(--accent-soft)',
        'grade-1': 'var(--grade-1)',
        'grade-2': 'var(--grade-2)',
        'grade-3': 'var(--grade-3)',
        'grade-4': 'var(--grade-4)',
        warn: 'var(--warn)',
        scrim: 'var(--scrim)',
      },
      /**
       * `text-accent` ne peut pas être le même rouge que `bg-accent`.
       *
       * Sur presque-noir, le rouge assez clair pour se LIRE (#F0525F) est trop
       * clair pour porter du blanc, et le rouge assez dense pour être REMPLI
       * (#CF1B29) est trop sombre pour se lire. Le clair n'a pas ce problème :
       * les deux jetons y valent #C1121F, donc rien ne bouge de ce côté.
       *
       * Surcharger `textColor` plutôt que renommer évite de toucher les ~25
       * `text-accent` déjà écrits : ils basculent sur le bon rouge tout seuls.
       */
      textColor: {
        accent: 'var(--accent-ink)',
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
        display: ['"Geist Variable"', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: {
        spring: 'var(--spring)',
        ease: 'var(--ease)',
      },
    },
  },
  plugins: [],
} satisfies Config
