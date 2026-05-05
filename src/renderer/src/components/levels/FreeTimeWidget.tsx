import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Sparkles } from 'lucide-react'
import type { FreeTimeBank } from '@shared/schemas'
import { durationLabel } from '@/lib/format-time'
import { SpendDialog } from './SpendDialog'

type Props = {
  bank: FreeTimeBank
  onSpend: (minutes: number, reason: string) => Promise<void>
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Retourne un tableau de 7 jours (lundi → dimanche, semaine glissante)
 * avec la somme de minutes créditées (deltaMinutes > 0) sur chaque jour.
 */
function buildHeatmap(bank: FreeTimeBank): Array<{ label: string; minutes: number; isToday: boolean }> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // dayOfWeek 0=dimanche → on veut lundi=0
  const todayDow = (today.getDay() + 6) % 7
  // Début de la semaine = aujourd'hui - todayDow jours
  const monday = new Date(today.getTime() - todayDow * DAY_MS)

  const buckets = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday.getTime() + i * DAY_MS)
    return { day, minutes: 0 }
  })

  for (const e of bank.entries) {
    if (e.deltaMinutes <= 0) continue
    const t = new Date(e.at)
    const eDate = new Date(t.getFullYear(), t.getMonth(), t.getDate())
    const idx = Math.round((eDate.getTime() - monday.getTime()) / DAY_MS)
    if (idx < 0 || idx > 6) continue
    buckets[idx]!.minutes += e.deltaMinutes
  }

  return buckets.map((b, i) => ({
    label: WEEK_DAYS[i]!,
    minutes: b.minutes,
    isToday: b.day.getTime() === today.getTime(),
  }))
}

function weekTotalCredited(bank: FreeTimeBank): number {
  const cutoff = Date.now() - 7 * DAY_MS
  let total = 0
  for (const e of bank.entries) {
    if (e.deltaMinutes <= 0) continue
    if (new Date(e.at).getTime() < cutoff) continue
    total += e.deltaMinutes
  }
  return total
}

export function FreeTimeWidget({ bank, onSpend }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const heatmap = useMemo(() => buildHeatmap(bank), [bank])
  const weekCredit = useMemo(() => weekTotalCredited(bank), [bank])
  const maxBar = Math.max(60, ...heatmap.map((d) => d.minutes))

  return (
    <div className="flex h-full flex-col gap-5 rounded-2xl border border-border-subtle bg-bg-elevated p-6 shadow-card">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Wallet size={16} />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-text-muted">
            Temps libre
          </h2>
        </div>
        {bank.balanceMinutes > 0 && (
          <Sparkles size={14} className="text-amber-400" />
        )}
      </header>

      <div className="flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={bank.balanceMinutes}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl font-bold tabular-nums tracking-tight text-text-primary"
          >
            {durationLabel(bank.balanceMinutes)}
          </motion.div>
        </AnimatePresence>
        <div className="mt-1 text-xs text-text-muted">
          {weekCredit > 0
            ? `+${durationLabel(weekCredit)} cette semaine`
            : 'Aucun crédit cette semaine'}
        </div>
      </div>

      <div className="flex-1">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
          7 derniers jours
        </div>
        <div className="flex h-20 items-end gap-1.5">
          {heatmap.map((d, i) => {
            const ratio = d.minutes === 0 ? 0 : Math.max(0.08, d.minutes / maxBar)
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <motion.div
                  initial={{ scaleY: 0, originY: 1 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.04, ease: 'easeOut' }}
                  className="w-full origin-bottom rounded-sm transition-colors"
                  style={{
                    height: `${ratio * 100}%`,
                    backgroundColor:
                      d.minutes === 0
                        ? 'rgba(255,255,255,0.04)'
                        : `rgba(16,185,129,${0.25 + ratio * 0.6})`,
                    minHeight: 2,
                  }}
                />
                <div
                  className={`text-[9px] tabular-nums ${d.isToday ? 'font-bold text-emerald-400' : 'text-text-muted'}`}
                >
                  {d.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={bank.balanceMinutes === 0}
        className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
          bank.balanceMinutes === 0
            ? 'cursor-not-allowed bg-bg-card text-text-muted'
            : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
        }`}
      >
        {bank.balanceMinutes === 0 ? 'Aucun crédit disponible' : 'Dépenser…'}
      </button>

      <SpendDialog
        open={open}
        balanceMinutes={bank.balanceMinutes}
        onClose={() => setOpen(false)}
        onSpend={onSpend}
      />
    </div>
  )
}
