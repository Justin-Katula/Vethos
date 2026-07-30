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
export const CATEGORY_COLORS: Record<AppCategory, string> = {
  social: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  games: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  entertainment: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
  creativity: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  education: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  health: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  reading: 'border-teal-500/40 bg-teal-500/10 text-teal-300',
  productivity: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  shopping: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  travel: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  utilities: 'border-zinc-600/60 bg-zinc-600/10 text-zinc-300',
  others: 'border-zinc-700/60 bg-zinc-700/10 text-zinc-400',
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
