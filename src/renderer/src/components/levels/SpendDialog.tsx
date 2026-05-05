import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Wallet } from 'lucide-react'
import { cn } from '@/lib/cn'
import { durationLabel } from '@/lib/format-time'

type Props = {
  open: boolean
  balanceMinutes: number
  onClose: () => void
  onSpend: (minutes: number, reason: string) => Promise<void>
}

const QUICK_CHOICES = [15, 30, 60, 120]

export function SpendDialog({
  open,
  balanceMinutes,
  onClose,
  onSpend,
}: Props): JSX.Element {
  const [minutes, setMinutes] = useState<number>(15)
  const [custom, setCustom] = useState('')
  const [reason, setReason] = useState('Pause')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMinutes(Math.min(15, balanceMinutes))
    setCustom('')
    setReason('Pause')
    setError(null)
  }, [open, balanceMinutes])

  const usingCustom = custom.trim().length > 0
  const effective = usingCustom ? Number(custom) : minutes
  const valid =
    Number.isFinite(effective) &&
    effective > 0 &&
    Math.round(effective) <= balanceMinutes

  const handleSpend = async (): Promise<void> => {
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      await onSpend(Math.round(effective), reason.trim() || 'Pause')
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border-subtle bg-bg-elevated p-6 shadow-elevated"
          >
            <header className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <Wallet size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Dépenser du temps libre
                  </h2>
                  <p className="text-xs text-text-muted">
                    Solde : <span className="font-semibold tabular-nums text-text-primary">{durationLabel(balanceMinutes)}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-text-muted hover:bg-bg-card hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </header>

            <div className="mt-5">
              <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                Choix rapide
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {QUICK_CHOICES.map((m) => {
                  const selected = !usingCustom && minutes === m
                  const disabled = m > balanceMinutes
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setMinutes(m)
                        setCustom('')
                      }}
                      className={cn(
                        'rounded-lg border px-2 py-3 text-sm font-semibold tabular-nums transition-colors',
                        disabled
                          ? 'cursor-not-allowed border-border-subtle bg-bg-base text-text-muted opacity-40'
                          : selected
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border-subtle bg-bg-base text-text-secondary hover:border-border-strong hover:text-text-primary',
                      )}
                    >
                      {durationLabel(m)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                Personnalisé (min)
              </div>
              <input
                type="number"
                min={1}
                max={balanceMinutes}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Ex. 45"
                className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm tabular-nums text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>

            <div className="mt-4">
              <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                Raison
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['Pause', 'Loisir', 'Sport', 'Social'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      reason === r
                        ? 'border-transparent bg-accent text-white'
                        : 'border-border-subtle bg-bg-base text-text-secondary hover:border-border-strong',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <footer className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-text-secondary hover:bg-bg-card"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSpend}
                disabled={!valid || busy}
                className={cn(
                  'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                  valid && !busy
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'cursor-not-allowed bg-bg-card text-text-muted',
                )}
              >
                {busy
                  ? 'Dépense…'
                  : valid
                  ? `Dépenser ${durationLabel(Math.round(effective))}`
                  : 'Dépenser'}
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
