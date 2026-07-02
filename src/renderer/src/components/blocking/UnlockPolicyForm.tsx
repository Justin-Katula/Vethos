import { useState, useEffect } from 'react'
import type { UnlockPolicy } from '@shared/schemas'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

type Props = {
  value?: UnlockPolicy
  onChange: (policy: UnlockPolicy) => void
}

export function UnlockPolicyForm({ value, onChange }: Props) {
  const currentType = value?.type ?? 'none'
  const currentMinutes = value && 'minutes' in value ? value.minutes : 5
  const currentMinWords = value && 'minWords' in value ? value.minWords : 50

  const [type, setType] = useState<UnlockPolicy['type']>(currentType)
  const [minutes, setMinutes] = useState(currentMinutes)
  const [minWords, setMinWords] = useState(currentMinWords)

  useEffect(() => {
    if (value) {
      setType(value.type)
      if ('minutes' in value) setMinutes(value.minutes)
      if ('minWords' in value) setMinWords(value.minWords)
    }
  }, [value])

  const handleTypeChange = (newType: UnlockPolicy['type']) => {
    setType(newType)
    triggerChange(newType, minutes, minWords)
  }

  const triggerChange = (
    t: UnlockPolicy['type'],
    m: number,
    w: number
  ) => {
    if (t === 'none') {
      onChange({ type: 'none' })
    } else if (t === 'cooldown') {
      onChange({ type: 'cooldown', minutes: m })
    } else if (t === 'justification') {
      onChange({ type: 'justification', minWords: w })
    } else if (t === 'cooldown_and_justification') {
      onChange({ type: 'cooldown_and_justification', minutes: m, minWords: w })
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border-subtle bg-bg-base/20 p-4">
      <div>
        <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted mb-2">
          Politique de Déverrouillage
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['none', 'cooldown', 'justification', 'cooldown_and_justification'] as const).map(
            (t) => {
              const label = {
                none: 'Aucun (Strict)',
                cooldown: 'Délai (Cooldown)',
                justification: 'Justification',
                cooldown_and_justification: 'Délai + Justif',
              }[t]

              const active = type === t

              return (
                <Button
                  key={t}
                  type="button"
                  variant={active ? 'solid' : 'default'}
                  size="sm"
                  onClick={() => handleTypeChange(t)}
                  className={cn(
                    'w-full rounded-lg px-2 py-2 text-center text-xs',
                    active
                      ? 'border-accent/60 bg-accent/15 text-accent hover:bg-accent/20'
                      : 'bg-bg-base text-text-secondary hover:text-text-primary'
                  )}
                >
                  {label}
                </Button>
              )
            }
          )}
        </div>
      </div>

      {(type === 'cooldown' || type === 'cooldown_and_justification') && (
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Temps de Cooldown (minutes)
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="60"
              value={minutes}
              onChange={(e) => {
                const val = Math.max(1, Math.min(60, parseInt(e.target.value) || 1))
                setMinutes(val)
                triggerChange(type, val, minWords)
              }}
              className="w-20 rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            <span className="text-xs text-text-muted">
              L&apos;utilisateur devra attendre {minutes} minute{minutes > 1 ? 's' : ''} avant que le site/app ne soit débloqué.
            </span>
          </div>
        </div>
      )}

      {(type === 'justification' || type === 'cooldown_and_justification') && (
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Mots minimum pour justifier
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="number"
              min="50"
              max="500"
              step="10"
              value={minWords}
              onChange={(e) => {
                const val = Math.max(50, Math.min(500, parseInt(e.target.value) || 50))
                setMinWords(val)
                triggerChange(type, minutes, val)
              }}
              className="w-20 rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            <span className="text-xs text-text-muted">
              Justification obligatoire de {minWords} mots minimum avant déblocage.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
