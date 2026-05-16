import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X, Trash2 } from 'lucide-react'
import type { BlockingProfile, DiscoveredSite } from '@shared/schemas'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'
import { useSettingsStore } from '@/store/settings.store'
import { nexus } from '@/lib/ipc'

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

type DiscoveredApp = Awaited<ReturnType<typeof nexus.app.discoverInstalledApps>>[number]

export function ProfileEditor({ open, initial, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const [sites, setSites] = useState('')
  const [procs, setProcs] = useState('')
  const [apps, setApps] = useState('')
  const [policyType, setPolicyType] = useState<PolicyType>('cooldown_and_justification')
  const [minutes, setMinutes] = useState(10)
  const [minWords, setMinWords] = useState(50)
  const [busy, setBusy] = useState(false)
  const [scanningApps, setScanningApps] = useState(false)
  const [discoveredApps, setDiscoveredApps] = useState<DiscoveredApp[]>([])
  const [discoveredSites, setDiscoveredSites] = useState<DiscoveredSite[]>([])
  const [error, setError] = useState<string | null>(null)
  const defaultCooldownMinutes = useSettingsStore((s) => s.defaultUnlockCooldownMinutes)
  const defaultJustificationWords = useSettingsStore((s) => s.defaultUnlockJustificationWords)

  useShortcut('Escape', onClose, { enabled: open && !busy })

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setSites(initial.blockedSites.join('\n'))
      setProcs(initial.blockedProcesses.join('\n'))
      setApps(initial.blockedNetworkApps.join('\n'))
      setPolicyType(initial.unlockPolicy.type)
      setMinutes(
        'minutes' in initial.unlockPolicy
          ? initial.unlockPolicy.minutes
          : defaultCooldownMinutes,
      )
      setMinWords(
        'minWords' in initial.unlockPolicy
          ? initial.unlockPolicy.minWords
          : defaultJustificationWords,
      )
    } else {
      setName('')
      setSites('')
      setProcs('')
      setApps('')
      setPolicyType('cooldown_and_justification')
      setMinutes(defaultCooldownMinutes)
      setMinWords(defaultJustificationWords)
    }
    setError(null)
    void nexus.storage.read<{ sites: DiscoveredSite[] }>('discovered_sites').then((state) => {
      setDiscoveredSites(state?.sites.slice(0, 12) ?? [])
    })
  }, [open, initial, defaultCooldownMinutes, defaultJustificationWords])

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

  const appendLine = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string,
  ): void => {
    const clean = value.trim()
    if (!clean) return
    setter((current) => {
      const lines = splitLines(current)
      if (lines.some((line) => line.toLowerCase() === clean.toLowerCase())) return current
      return [...lines, clean].join('\n')
    })
  }

  const handleScanApps = async (): Promise<void> => {
    setScanningApps(true)
    setError(null)
    try {
      const apps = await nexus.app.discoverInstalledApps()
      setDiscoveredApps(apps.slice(0, 20))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setScanningApps(false)
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
                {discoveredSites.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {discoveredSites.map((site) => (
                      <button
                        key={site.domain}
                        type="button"
                        onClick={() => appendLine(setSites, site.domain)}
                        className="rounded-2xl border border-border-subtle bg-bg-base px-2.5 py-1 text-[10px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                      >
                        {site.domain}
                      </button>
                    ))}
                  </div>
                )}
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

              <Field label="Scanner les applications" hint="Lit le registre Windows localement et propose les apps trouvées.">
                <button
                  type="button"
                  onClick={() => void handleScanApps()}
                  disabled={scanningApps}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-xs font-medium transition-colors',
                    scanningApps
                      ? 'cursor-wait text-text-muted'
                      : 'text-text-secondary hover:border-border-strong hover:text-text-primary',
                  )}
                >
                  <RefreshCw size={13} className={scanningApps ? 'animate-spin' : undefined} />
                  {scanningApps ? 'Scan...' : 'Scanner mes applications'}
                </button>
                {discoveredApps.length > 0 && (
                  <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-border-subtle bg-bg-base">
                    {discoveredApps.map((app) => (
                      <div
                        key={`${app.exePath}-${app.exeName}`}
                        className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-text-primary">
                            {app.name}
                          </div>
                          <div className="truncate font-mono text-[10px] text-text-muted">
                            {app.exeName}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => appendLine(setProcs, app.exeName)}
                          className="rounded-md border border-border-subtle px-2 py-1 text-[10px] text-text-secondary hover:border-border-strong hover:text-text-primary"
                        >
                          Lancement
                        </button>
                        <button
                          type="button"
                          onClick={() => appendLine(setApps, app.exePath)}
                          className="rounded-md border border-border-subtle px-2 py-1 text-[10px] text-text-secondary hover:border-border-strong hover:text-text-primary"
                        >
                          Réseau
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
          'mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-2xl border-2 transition-colors',
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
