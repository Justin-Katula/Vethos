import { TRANCHES_AGE, type TrancheAge } from '@shared/sommeil-plancher'
import { useSettingsStore } from '@/store/settings.store'
import { cn } from '@/lib/cn'

const LABELS: Record<TrancheAge, string> = { '13-18': '13 – 18', '19-24': '19 – 24', '25+': '25+' }

/** La tranche d'âge : elle fixe le plancher de sommeil (spec moteur 2026-09-25). */
export function AgeChoice(): JSX.Element {
  const age = useSettingsStore((s) => s.ageBracket)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  return (
    <div className="flex gap-2">
      {TRANCHES_AGE.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => void updateSettings({ ageBracket: t })}
          className={cn('pressable rounded border px-5 py-3 text-base', age === t ? 'border-line-strong text-fg' : 'border-line text-fg-3')}
        >
          {LABELS[t]}
        </button>
      ))}
    </div>
  )
}

export function AgeStep(): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <h1 className="text-3xl font-bold">How old are you?</h1>
      <AgeChoice />
    </div>
  )
}
