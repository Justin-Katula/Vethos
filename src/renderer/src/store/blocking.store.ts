import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { BlockingRulesState } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

/**
 * Sessions de blocage.
 *
 * Une session est **ponctuelle** : elle se lance une fois, elle se termine, et
 * c'est tout. La récurrence hebdomadaire n'appartient pas à cette page — elle
 * relève d'un autre mécanisme, et le moteur (`main/blocking/schedule.ts`) la
 * gère déjà côté modèle pour quand ce mécanisme arrivera.
 *
 * L'état de session n'est jamais calculé ici : il est décidé par l'horloge du
 * processus principal, qui continue de tourner fenêtre fermée. L'interface le
 * lit et l'affiche — une seule source de vérité.
 */

export type SessionState = {
  active: boolean
  blockedAppIds: string[]
  endsAt: number | null
}

const SESSION_INACTIVE: SessionState = { active: false, blockedAppIds: [], endsAt: null }

/** Plancher de durée : en dessous, un blocage n'a pas le temps de servir. */
export const MIN_DURATION_MINUTES = 30
/** Pas de réglage, pour la durée comme pour l'heure de départ différée. */
export const DURATION_STEP_MINUTES = 15
/** Plafond : 12 h. */
export const MAX_DURATION_MINUTES = 12 * 60

export type SaveResult = { ok: true } | { ok: false; field: 'apps' | 'duration'; message: string }

export type SessionDraft = {
  appIds: string[]
  durationMinutes: number
  /** Minutes depuis minuit, ou `null` pour démarrer immédiatement. */
  startMinute: number | null
}

type BlockingStore = {
  loaded: boolean
  session: SessionState
  /** Session programmée mais pas encore commencée, s'il y en a une. */
  pending: { startedAt: number; endsAt: number; appIds: string[] } | null
  load: () => Promise<void>
  startSession: (draft: SessionDraft) => Promise<SaveResult>
  cancelPending: () => Promise<void>
  setSession: (session: SessionState) => void
}

/**
 * Instant de départ absolu à partir d'une heure de la journée.
 *
 * Si l'heure choisie est déjà passée aujourd'hui, on vise demain : c'est la
 * seule lecture qui ne surprenne pas. Choisir 8 h à 14 h ne peut pas vouloir
 * dire « il y a six heures ».
 */
export function resolveStartAt(startMinute: number | null, now: Date): number {
  if (startMinute === null) return now.getTime()
  const cible = new Date(now)
  cible.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0)
  if (cible.getTime() <= now.getTime()) cible.setDate(cible.getDate() + 1)
  return cible.getTime()
}

async function persist(manual: BlockingRulesState['manual']): Promise<void> {
  // `slots` reste vide : la récurrence n'est pas pilotée depuis cette page.
  const state: BlockingRulesState = { slots: [], manual }
  try {
    const result = await nexus.storage.write('blocking_rules', state)
    assertStorageWrite(result, 'blocking_rules')
  } catch (err) {
    useToastStore.getState().push({
      variant: 'error',
      title: 'Sauvegarde du blocage échouée',
      description: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export const useBlockingStore = create<BlockingStore>((set, get) => ({
  loaded: false,
  session: SESSION_INACTIVE,
  pending: null,

  async load() {
    const [stored, session] = await Promise.all([
      nexus.storage.read<BlockingRulesState>('blocking_rules'),
      nexus.blocking.getSession(),
    ])
    const manual = stored?.manual ?? null
    const pasEncoreCommencee = manual !== null && manual.startedAt > Date.now()
    set({
      loaded: true,
      session: session ?? SESSION_INACTIVE,
      pending: pasEncoreCommencee ? manual : null,
    })
  },

  async startSession(draft) {
    // On rend l'erreur au lieu de la crier : l'appelant garde le formulaire
    // ouvert et l'affiche à côté du champ fautif.
    if (draft.appIds.length === 0) {
      return { ok: false, field: 'apps', message: 'Choisis au moins une application à bloquer.' }
    }
    if (draft.durationMinutes < MIN_DURATION_MINUTES) {
      return {
        ok: false,
        field: 'duration',
        message: `La durée minimale est de ${MIN_DURATION_MINUTES} minutes.`,
      }
    }

    const startedAt = resolveStartAt(draft.startMinute, new Date())
    const manual = {
      startedAt,
      endsAt: startedAt + draft.durationMinutes * 60_000,
      appIds: draft.appIds,
    }
    await persist(manual)
    set({ pending: startedAt > Date.now() ? manual : null })
    return { ok: true }
  },

  async cancelPending() {
    // Annuler une session PAS ENCORE commencée est légitime : rien ne bloque
    // encore. Une session en cours, elle, ne s'annule pas depuis ici.
    if (get().session.active) return
    await persist(null)
    set({ pending: null })
  },

  setSession(session) {
    set({ session })
  },
}))
