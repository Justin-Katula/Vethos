import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import {
  ONBOARDING_STEPS,
  useOnboardingStore,
  type OnboardingStep,
} from '@/store/onboarding.store'
import { WelcomeStep } from './WelcomeStep'
import { UsernameStep } from './UsernameStep'
import { ScheduleStep } from './ScheduleStep'
import { ObjectiveStep } from './ObjectiveStep'
import { DonePage } from './DonePage'
import { useToast } from '@/lib/use-toast'

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: 'Bienvenue',
  username: 'Toi',
  schedule: 'Programme',
  objective: 'Objectif',
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
  const toast = useToast()
  const stepCommitRef = useRef<(() => Promise<boolean>) | null>(null)

  // Données capturées pendant l'onboarding et utilisées entre étapes
  const [captured, setCaptured] = useState<{
    templateRuleIds: string[]
    objectiveColor: string | null
    objectiveId: string | null
  }>({ templateRuleIds: [], objectiveColor: null, objectiveId: null })

  const currentIdx = useMemo(() => VISIBLE_STEPS.indexOf(step), [step])
  const isFirstVisible = currentIdx <= 0
  const isLastVisible = currentIdx === VISIBLE_STEPS.length - 1
  const isDone = step === 'done'

  const progress =
    step === 'done' ? 1 : (currentIdx + 1) / VISIBLE_STEPS.length

  useEffect(() => {
    stepCommitRef.current = null
  }, [step])

  const registerStepCommit = useCallback((commit: () => Promise<boolean>) => {
    stepCommitRef.current = commit
  }, [])

  const commitCurrentStep = async (): Promise<boolean> => {
    const commit = stepCommitRef.current
    if (!commit) return true
    try {
      return await commit()
    } catch (err) {
      toast.error({
        title: 'Sauvegarde impossible',
        description: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  const handleNext = async (): Promise<void> => {
    if (!(await commitCurrentStep())) return
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
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] flex flex-col bg-bg-base/95 backdrop-blur-md"
    >
      {!isDone && (
        <header className="flex items-center justify-between gap-6 border-b border-border-subtle px-10 py-5">
          <div className="flex flex-1 items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Onboarding
            </span>
            <div className="flex flex-1 items-center gap-1.5">
              {VISIBLE_STEPS.map((s, i) => {
                const reached = i <= currentIdx
                return (
                  <div
                    key={s}
                    className={cn(
                      'h-1 flex-1 rounded-2xl transition-colors duration-300',
                      reached ? 'bg-accent' : 'bg-border-subtle',
                    )}
                  />
                )
              })}
            </div>
            <span className="tabular-nums text-xs text-text-muted">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void skip()}
          >
            <X size={14} />
            Passer
          </Button>
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
            {step === 'username' && <UsernameStep registerCommit={registerStepCommit} />}
            {step === 'schedule' && (
              <ScheduleStep
                registerCommit={registerStepCommit}
                onTemplateApplied={(ruleIds) =>
                  setCaptured((c) => ({ ...c, templateRuleIds: ruleIds }))
                }
              />
            )}
            {step === 'objective' && (
              <ObjectiveStep
                registerCommit={registerStepCommit}
                preselectedRuleIds={captured.templateRuleIds}
                onObjectiveCreated={(id, color) =>
                  setCaptured((c) => ({ ...c, objectiveId: id, objectiveColor: color }))
                }
              />
            )}
            {step === 'done' && <DonePage />}
          </motion.div>
        </AnimatePresence>
      </main>

      {!isDone && (
        <footer className="flex items-center justify-between border-t border-border-subtle px-10 py-5">
          <Button
            type="button"
            variant="ghost"
            onClick={prev}
            disabled={isFirstVisible}
          >
            <ArrowLeft size={16} />
            Précédent
          </Button>

          <span className="text-xs text-text-muted">
            Étape {currentIdx + 1} sur {VISIBLE_STEPS.length} ·{' '}
            <span className="text-text-secondary">{STEP_LABELS[step]}</span>
          </span>

          <Button
            type="button"
            variant="solid"
            onClick={() => void handleNext()}
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
          </Button>
        </footer>
      )}
    </motion.div>
  )
}
