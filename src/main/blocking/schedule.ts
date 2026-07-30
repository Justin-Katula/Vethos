/**
 * Répond à la seule question dont dépend tout le mécanisme de blocage :
 * *selon les règles, une session devrait-elle être active maintenant ?*
 *
 * Vethos ne restaure jamais une session sauvegardée. À chaque réveil il pose
 * cette question et aligne la réalité sur la réponse. C'est ce qui lui permet
 * de se comporter comme une alarme : fenêtre fermée, machine sortie de veille
 * ou fraîchement redémarrée, le verdict ne dépend que des règles et de l'heure.
 *
 * La signature de `activeSessionAt` est volontairement la couture prévue pour
 * le futur moteur de planification : il se branchera derrière elle sans que la
 * machinerie de blocage change d'une ligne.
 *
 * Module pur : l'heure entre toujours en paramètre, jamais lue ici.
 */

export type RecurringSlot = {
  id: string
  label: string
  /** 0 = dimanche … 6 = samedi. */
  daysOfWeek: number[]
  /** Minutes depuis minuit, 0..1439. */
  startMinute: number
  /** Si `<= startMinute`, le créneau franchit minuit. */
  endMinute: number
  appIds: string[]
  /** Domaines bloqués pendant ce créneau. */
  blockedSites?: string[]
}

export type ManualSession = {
  startedAt: number
  endsAt: number
  appIds: string[]
  /** Domaines bloqués pendant cette session. */
  blockedSites?: string[]
}

export type BlockingRules = {
  slots: RecurringSlot[]
  manual: ManualSession | null
}

export type ActiveSession = {
  blockedAppIds: string[]
  /** Domaines bloqués, union de toutes les sources actives. */
  blockedSites: string[]
  endsAt: number
}

export function minutesSinceMidnight(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

const MINUTES_PAR_JOUR = 24 * 60

function estMinuteValide(valeur: number): boolean {
  return Number.isInteger(valeur) && valeur >= 0 && valeur < MINUTES_PAR_JOUR
}

/**
 * Un créneau mal formé n'est jamais actif.
 *
 * Deux formes invalides produisaient un blocage silencieux et intraçable :
 *
 * - `startMinute === endMinute` (ex. 10h00 → 10h00, faute de saisie banale)
 *   était interprété comme un franchissement de minuit, donc la condition
 *   `minute >= start || minute < end` devenait toujours vraie : **blocage
 *   permanent 24 h/24**, sans rien dans l'interface pour l'expliquer.
 * - une minute hors de 0..1439 (ex. `endMinute = 5000`) débordait dans
 *   `setMinutes` et produisait une **session de plusieurs jours**.
 *
 * On échoue du côté sûr : un créneau invalide ne bloque rien, plutôt que de
 * bloquer pour toujours. Exposé pour que l'interface puisse le signaler à la
 * saisie au lieu de laisser passer une règle qui ne se déclenchera jamais.
 */
export function isValidSlot(slot: RecurringSlot): boolean {
  if (!estMinuteValide(slot.startMinute)) return false
  if (!estMinuteValide(slot.endMinute)) return false
  // Durée nulle : rien à bloquer. Pour couvrir la journée entière, utiliser
  // 0 → 1439.
  if (slot.startMinute === slot.endMinute) return false
  return slot.daysOfWeek.every((jour) => Number.isInteger(jour) && jour >= 0 && jour <= 6)
}

/** Un créneau dont la fin est antérieure au début franchit minuit. */
function crossesMidnight(slot: RecurringSlot): boolean {
  return slot.endMinute < slot.startMinute
}

export function slotIsActiveAt(slot: RecurringSlot, now: Date): boolean {
  if (!isValidSlot(slot)) return false
  if (!slot.daysOfWeek.includes(now.getDay())) return false

  const minute = minutesSinceMidnight(now)
  // Bornes semi-ouvertes [start, end) : la minute de fin n'est plus active.
  if (crossesMidnight(slot)) {
    // 22h00 -> 02h00 : actif le soir à partir du début, et jusqu'à la fin au
    // petit matin. Le jour de la semaine est évalué sur le jour courant, pas
    // sur celui où le créneau a commencé.
    return minute >= slot.startMinute || minute < slot.endMinute
  }
  return minute >= slot.startMinute && minute < slot.endMinute
}

/**
 * Échéance absolue du créneau, en millisecondes epoch.
 *
 * Pour un créneau qui franchit minuit, la fin tombe le lendemain quand on est
 * dans sa portion du soir, et le jour même quand on est dans sa portion du
 * petit matin.
 */
function slotEndTimestamp(slot: RecurringSlot, now: Date): number {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  // setMinutes gère le débordement : minuit + 720 minutes donne bien 12h00.
  end.setMinutes(slot.endMinute)
  if (crossesMidnight(slot) && minutesSinceMidnight(now) >= slot.startMinute) {
    end.setDate(end.getDate() + 1)
  }
  return end.getTime()
}

function manualIsActiveAt(manual: ManualSession, now: Date): boolean {
  const stamp = now.getTime()
  return manual.startedAt <= stamp && stamp < manual.endsAt
}

/**
 * Fusionne toutes les sources actives : union dédoublonnée des applications,
 * et l'échéance la plus lointaine — la session ne se termine que lorsque plus
 * aucune règle ne s'applique.
 *
 * Renvoie `null` si rien n'est actif.
 */
export function activeSessionAt(rules: BlockingRules, now: Date): ActiveSession | null {
  const blockedAppIds = new Set<string>()
  const blockedSites = new Set<string>()
  let endsAt: number | null = null

  for (const slot of rules.slots) {
    if (!slotIsActiveAt(slot, now)) continue
    for (const appId of slot.appIds) blockedAppIds.add(appId)
    for (const site of slot.blockedSites ?? []) blockedSites.add(site)
    const slotEnd = slotEndTimestamp(slot, now)
    if (endsAt === null || slotEnd > endsAt) endsAt = slotEnd
  }

  const manual = rules.manual
  if (manual !== null && manualIsActiveAt(manual, now)) {
    for (const appId of manual.appIds) blockedAppIds.add(appId)
    for (const site of manual.blockedSites ?? []) blockedSites.add(site)
    if (endsAt === null || manual.endsAt > endsAt) endsAt = manual.endsAt
  }

  if (endsAt === null) return null
  return { blockedAppIds: [...blockedAppIds], blockedSites: [...blockedSites], endsAt }
}
