import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ShieldCheck, Play } from 'lucide-react'
import { useLevelsStore } from '@/store/levels.store'
import { useBlockingStore } from '@/store/blocking.store'
import { useToast } from '@/lib/use-toast'
import { durationLabel } from '@/lib/format-time'

/**
 * Composant global monté à la racine.
 *
 * Trois rôles :
 * 1. Pulse flottant "+X min libre" quand `lastCreditEvent` vient d'être émis
 *    par useLevelsStore (consommé après affichage)
 * 2. Bandeau "Session démarrée" 2s au démarrage d'une session
 * 3. Toast success "Session terminée — X min" quand une session se termine
 *    normalement (completedNormally === true)
 */
export function FloatingCredit(): JSX.Element {
  const event = useLevelsStore((s) => s.lastCreditEvent)
  const consume = useLevelsStore((s) => s.consumeCreditEvent)
  const active = useBlockingStore((s) => s.active)
  const history = useBlockingStore((s) => s.state.history)
  const toast = useToast()

  const [startBanner, setStartBanner] = useState<{ id: string; name: string } | null>(null)
  const lastActiveIdRef = useRef<string | null>(null)
  const lastHistoryLengthRef = useRef<number>(history.length)
  const initRef = useRef(false)

  // Skip initial mount to avoid spurious banners/toasts on hydration
  useEffect(() => {
    if (!initRef.current) {
      lastActiveIdRef.current = active?.id ?? null
      lastHistoryLengthRef.current = history.length
      initRef.current = true
    }
  }, [active, history])

  // Détection démarrage de session
  useEffect(() => {
    if (!initRef.current) return
    const prevId = lastActiveIdRef.current
    const currId = active?.id ?? null

    if (currId && currId !== prevId) {
      setStartBanner({ id: currId, name: active!.profileSnapshot.name })
    }
    lastActiveIdRef.current = currId
  }, [active])

  // Auto-hide du banner après 2.4s
  useEffect(() => {
    if (!startBanner) return
    const t = setTimeout(() => setStartBanner(null), 2400)
    return () => clearTimeout(t)
  }, [startBanner])

  // Détection nouvelle entrée dans l'historique → toast de fin
  useEffect(() => {
    if (!initRef.current) return
    if (history.length > lastHistoryLengthRef.current) {
      const latest = history[history.length - 1]
      if (latest) {
        const minutes = Math.max(
          1,
          Math.round(
            (new Date(latest.endedAt).getTime() -
              new Date(latest.startedAt).getTime()) /
              60_000,
          ),
        )
        if (latest.completedNormally) {
          toast.success({
            title: 'Session terminée',
            description: `${durationLabel(minutes)} de focus engrangées.`,
          })
        } else {
          toast.info({
            title: 'Session interrompue',
            description: `${durationLabel(minutes)} avant arrêt anticipé.`,
          })
        }
      }
    }
    lastHistoryLengthRef.current = history.length
  }, [history, toast])

  // Auto-consume du credit event après 2.4s (durée animation)
  useEffect(() => {
    if (!event) return
    const t = setTimeout(() => consume(), 2400)
    return () => clearTimeout(t)
  }, [event, consume])

  return (
    <>
      <SessionStartBanner banner={startBanner} />
      <CreditPulse event={event} />
    </>
  )
}

function CreditPulse({
  event,
}: {
  event: ReturnType<typeof useLevelsStore.getState>['lastCreditEvent']
}): JSX.Element {
  return (
    <AnimatePresence>
      {event && event.objectiveDeltas.length > 0 && (
        <motion.div
          key={event.at}
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none fixed bottom-10 left-1/2 z-[180] -translate-x-1/2"
        >
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 shadow-elevated backdrop-blur-md ring-1 ring-emerald-500/20">
            <motion.span
              animate={{ rotate: [0, 18, -10, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <Sparkles size={16} className="text-emerald-300" />
            </motion.span>
            <span className="tabular-nums">
              +{durationLabel(event.objectiveDeltas.reduce((s, d) => s + d.minutes, 0))} objectifs
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SessionStartBanner({
  banner,
}: {
  banner: { id: string; name: string } | null
}): JSX.Element {
  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.id}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none fixed left-1/2 top-6 z-[180] -translate-x-1/2"
        >
          <div className="flex items-center gap-2 rounded-full border border-accent/30 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent shadow-elevated backdrop-blur-md ring-1 ring-accent/20">
            <Play size={14} fill="currentColor" />
            <span>Session démarrée — {banner.name}</span>
            <ShieldCheck size={14} className="opacity-70" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
