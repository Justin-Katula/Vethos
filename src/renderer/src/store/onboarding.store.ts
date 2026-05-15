import { create } from 'zustand'
import { useSettingsStore } from './settings.store'

export const ONBOARDING_STEPS = [
  'welcome',
  'username',
  'schedule',
  'objective',
  'done',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

type OnboardingStore = {
  step: OnboardingStep
  /** True une fois `finish()` appelé pour déclencher l'écran "done" transitoire. */
  finishing: boolean
  next: () => void
  prev: () => void
  jumpTo: (s: OnboardingStep) => void
  /** Skip = marquer comme terminé sans poser le drapeau "finishing". */
  skip: () => Promise<void>
  /** Finish = afficher l'écran "done" puis marquer comme terminé. */
  finish: () => Promise<void>
  /** Réouvrir l'onboarding (depuis Settings). */
  restart: () => Promise<void>
}

function indexOf(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step)
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  step: 'welcome',
  finishing: false,

  next() {
    set((s) => {
      const i = indexOf(s.step)
      const nextStep = ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)]!
      return { step: nextStep }
    })
  },

  prev() {
    set((s) => {
      const i = indexOf(s.step)
      const prevStep = ONBOARDING_STEPS[Math.max(i - 1, 0)]!
      return { step: prevStep }
    })
  },

  jumpTo(s) {
    set({ step: s })
  },

  async skip() {
    await useSettingsStore.getState().setOnboardingCompleted(true)
    set({ step: 'welcome', finishing: false })
  },

  async finish() {
    // Affiche d'abord la DonePage pour l'anim ; persiste après 1.5s
    set({ step: 'done', finishing: true })
    await new Promise((r) => setTimeout(r, 1500))
    await useSettingsStore.getState().setOnboardingCompleted(true)
    set({ finishing: false })
  },

  async restart() {
    await useSettingsStore.getState().setOnboardingCompleted(false)
    set({ step: 'welcome', finishing: false })
  },
}))
