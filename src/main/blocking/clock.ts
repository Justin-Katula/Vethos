import { activeSessionAt, type ActiveSession, type BlockingRules } from './schedule'

/**
 * Horloge de réconciliation — le cœur du comportement « alarme ».
 *
 * Vethos ne restaure jamais une session sauvegardée. À intervalle régulier, et
 * immédiatement au réveil de veille ou au déverrouillage de session, il pose
 * une seule question — *selon les règles, un blocage devrait-il être actif
 * maintenant ?* — puis aligne la réalité sur la réponse.
 *
 * Cette conception est ce qui rend le blocage indifférent à ce qui s'est passé
 * entretemps : machine éteinte pendant le créneau, fenêtre fermée depuis des
 * heures, application relancée. Le verdict ne dépend que des règles et de
 * l'heure.
 *
 * Le module ne touche à aucune fenêtre : il émet des transitions. C'est au
 * contrôleur d'agir dessus.
 */

export type SessionSnapshot = {
  active: boolean
  blockedAppIds: string[]
  endsAt: number | null
}

export type SessionTransition =
  | { kind: 'started'; blockedAppIds: string[]; endsAt: number }
  | { kind: 'changed'; blockedAppIds: string[]; endsAt: number }
  | { kind: 'ended' }
  | { kind: 'none' }

const INACTIF: SessionSnapshot = { active: false, blockedAppIds: [], endsAt: null }

export function snapshotFrom(session: ActiveSession | null): SessionSnapshot {
  if (session === null) return { active: false, blockedAppIds: [], endsAt: null }
  return { active: true, blockedAppIds: session.blockedAppIds, endsAt: session.endsAt }
}

function memesApplications(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((valeur, index) => valeur === b[index])
}

export function diffSnapshots(
  previous: SessionSnapshot,
  next: SessionSnapshot,
): SessionTransition {
  if (!previous.active && !next.active) return { kind: 'none' }
  if (!previous.active && next.active) {
    return { kind: 'started', blockedAppIds: next.blockedAppIds, endsAt: next.endsAt ?? 0 }
  }
  if (previous.active && !next.active) return { kind: 'ended' }

  const identique =
    previous.endsAt === next.endsAt &&
    memesApplications(previous.blockedAppIds, next.blockedAppIds)
  if (identique) return { kind: 'none' }
  return { kind: 'changed', blockedAppIds: next.blockedAppIds, endsAt: next.endsAt ?? 0 }
}

export type ClockDeps = {
  readRules: () => Promise<BlockingRules>
  now: () => Date
  onTransition: (transition: SessionTransition, snapshot: SessionSnapshot) => void
  /** Journalise une lecture de règles impossible. Optionnel pour les tests. */
  onError?: (err: unknown) => void
}

export type ReconciliationClock = {
  start: (intervalMs?: number) => void
  stop: () => void
  tickNow: () => Promise<void>
  current: () => SessionSnapshot
}

export const DEFAULT_TICK_MS = 5_000

export function createReconciliationClock(deps: ClockDeps): ReconciliationClock {
  let snapshot: SessionSnapshot = INACTIF
  let timer: NodeJS.Timeout | null = null
  let enCours: Promise<void> | null = null

  async function evaluer(): Promise<void> {
    let rules: BlockingRules
    try {
      rules = await deps.readRules()
    } catch (err) {
      // Une lecture impossible ne doit jamais faire tomber le blocage en
      // panne : on garde l'état courant et on réessaiera au tic suivant.
      deps.onError?.(err)
      return
    }

    const suivant = snapshotFrom(activeSessionAt(rules, deps.now()))
    const transition = diffSnapshots(snapshot, suivant)
    snapshot = suivant
    if (transition.kind !== 'none') deps.onTransition(transition, suivant)
  }

  async function tickNow(): Promise<void> {
    // Un tic lent ne doit pas se faire doubler par le suivant : deux
    // évaluations concurrentes pourraient émettre des transitions dans le
    // désordre et laisser un état incohérent.
    if (enCours !== null) return enCours
    enCours = evaluer().finally(() => {
      enCours = null
    })
    return enCours
  }

  return {
    start(intervalMs = DEFAULT_TICK_MS) {
      if (timer !== null) return
      void tickNow()
      timer = setInterval(() => void tickNow(), intervalMs)
    },
    stop() {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    },
    tickNow,
    current: () => snapshot,
  }
}
