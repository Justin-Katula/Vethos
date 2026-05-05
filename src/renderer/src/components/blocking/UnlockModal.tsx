import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock } from 'lucide-react'
import type { ActiveSession } from '@shared/schemas'
import { cn } from '@/lib/cn'

type Props = {
  open: boolean
  session: ActiveSession | null
  onClose: () => void
  onSubmit: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
}

function countWords(s: string): number {
  const t = s.trim()
  if (!t) return 0
  return t.split(/\s+/u).length
}

export function UnlockModal({ open, session, onClose, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setText('')
      setError(null)
      return
    }
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open])

  if (!session) return null
  const policy = session.profileSnapshot.unlockPolicy

  const cooldownMin =
    policy.type === 'cooldown' || policy.type === 'cooldown_and_justification'
      ? policy.minutes
      : 0
  const minWords =
    policy.type === 'justification' || policy.type === 'cooldown_and_justification'
      ? policy.minWords
      : 0

  const cooldownStartedAt =
    session.unlockState.phase === 'cooldown' ? Date.parse(session.unlockState.startedAt) : null
  const cooldownEndsAt = cooldownStartedAt ? cooldownStartedAt + cooldownMin * 60_000 : null
  const cooldownRemaining = cooldownEndsAt ? Math.max(0, cooldownEndsAt - now) : 0
  const cooldownReady = cooldownEndsAt ? now >= cooldownEndsAt : true

  const words = countWords(text)
  const wordsOk = words >= minWords
  const canSubmit = cooldownReady && wordsOk && !busy

  const handleSubmit = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await onSubmit(text)
      if (r.ok) {
        onClose()
      } else {
        setError(r.reason)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-elevated"
          >
            <div className="border-b border-border-subtle px-8 py-5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                <Lock size={14} strokeWidth={2.5} />
                {"Demande d'arrêt anticipé"}
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
                {cooldownReady
                  ? minWords > 0
                    ? 'Écris ce qui t’a poussé à vouloir arrêter'
                    : 'Confirme l’arrêt'
                  : 'Tiens bon'}
              </h2>
              {!cooldownReady && (
                <p className="mt-2 text-sm text-text-secondary">
                  Cette envie est temporaire. Donne-toi le temps de la laisser passer avant de
                  décider.
                </p>
              )}
            </div>

            {!cooldownReady && (
              <div className="flex items-center justify-center py-10">
                <motion.div
                  key={Math.floor(cooldownRemaining / 1000)}
                  initial={{ opacity: 0.7, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="font-mono text-7xl font-light tabular-nums text-text-primary"
                >
                  {formatCooldown(cooldownRemaining)}
                </motion.div>
              </div>
            )}

            {(cooldownReady || cooldownStartedAt) && minWords > 0 && (
              <div className="px-8 py-5">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={!cooldownReady}
                  placeholder={
                    cooldownReady
                      ? 'Pourquoi maintenant ? Qu’est-ce qui pousse cette envie ? Que veux-tu vraiment ?'
                      : 'Le champ se débloque à la fin du compte à rebours'
                  }
                  rows={8}
                  className={cn(
                    'w-full resize-none rounded-md border border-border-subtle bg-bg-base px-4 py-3',
                    'text-sm leading-relaxed text-text-primary outline-none transition-colors duration-200',
                    'focus:border-accent focus:ring-2 focus:ring-accent/30',
                    !cooldownReady && 'cursor-not-allowed opacity-50',
                  )}
                />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-text-muted">
                    {words} / {minWords} mots
                  </span>
                  <div className="h-1 flex-1 mx-4 overflow-hidden rounded-full bg-bg-base">
                    <div
                      className={cn(
                        'h-full transition-all duration-300',
                        wordsOk ? 'bg-emerald-400' : 'bg-accent',
                      )}
                      style={{ width: `${Math.min(100, (words / minWords) * 100)}%` }}
                    />
                  </div>
                  <span className={cn('text-text-muted', wordsOk && 'text-emerald-400')}>
                    {wordsOk ? 'OK' : `${minWords - words} restants`}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="mx-8 mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <footer className="flex items-center justify-end gap-2 border-t border-border-subtle px-8 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm text-text-secondary hover:bg-bg-card"
              >
                Continuer la session
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={cn(
                  'rounded-md px-5 py-2 text-sm font-medium transition-colors',
                  canSubmit
                    ? 'bg-accent text-white hover:bg-accent-hover'
                    : 'cursor-not-allowed bg-bg-card text-text-muted',
                )}
              >
                {busy ? 'Validation...' : 'Confirmer l’arrêt'}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatCooldown(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
