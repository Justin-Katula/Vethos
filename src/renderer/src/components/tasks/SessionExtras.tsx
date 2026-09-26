import { useEffect, useState } from 'react'
import { nexus } from '@/lib/ipc'

/**
 * Prolongation (spec moteur 2026-09-25) : une bannière discrète dans les 2
 * dernières minutes d'une séance, sans voler le focus. Une seule durée, deux
 * boutons ; le « non » n'est jamais un échec.
 */
export function ExtensionBanner({ blockId }: { blockId: string }) {
  const [offer, setOffer] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setOffer(null)
    setDismissed(false)
    let alive = true
    const ask = () =>
      void nexus.planning
        .extensionOffer()
        .then((o) => alive && setOffer(o?.minutes ?? null))
        .catch(() => undefined)
    ask()
    const t = setInterval(ask, 20_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [blockId])

  if (offer === null || dismissed) return null
  return (
    <div role="status" className="flex items-center justify-end gap-2">
      <button
        type="button"
        className="btn-iris pressable"
        onClick={() => void nexus.planning.acceptExtension().finally(() => setDismissed(true))}
      >
        Yes, +{offer} min
      </button>
      <button
        type="button"
        className="pressable rounded border border-line px-3 py-1.5 text-[12.5px] text-fg-2 hover:text-fg"
        onClick={() => setDismissed(true)}
      >
        No, I’ll stop here
      </button>
    </div>
  )
}

/** « Saturday is free. » — proposé, jamais imposé ; jamais « tu l'as mérité ». */
export function FreeDayCard({ refreshKey }: { refreshKey: string }) {
  const [date, setDate] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void nexus.planning
      .freeDay()
      .then((d) => alive && setDate(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [refreshKey])

  if (!date) return null
  const day = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
  const decide = (decision: 'taken' | 'kept') =>
    void nexus.planning.decideFreeDay(date, decision).finally(() => setDate(null))
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-line px-4 py-3">
      <span className="text-[13.5px] text-fg">{day} is free.</span>
      <span className="flex gap-2">
        <button type="button" className="btn-iris pressable" onClick={() => decide('taken')}>
          Take it
        </button>
        <button
          type="button"
          className="pressable rounded border border-line px-3 py-1.5 text-[12.5px] text-fg-2 hover:text-fg"
          onClick={() => decide('kept')}
        >
          Keep my day
        </button>
      </span>
    </div>
  )
}
