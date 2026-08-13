import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ONBOARDING_STEPS, useOnboardingStore, type OnboardingStep } from '@/store/onboarding.store'
import { WelcomeStep } from './WelcomeStep'
import { UsernameStep } from './UsernameStep'
import { DonePage } from './DonePage'

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: 'Bienvenue',
  username: 'Toi',
  done: 'Terminé',
}

const VISIBLE_STEPS: OnboardingStep[] = ONBOARDING_STEPS.filter(
  (s) => s !== 'done',
) as OnboardingStep[]

export function OnboardingOverlay(): JSX.Element {
  const step = useOnboardingStore((s) => s.step)
  const next = useOnboardingStore((s) => s.next)
  const prev = useOnboardingStore((s) => s.prev)
  const skip = useOnboardingStore((s) => s.skip)
  const finish = useOnboardingStore((s) => s.finish)

  const currentIdx = useMemo(() => VISIBLE_STEPS.indexOf(step), [step])
  const isFirstVisible = currentIdx <= 0
  const isLastVisible = currentIdx === VISIBLE_STEPS.length - 1
  const isDone = step === 'done'

  const progress = step === 'done' ? 1 : (currentIdx + 1) / VISIBLE_STEPS.length

  const handleNext = async (): Promise<void> => {
    if (isLastVisible) {
      await finish()
    } else {
      next()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // Dès que la sortie commence, le voile cesse d'intercepter les clics.
      // Sans cela, une animation qui traîne laisse un écran invisible par-dessus
      // l'application : on voit l'interface, rien ne répond.
      exit={{ opacity: 0, pointerEvents: 'none' }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] flex flex-col bg-base/95 backdrop-blur-md"
    >
      {!isDone && (
        <header className="flex items-center justify-between gap-6 border-b border-line px-10 py-5">
          <div className="flex flex-1 items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-fg-3">
              Onboarding
            </span>
            <div className="flex flex-1 items-center gap-1.5">
              {VISIBLE_STEPS.map((s, i) => {
                const reached = i <= currentIdx
                return (
                  <div
                    key={s}
                    className={cn(
                      'h-1 flex-1 rounded transition-colors duration-300',
                      reached ? 'bg-fg' : 'bg-line',
                    )}
                  />
                )
              })}
            </div>
            <span className="tabular-nums text-xs text-fg-3">{Math.round(progress * 100)}%</span>
          </div>
          <button
            type="button"
            onClick={() => void skip()}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-fg-2 hover:bg-surface hover:text-fg"
          >
            <X size={14} />
            Passer
          </button>
        </header>
      )}

      <main className="flex flex-1 items-center justify-center overflow-y-auto px-10 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full max-w-3xl flex-col"
          >
            {step === 'welcome' && <WelcomeStep onContinue={next} />}
            {step === 'username' && <UsernameStep />}
            {step === 'done' && <DonePage />}
          </motion.div>
        </AnimatePresence>
      </main>

      {!isDone && (
        <footer className="flex items-center justify-between border-t border-line px-10 py-5">
          <button
            type="button"
            onClick={prev}
            disabled={isFirstVisible}
            className={cn(
              'inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors',
              isFirstVisible
                ? 'cursor-not-allowed text-fg-3 opacity-40'
                : 'text-fg-2 hover:bg-surface hover:text-fg',
            )}
          >
            <ArrowLeft size={16} />
            Précédent
          </button>

          <span className="text-xs text-fg-3">
            Étape {currentIdx + 1} sur {VISIBLE_STEPS.length} ·{' '}
            <span className="text-fg-2">{STEP_LABELS[step]}</span>
          </span>

          <button
            type="button"
            onClick={() => void handleNext()}
            className="inline-flex items-center gap-2 rounded bg-fg px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white"
          >
            {isLastVisible ? (
              <>
                <Check size={16} strokeWidth={3} />
                Terminer
              </>
            ) : (
              <>
                Suivant
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </footer>
      )}
    </motion.div>
  )
}
