import { isUnlocked, type Unlock } from './unlock'

/**
 * Machine à états d'une application détectée pendant une session de blocage.
 *
 * Porte la donnée critique du mécanisme : l'application était-elle **déjà
 * lancée avant** le début de la session, ou lancée **pendant** ? Ce fait
 * conditionne l'avertissement de travail non sauvegardé du bouton Fermer, et
 * il doit être fiable — établi au moment de la détection, jamais reconstitué
 * après coup par approximation.
 *
 * L'autorité est l'heure de création du **processus** (`GetProcessTimes` côté
 * sidecar), pas l'apparition de la fenêtre : une application peut tourner
 * depuis longtemps et n'ouvrir sa fenêtre qu'après le début de la session.
 *
 * Module pur : l'heure entre toujours en paramètre.
 */

export type DetectedApp = {
  appId: string
  hwnd: string
  pid: number
  /** FILETIME décimal, en chaîne — 64 bits, hors de portée de `number`. */
  processCreatedAt: string
  preexisting: boolean
}

export type AppState =
  | { kind: 'blocked' }
  | { kind: 'unlocked'; until: number }
  | { kind: 'minimized' }

/** Convertit un FILETIME décimal en `bigint`, ou `null` s'il est inexploitable. */
function parseFileTime(raw: string): bigint | null {
  if (!/^\d+$/u.test(raw)) return null
  const value = BigInt(raw)
  // Le sidecar émet "0" quand OpenProcess échoue (processus élevé ou protégé).
  return value === 0n ? null : value
}

/**
 * Le processus tournait-il déjà avant le début de la session ?
 *
 * La comparaison passe par `BigInt` : un FILETIME vaut environ 1,33e17, très
 * au-delà de `Number.MAX_SAFE_INTEGER`. Converties en `number`, deux dates
 * distinctes deviennent égales et le verdict est faux.
 *
 * Une valeur inconnue ou illisible renvoie `false` : on ne peut rien affirmer,
 * donc on ne promet pas d'avertissement de sauvegarde qu'on ne saurait tenir.
 */
export function isPreexisting(processCreatedAt: string, sessionStartedAtFileTime: string): boolean {
  const created = parseFileTime(processCreatedAt)
  const started = parseFileTime(sessionStartedAtFileTime)
  if (created === null || started === null) return false
  return created < started
}

/** Fige le statut préexistant au moment de la détection. */
export function classifyDetection(args: {
  appId: string
  hwnd: string
  pid: number
  processCreatedAt: string
  sessionStartedAtFileTime: string
}): DetectedApp {
  return {
    appId: args.appId,
    hwnd: args.hwnd,
    pid: args.pid,
    processCreatedAt: args.processCreatedAt,
    preexisting: isPreexisting(args.processCreatedAt, args.sessionStartedAtFileTime),
  }
}

/**
 * État courant d'une application détectée.
 *
 * L'ordre de priorité est volontaire : un déblocage accordé prime sur la
 * minimisation, sinon une application qu'on vient de débloquer resterait
 * masquée et le déblocage n'aurait aucun effet visible.
 */
export function deriveAppState(args: {
  app: DetectedApp
  unlock: Unlock | undefined
  minimized: boolean
  now: number
}): AppState {
  const unlock = args.unlock
  if (unlock !== undefined && isUnlocked(unlock, args.now)) {
    return { kind: 'unlocked', until: unlock.until }
  }
  if (args.minimized) return { kind: 'minimized' }
  return { kind: 'blocked' }
}

/**
 * Faut-il avertir d'un travail non sauvegardé avant de fermer ?
 *
 * Uniquement si l'application était réellement préexistante à la session. Si
 * elle a été lancée pendant, l'utilisateur n'a jamais pu s'en servir — il n'y
 * a rien à perdre et l'avertissement serait du bruit.
 *
 * Fonction nommée plutôt qu'un accès direct au champ, pour que l'intention
 * soit lisible au point d'appel et testée pour elle-même.
 */
export function needsSaveWarning(app: DetectedApp): boolean {
  return app.preexisting
}
