/**
 * first-week.ts
 *
 * Logique de la première semaine d'observation :
 * - Jours 1-3 : observer sans bloquer, logger les habitudes
 * - Jour 3 : présenter un résumé "Voici ce que j'ai appris"
 * - Jours 4-7 : blocage progressif (léger → moyen → strict)
 * - Jour 8+ : système pleinement actif
 */

export type FirstWeekPhase =
  | 'observation'     // Jours 1-3
  | 'summary'         // Jour 3 (afficher le résumé)
  | 'progressive'     // Jours 4-7
  | 'active'          // Jour 8+

export type ProgressiveLevel = 'light' | 'medium' | 'strict' | 'full'

/**
 * Calcule la phase actuelle de la première semaine.
 */
export function getFirstWeekPhase(firstLaunchDate: string | null): FirstWeekPhase {
  if (!firstLaunchDate) return 'active' // Si pas de date, on est en mode actif

  const first = new Date(firstLaunchDate)
  const now = new Date()
  const diffMs = now.getTime() - first.getTime()
  const daysSinceFirstLaunch = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (daysSinceFirstLaunch < 3) return 'observation'
  if (daysSinceFirstLaunch === 3) return 'summary'
  if (daysSinceFirstLaunch < 8) return 'progressive'
  return 'active'
}

/**
 * Pour les jours 4-7, retourne le niveau de blocage progressif.
 */
export function getProgressiveLevel(firstLaunchDate: string | null): ProgressiveLevel {
  if (!firstLaunchDate) return 'full'

  const first = new Date(firstLaunchDate)
  const now = new Date()
  const daysSinceFirstLaunch = Math.floor((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24))

  if (daysSinceFirstLaunch <= 4) return 'light'   // Jour 4 : léger
  if (daysSinceFirstLaunch <= 5) return 'medium'   // Jour 5 : moyen
  if (daysSinceFirstLaunch <= 7) return 'strict'   // Jours 6-7 : strict
  return 'full'                                     // Jour 8+ : plein
}

/**
 * Retourne les règles de blocage selon le niveau progressif.
 */
export function getBlockingRulesForLevel(level: ProgressiveLevel): {
  hostsEnabled: boolean
  processKillEnabled: boolean
  firewallEnabled: boolean
  antiBypassEnabled: boolean
  behaviorMonitorEnabled: boolean
} {
  switch (level) {
    case 'light':
      return {
        hostsEnabled: true,
        processKillEnabled: false,
        firewallEnabled: false,
        antiBypassEnabled: false,
        behaviorMonitorEnabled: false,
      }
    case 'medium':
      return {
        hostsEnabled: true,
        processKillEnabled: true,
        firewallEnabled: false,
        antiBypassEnabled: false,
        behaviorMonitorEnabled: true,
      }
    case 'strict':
      return {
        hostsEnabled: true,
        processKillEnabled: true,
        firewallEnabled: true,
        antiBypassEnabled: false,
        behaviorMonitorEnabled: true,
      }
    case 'full':
      return {
        hostsEnabled: true,
        processKillEnabled: true,
        firewallEnabled: true,
        antiBypassEnabled: true,
        behaviorMonitorEnabled: true,
      }
  }
}

/**
 * Messages à afficher selon la phase.
 */
export function getPhaseMessage(phase: FirstWeekPhase, dayNumber: number): {
  title: string
  subtitle: string
  emoji: string
} {
  switch (phase) {
    case 'observation':
      return {
        title: `Jour ${dayNumber} — Observation`,
        subtitle: 'Nexus observe tes habitudes en silence. Aucun blocage pour le moment.',
        emoji: '👀',
      }
    case 'summary':
      return {
        title: "Voici ce que j'ai appris",
        subtitle: 'Après 3 jours d\'observation, voici un résumé de tes habitudes.',
        emoji: '📊',
      }
    case 'progressive':
      return {
        title: `Jour ${dayNumber} — Blocage progressif`,
        subtitle: 'Le système devient plus strict progressivement. Tu t\'adaptes en douceur.',
        emoji: '🛡️',
      }
    case 'active':
      return {
        title: 'Système pleinement actif',
        subtitle: 'Toutes les protections sont activées. Tu es prêt.',
        emoji: '🔒',
      }
  }
}
