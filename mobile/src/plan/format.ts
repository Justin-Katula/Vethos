/**
 * Les trois formateurs, et rien d'autre.
 *
 * Ils vivent seuls parce que tout le monde en a besoin : la lecture du plan,
 * les phrases de signaux, les mesures, l'agenda. Laissés dans `lecture.ts`,
 * ils créaient un cycle — `lecture` appelait `signaux` pour la note d'un bloc,
 * et `signaux` rappelait `lecture` pour mettre une durée en français. Le cycle
 * tenait debout par chance (les déclarations de fonction sont hissées), et
 * serait tombé au premier `const` ajouté en tête de fichier.
 */

/**
 * Une clé « 2026-09-21 » vers une date LOCALE.
 *
 * `new Date('2026-09-21')` lit minuit UTC : à l'ouest de Greenwich, ce lundi-là
 * est encore un dimanche, et une ancre « en semaine » disparaît sans un mot.
 * On construit donc par composants, jamais par analyse de chaîne.
 */
export function dateLocale(cle: string): Date {
  const [a = 1970, m = 1, j = 1] = cle.split('-').map(Number)
  return new Date(a, m - 1, j)
}

export function enHeure(minute: number): string {
  if (minute === 1440) return '24:00'
  const valeur = Math.max(0, Math.round(minute))
  return `${String(Math.floor(valeur / 60) % 24).padStart(2, '0')}:${String(valeur % 60).padStart(2, '0')}`
}

export function duree(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  return h === 0 ? `${m} min` : m % 60 === 0 ? `${h} h` : `${h} h ${String(m % 60).padStart(2, '0')}`
}
