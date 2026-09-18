/**
 * Le thème : quatre façons de le décider, une seule façon de le calculer.
 *
 * Le mode est ce que l'utilisateur CHOISIT ; le thème est ce qui en RESSORT à
 * un instant donné. Les deux ne se confondent jamais : « suivre le système »
 * et « clair » peuvent donner le même écran ce matin et deux écrans différents
 * ce soir. Tout ce qui touche à l'apparence lit `resolveTheme`, jamais le mode
 * brut — sinon chaque appelant réinvente la règle du crépuscule et ils finissent
 * par ne plus être d'accord.
 *
 * Fichier partagé : le processus principal en a besoin AVANT que la fenêtre
 * existe (fond natif, barre de titre) et le renderer à chaque bascule.
 */

export const THEME_MODES = ['system', 'light', 'dark', 'schedule'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

/** Le résultat. Il n'y a que deux apparences, quelle que soit la façon d'y arriver. */
export type Theme = 'light' | 'dark'

export const DEFAULT_THEME_MODE: ThemeMode = 'system'
export const DEFAULT_LIGHT_AT = '07:00'
export const DEFAULT_DARK_AT = '19:00'

export type ThemeSchedule = {
  /** HH:MM — l'heure à partir de laquelle il fait clair. */
  lightAt: string
  /** HH:MM — l'heure à partir de laquelle il fait sombre. */
  darkAt: string
}

export type ThemeDecision = {
  mode: ThemeMode
  /** Ce que le système d'exploitation demande. Ignoré hors du mode `system`. */
  systemDark: boolean
  schedule: ThemeSchedule
}

const MINUTES_PER_DAY = 1440

/** `HH:MM` → minutes depuis minuit. `null` si la chaîne n'est pas une heure. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Vrai si `minute` tombe dans l'intervalle [start, end), en tournant par
 * minuit si besoin. `start === end` décrit un intervalle VIDE, pas la journée
 * entière : deux heures identiques veulent dire « il ne fait jamais clair »,
 * ce qui est au moins une réponse stable.
 */
function isWithin(minute: number, start: number, end: number): boolean {
  if (start === end) return false
  if (start < end) return minute >= start && minute < end
  return minute >= start || minute < end
}

/**
 * Le thème à appliquer maintenant.
 *
 * Une heure de bascule illisible ne fait pas planter l'écran : on retombe sur
 * les valeurs par défaut. Un réglage abîmé doit dégrader vers quelque chose de
 * regardable, pas vers un écran blanc.
 */
export function resolveTheme(decision: ThemeDecision, now: Date): Theme {
  switch (decision.mode) {
    case 'light':
      return 'light'
    case 'dark':
      return 'dark'
    case 'system':
      return decision.systemDark ? 'dark' : 'light'
    case 'schedule': {
      const lightAt = parseTimeOfDay(decision.schedule.lightAt) ?? parseTimeOfDay(DEFAULT_LIGHT_AT)!
      const darkAt = parseTimeOfDay(decision.schedule.darkAt) ?? parseTimeOfDay(DEFAULT_DARK_AT)!
      return isWithin(minuteOfDay(now), lightAt, darkAt) ? 'light' : 'dark'
    }
  }
}

/**
 * Le prochain instant où `resolveTheme` changerait d'avis tout seul.
 *
 * Seul le mode horaire a un futur prévisible : les trois autres ne bougent que
 * si quelque chose d'extérieur les pousse (l'utilisateur, ou le système). On
 * s'en sert pour poser UN minuteur exactement sur la bascule au lieu de
 * réinterroger l'horloge toutes les minutes pour ne rien apprendre.
 */
export function nextThemeFlip(decision: ThemeDecision, now: Date): Date | null {
  if (decision.mode !== 'schedule') return null

  const lightAt = parseTimeOfDay(decision.schedule.lightAt) ?? parseTimeOfDay(DEFAULT_LIGHT_AT)!
  const darkAt = parseTimeOfDay(decision.schedule.darkAt) ?? parseTimeOfDay(DEFAULT_DARK_AT)!
  // Deux heures identiques : plus aucune bascule ne viendra jamais.
  if (lightAt === darkAt) return null

  const current = minuteOfDay(now)
  const delay = (target: number): number => {
    const raw = target - current
    return raw > 0 ? raw : raw + MINUTES_PER_DAY
  }
  const minutes = Math.min(delay(lightAt), delay(darkAt))

  const flip = new Date(now)
  flip.setSeconds(0, 0)
  flip.setMinutes(flip.getMinutes() + minutes)
  return flip
}
