import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2 } from 'lucide-react'
import type { BlockingProfile } from '@shared/schemas'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'

type PolicyType = BlockingProfile['unlockPolicy']['type']

type Props = {
  open: boolean
  initial: BlockingProfile | null
  onClose: () => void
  onSave: (
    draft: Partial<BlockingProfile> & { name: string },
  ) => Promise<BlockingProfile>
  onDelete?: (id: string) => Promise<void>
}

export function ProfileEditor({ open, initial, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const [sites, setSites] = useState('')
  const [procs, setProcs] = useState('')
  const [apps, setApps] = useState('')
  const [policyType, setPolicyType] = useState<PolicyType>('cooldown_and_justification')
  const [minutes, setMinutes] = useState(5)
  const [minWords, setMinWords] = useState(100)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useShortcut('Escape', onClose, { enabled: open && !busy })

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setSites(initial.blockedSites.join('\n'))
      setProcs(initial.blockedProcesses.join('\n'))
      setApps(initial.blockedNetworkApps.join('\n'))
      setPolicyType(initial.unlockPolicy.type)
      if ('minutes' in initial.unlockPolicy) setMinutes(initial.unlockPolicy.minutes)
      if ('minWords' in initial.unlockPolicy) setMinWords(initial.unlockPolicy.minWords)
    } else {
      setName('')
      setSites('')
      setProcs('')
      setApps('')
      setPolicyType('cooldown_and_justification')
      setMinutes(5)
      setMinWords(100)
    }
    setError(null)
  }, [open, initial])

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const policy =
        policyType === 'none'
          ? { type: 'none' as const }
          : policyType === 'cooldown'
            ? { type: 'cooldown' as const, minutes }
            : policyType === 'justification'
              ? { type: 'justification' as const, minWords }
              : { type: 'cooldown_and_justification' as const, minutes, minWords }

      await onSave({
        ...(initial?.id ? { id: initial.id } : {}),
        ...(initial?.createdAt ? { createdAt: initial.createdAt } : {}),
        name: name.trim(),
        blockedSites: splitLines(sites),
        blockedProcesses: splitLines(procs),
        blockedNetworkApps: splitLines(apps),
        unlockPolicy: policy,
      })
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
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 z-50 flex h-full w-[480px] max-w-full flex-col border-l border-border-subtle bg-bg-elevated shadow-elevated"
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <h2 className="text-lg font-semibold tracking-tight">
                {initial ? 'Modifier le profile' : 'Nouveau profile'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-text-muted hover:bg-bg-card hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <Field label="Nom">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Étude maths, Boulot deep..."
                  className={inputCls}
                />
              </Field>

              <Field
                label="Sites bloqués"
                hint="Un domaine par ligne. Ex : facebook.com, twitter.com"
              >
                <textarea
                  value={sites}
                  onChange={(e) => setSites(e.target.value)}
                  rows={4}
                  className={cn(inputCls, 'font-mono text-xs leading-relaxed')}
                />
              </Field>

              <Field
                label="Apps bloquées (par nom)"
                hint="Un nom .exe par ligne. Ex : notepad.exe"
              >
                <textarea
                  value={procs}
                  onChange={(e) => setProcs(e.target.value)}
                  rows={3}
                  className={cn(inputCls, 'font-mono text-xs leading-relaxed')}
                />
              </Field>

              <Field
                label="Apps réseau (par chemin)"
                hint="Chemin .exe complet, un par ligne"
              >
                <textarea
                  value={apps}
                  onChange={(e) => setApps(e.target.value)}
                  rows={3}
                  className={cn(inputCls, 'font-mono text-xs leading-relaxed')}
                />
              </Field>

              <Field label="Politique d'arrêt anticipé">
                <div className="space-y-2">
                  <RadioRow
                    value="none"
                    selected={policyType}
                    onSelect={setPolicyType}
                    label="Sans verrou"
                    sub="Arrêt instantané"
                  />
                  <RadioRow
                    value="cooldown"
                    selected={policyType}
                    onSelect={setPolicyType}
                    label="Cooldown seul"
                    sub="Attente forcée avant arrêt"
                  />
                  <RadioRow
                    value="justification"
                    selected={policyType}
                    onSelect={setPolicyType}
                    label="Justification seule"
                    sub="Écrire N mots pour arrêter"
                  />
                  <RadioRow
                    value="cooldown_and_justification"
                    selected={policyType}
                    onSelect={setPolicyType}
                    label="Cooldown + justification"
                    sub="Friction maximale (recommandé)"
                  />
                </div>

                {(policyType === 'cooldown' || policyType === 'cooldown_and_justification') && (
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-xs text-text-muted">Minutes :</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                      className={cn(inputCls, 'w-20')}
                    />
                  </div>
                )}
                {(policyType === 'justification' ||
                  policyType === 'cooldown_and_justification') && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-text-muted">Mots min :</label>
                    <input
                      type="number"
                      min={50}
                      max={500}
                      value={minWords}
                      onChange={(e) => setMinWords(Number(e.target.value))}
                      className={cn(inputCls, 'w-24')}
                    />
                  </div>
                )}
              </Field>

              {error && (
                <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-6 py-4">
              {initial && onDelete ? (
                <button
                  type="button"
                  onClick={async () => {
                    await onDelete(initial.id)
                    onClose()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 size={14} />
                  Supprimer
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-4 py-2 text-sm text-text-secondary hover:bg-bg-card"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || !name.trim()}
                  className={cn(
                    'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                    busy || !name.trim()
                      ? 'cursor-not-allowed bg-bg-card text-text-muted'
                      : 'bg-accent text-white hover:bg-accent-hover',
                  )}
                >
                  {busy ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors duration-200 focus:border-accent focus:ring-2 focus:ring-accent/30'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <label className="block text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-text-muted">{hint}</p>}
    </div>
  )
}

function RadioRow({
  value,
  selected,
  onSelect,
  label,
  sub,
}: {
  value: PolicyType
  selected: PolicyType
  onSelect: (v: PolicyType) => void
  label: string
  sub: string
}) {
  const isSelected = selected === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-200',
        isSelected
          ? 'border-accent bg-accent/10'
          : 'border-border-subtle bg-bg-base hover:border-border-strong',
      )}
    >
      <div
        className={cn(
          'mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 transition-colors',
          isSelected ? 'border-accent bg-accent' : 'border-border-strong',
        )}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        <div className="text-xs text-text-muted">{sub}</div>
      </div>
    </button>
  )
}

function splitLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}
