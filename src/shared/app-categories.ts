/**
 * Taxonomie des catégories d'applications.
 *
 * Vit dans `shared` parce que les trois mondes en ont besoin : le processus
 * principal pour classer, le preload pour typer le pont, le renderer pour
 * afficher les onglets. La *logique* de classement, elle, reste côté main
 * (`main/tracking/app-category.ts`) — seul le vocabulaire est partagé.
 */

export const APP_CATEGORIES = [
  'social',
  'games',
  'entertainment',
  'creativity',
  'education',
  'health',
  'reading',
  'productivity',
  'shopping',
  'travel',
  'utilities',
  'others',
] as const

export type AppCategory = (typeof APP_CATEGORIES)[number]

/**
 * Couleur de chaque catégorie, en classes Tailwind.
 *
 * Vit ici avec le libellé : une catégorie est reconnue d'abord à sa couleur,
 * et les séparer inviterait à ce que les deux divergent.
 */
/**
 * Douze teintes différentes, c'était un arc-en-ciel : l'œil ne pouvait rien en
 * tirer. On distingue désormais par la LUMINOSITÉ, et cette luminosité veut
 * dire quelque chose — plus une catégorie est claire, plus elle demande ton
 * attention quand tu essaies de travailler.
 */
const TIER = {
  /** Ce contre quoi tu te protèges. */
  distraction: 'border-grade-1/35 bg-grade-1/10 text-grade-1',
  /** Neutre : ni aide ni obstacle. */
  neutral: 'border-grade-2/30 bg-grade-2/8 text-grade-2',
  /** Ce qui sert ton travail. */
  productive: 'border-grade-3/35 bg-grade-3/10 text-grade-3',
  /** Le décor du système : présent, jamais saillant. */
  system: 'border-grade-4/40 bg-grade-4/10 text-grade-4',
} as const

export const CATEGORY_COLORS: Record<AppCategory, string> = {
  social: TIER.distraction,
  games: TIER.distraction,
  entertainment: TIER.distraction,
  shopping: TIER.distraction,
  creativity: TIER.neutral,
  travel: TIER.neutral,
  education: TIER.productive,
  health: TIER.productive,
  reading: TIER.productive,
  productivity: TIER.productive,
  utilities: TIER.system,
  others: TIER.system,
}

export const CATEGORY_LABELS: Record<AppCategory, string> = {
  social: 'Social',
  games: 'Jeux',
  entertainment: 'Divertissement',
  creativity: 'Création',
  education: 'Éducation',
  health: 'Santé & Sport',
  reading: 'Information & Lecture',
  productivity: 'Productivité & Finance',
  shopping: 'Achats & Cuisine',
  travel: 'Voyage',
  utilities: 'Utilitaires',
  others: 'Autres',
}
