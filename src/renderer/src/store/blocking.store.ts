import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { BlockingRulesState, RecurringSlot } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

/**
 * Règles de blocage et état de session.
 *
 * L'état de session n'est jamais calculé ici : il est décidé par l'horloge du
 * processus principal, qui continue de tourner fenêtre fermée. L'interface se
 * contente de le lire et de l'afficher — une seule source de vérité.
 *
 * Les modifications de règles ne raccourcissent jamais une session en cours.
 * Sans cette règle, éditer un créneau deviendrait un bouton « Arrêter »
 * déguisé, et tout le mécanisme s'effondrerait.
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
/** Plafond : 12 h. Au-delà on approcherait d'une journée entière, où début et fin se rejoignent. */
export const MAX_DURATION_MINUTES = 12 * 60

export type SlotDraft = {
  id?: string
  label: string
  daysOfWeek: number[]
  startMinute: number
  endMinute: number
  appIds: string[]
}

/**
 * Résultat d'un enregistrement.
 *
 * Le champ `field` permet à l'interface d'afficher l'erreur À CÔTÉ de ce qui
 * cloche plutôt que dans un message flottant : l'ancienne version fermait le
 * formulaire et affichait l'erreur après coup, ce qui obligeait à tout
 * ressaisir.
 */
export type SaveResult =
  | { ok: true }
  | { ok: false; field: 'label' | 'apps' | 'days' | 'duration'; message: string }

type BlockingStore = {
  loaded: boolean
  slots: RecurringSlot[]
  session: SessionState
  load: () => Promise<void>
  saveSlot: (draft: SlotDraft) => Promise<SaveResult>
  deleteSlot: (id: string) => Promise<void>
  startManualSession: (appIds: string[], durationMinutes: number) => Promise<SaveResult>
  setSession: (session: SessionState) => void
}

function uuid(): string {
  return crypto.randomUUID()
}

/** Validation miroir de celle du schéma — attrape la saisie avant le disque. */
function slotError(draft: SlotDraft): SaveResult {
  if (draft.label.trim().length === 0) {
    return { ok: false, field: 'label', message: 'Donne un nom à ce créneau.' }
  }
  if (draft.appIds.length === 0) {
    return { ok: false, field: 'apps', message: 'Choisis au moins une application à bloquer.' }
  }
  if (draft.daysOfWeek.length === 0) {
    return { ok: false, field: 'days', message: 'Choisis au moins un jour.' }
  }
  if (draft.startMinute === draft.endMinute) {
    return {
      ok: false,
      field: 'duration',
      message: 'Une durée nulle bloquerait en permanence. Allonge la durée.',
    }
  }
  return { ok: true }
}

async function persist(slots: RecurringSlot[], manual: BlockingRulesState['manual']): Promise<void> {
  const state: BlockingRulesState = { slots, manual }
  try {
    const result = await nexus.storage.write('blocking_rules', state)
    assertStorageWrite(result, 'blocking_rules')
  } catch (err) {
    useToastStore.getState().push({
      variant: 'error',
      title: 'Sauvegarde des règles échouée',
      description: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export const useBlockingStore = create<BlockingStore>((set, get) => ({
  loaded: false,
  slots: [],
  session: SESSION_INACTIVE,

  async load() {
    const [stored, session] = await Promise.all([
      nexus.storage.read<BlockingRulesState>('blocking_rules'),
      nexus.blocking.getSession(),
    ])
    set({ loaded: true, slots: stored?.slots ?? [], session: session ?? SESSION_INACTIVE })
  },

  async saveSlot(draft) {
    // On rend l'erreur au lieu de la crier : l'appelant garde le formulaire
    // ouvert et l'affiche à côté du champ fautif.
    const validation = slotError(draft)
    if (!validation.ok) return validation

    const slot: RecurringSlot = {
      id: draft.id ?? uuid(),
      label: draft.label.trim(),
      daysOfWeek: [...draft.daysOfWeek].sort((a, b) => a - b),
      startMinute: draft.startMinute,
      endMinute: draft.endMinute,
      appIds: draft.appIds,
    }

    const existing = get().slots
    const slots = existing.some((s) => s.id === slot.id)
      ? existing.map((s) => (s.id === slot.id ? slot : s))
      : [...existing, slot]

    await persist(slots, null)
    set({ slots })

    if (get().session.active) {
      useToastStore.getState().push({
        variant: 'info',
        title: 'Enregistré — effet à la prochaine session',
        description: 'Une session est en cours : elle ne peut pas être raccourcie.',
      })
    }
    return { ok: true }
  },

  async deleteSlot(id) {
    const slots = get().slots.filter((s) => s.id !== id)
    await persist(slots, null)
    set({ slots })
    if (get().session.active) {
      useToastStore.getState().push({
        variant: 'info',
        title: 'Supprimé — la session en cours continue',
        description: 'Retirer un créneau ne lève pas un blocage déjà commencé.',
      })
    }
  },

  async startManualSession(appIds, durationMinutes) {
    if (appIds.length === 0) {
      return { ok: false, field: 'apps', message: 'Choisis au moins une application à bloquer.' }
    }
    if (durationMinutes < MIN_DURATION_MINUTES) {
      return {
        ok: false,
        field: 'duration',
        message: `La durée minimale est de ${MIN_DURATION_MINUTES} minutes.`,
      }
    }
    const startedAt = Date.now()
    await persist(get().slots, {
      startedAt,
      endsAt: startedAt + durationMinutes * 60_000,
      appIds,
    })
    return { ok: true }
  },

  setSession(session) {
    set({ session })
  },
}))
