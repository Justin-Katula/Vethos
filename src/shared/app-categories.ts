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
