import { create } from 'zustand'
import type { RuntimeCoordinatorPlanV2 } from '@shared/runtime-coordinator-model'

/**
 * Store en mémoire pour le plan de coordination runtime V2 (Point 9).
 *
 * Contrairement au store session-v2 (persisté), ce plan est *consultatif et dérivé* :
 * il est recalculé à la volée depuis le SessionPlanV2 actif via
 * `buildRuntimeCoordinatorPlanV2`, puis exposé ici pour le panneau debug dev.
 * Il ne pilote aucune opération système réelle (cf. runtime-coordinator-flags :
 * les `runtimeCoordinatorControls*` restent `false`).
 */
type RuntimeCoordinatorStore = {
  currentPlan: RuntimeCoordinatorPlanV2 | null
  setPlan: (plan: RuntimeCoordinatorPlanV2) => void
  clearPlan: () => void
}

export const useRuntimeCoordinatorStore = create<RuntimeCoordinatorStore>((set) => ({
  currentPlan: null,
  setPlan: (plan) => set({ currentPlan: plan }),
  clearPlan: () => set({ currentPlan: null }),
}))
