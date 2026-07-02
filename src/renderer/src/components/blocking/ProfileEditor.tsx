import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Shield, ShieldCheck } from 'lucide-react'
import type { BlockingProfile, DiscoveredSite } from '@shared/schemas'
import { cn } from '@/lib/cn'
import { useShortcut } from '@/lib/use-shortcut'
import { useSettingsStore } from '@/store/settings.store'
import { vethos } from '@/lib/ipc'
import { Button } from '@/components/ui/Button'
import { AppSearchPicker } from './AppSearchPicker'

type PolicyType = BlockingProfile['unlockPolicy']['type']

type Props = {
  open: boolean
  initial: BlockingProfile | null
  onClose: () => void
  onSave: (draft: Partial<BlockingProfile> & { name: string }) => Promise<BlockingProfile>
  onDelete?: (id: string) => Promise<void>
}

type DiscoveredApp = Awaited<ReturnType<typeof vethos.app.discoverInstalledApps>>[number]

export function ProfileEditor({ open, initial, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const [sites, setSites] = useState('')
  const [procs, setProcs] = useState('')
  const [apps, setApps] = useState('')
  const [mode, setMode] = useState<'blocklist' | 'allowlist'>('blocklist')
  const [policyType, setPolicyType] = useState<PolicyType>('cooldown_and_justification')
  const [minutes, setMinutes] = useState(10)
  const [minWords, setMinWords] = useState(50)
  const [busy, setBusy] = useState(false)
  const [scanningApps, setScanningApps] = useState(false)
  const [discoveredApps, setDiscoveredApps] = useState<DiscoveredApp[]>([])
  const [discoveredSites, setDiscoveredSites] = useState<DiscoveredSite[]>([])
  const [error, setError] = useState<string | null>(null)
  const userId = useSettingsStore((s) => s.userId)
  const defaultCooldownMinutes = useSettingsStore((s) => s.defaultUnlockCooldownMinutes)
  const defaultJustificationWords = useSettingsStore((s) => s.defaultUnlockJustificationWords)

  useShortcut('Escape', onClose, { enabled: open && !busy })

  const handleScanApps = useCallback(async (): Promise<void> => {
    setScanningApps(true)
    setError(null)
    try {
      const apps = await vethos.app.discoverInstalledApps()
      setDiscoveredApps(apps)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setScanningApps(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setSites(initial.blockedSites.join('\n'))
      setProcs(initial.blockedProcesses.join('\n'))
      setApps(initial.blockedNetworkApps.join('\n'))
      setMode(initial.mode ?? 'blocklist')
      setPolicyType(initial.unlockPolicy.type)
      setMinutes(
        'minutes' in initial.unlockPolicy ? initial.unlockPolicy.minutes : defaultCooldownMinutes,
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
      setMode('blocklist')
      setPolicyType('cooldown_and_justification')
      setMinutes(defaultCooldownMinutes)
      setMinWords(defaultJustificationWords)
    }
    setError(null)
    if (userId) {
      void vethos.storage
        .read<{ sites: DiscoveredSite[] }>('discovered_sites', userId)
        .then((state) => {
          setDiscoveredSites(state?.sites.slice(0, 12) ?? [])
        })
    } else {
      setDiscoveredSites([])
    }
    void handleScanApps()
  }, [open, initial, defaultCooldownMinutes, defaultJustificationWords, handleScanApps, userId])

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
        mode,
        blockedSites: splitDomains(sites),
        blockedProcesses: splitExeNames(procs),
        blockedNetworkApps: splitExePaths(apps),
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
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                <X size={18} />
              </Button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-5">
                <label className="block text-xs font-medium uppercase tracking-wider text-text-muted mb-2">
                  Mode de blocage
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <ModeButton
                    selected={mode === 'blocklist'}
                    icon={<Shield size={14} />}
                    label="Bloquer la sélection"
                    onClick={() => setMode('blocklist')}
                  />
                  <ModeButton
                    selected={mode === 'allowlist'}
                    icon={<ShieldCheck size={14} />}
                    label="Autoriser seulement"
                    onClick={() => setMode('allowlist')}
                  />
                </div>
              </div>

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
                label={mode === 'allowlist' ? 'Sites autorisés' : 'Sites bloqués'}
                hint={
                  mode === 'allowlist'
                    ? 'Un domaine utile par ligne. Ex : docs.google.com'
                    : 'Un domaine par ligne. Ex : facebook.com, twitter.com'
                }
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
                      <Button
                        key={site.domain}
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => appendLine(setSites, site.domain)}
                        className="rounded-2xl bg-bg-base px-2.5 py-1 text-[10px] text-text-secondary"
                      >
                        {site.domain}
                      </Button>
                    ))}
                  </div>
                )}
              </Field>

              <Field
                label={
                  mode === 'allowlist' ? 'Apps autorisées (processus)' : 'Apps bloquées (processus)'
                }
                hint="Un nom .exe par ligne. Utilise le scanner pour éviter les noms invalides."
              >
                <textarea
                  value={procs}
                  onChange={(e) => setProcs(e.target.value)}
                  rows={3}
                  className={cn(inputCls, 'font-mono text-xs leading-relaxed')}
                />
              </Field>

              <Field
                label={mode === 'allowlist' ? 'Apps réseau autorisées' : 'Apps réseau (par chemin)'}
                hint="Chemin .exe complet, un par ligne"
              >
                <textarea
                  value={apps}
                  onChange={(e) => setApps(e.target.value)}
                  rows={3}
                  className={cn(inputCls, 'font-mono text-xs leading-relaxed')}
                />
              </Field>

              <Field
                label="Rechercher une distraction"
                hint="Combine registre Windows, raccourcis, dossiers d'installation et winget list. Le résultat est caché côté main."
              >
                <AppSearchPicker
                  apps={discoveredApps}
                  scanning={scanningApps}
                  onScan={handleScanApps}
                  scanLabel="Rafraîchir"
                  onPickProcess={(exeName) => appendLine(setProcs, exeName)}
                  onPickNetwork={(exePath) => appendLine(setApps, exePath)}
                  emptyHint="Le scan se lance automatiquement. Cherche une app, puis ajoute-la."
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
                <Button
                  type="button"
                  variant="danger"
                  onClick={async () => {
                    await onDelete(initial.id)
                    onClose()
                  }}
                >
                  <Trash2 size={14} />
                  Supprimer
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  variant="solid"
                  onClick={handleSave}
                  disabled={busy || !name.trim()}
                >
                  {busy ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
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
    <Button
      type="button"
      variant={isSelected ? 'solid' : 'default'}
      onClick={() => onSelect(value)}
      className={cn(
        'w-full rounded-md px-3 py-2.5 text-left',
        isSelected ? 'border-accent/60 bg-accent/15 hover:bg-accent/20' : 'bg-bg-base',
      )}
      contentClassName="w-full items-start justify-start gap-3"
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
    </Button>
  )
}

function splitLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

const DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z]{2,})+$/
const EXE_NAME_REGEX = /^[A-Za-z0-9_.\- ]+\.exe$/i

function splitDomains(s: string): string[] {
  return splitLines(s).map(normalizeDomain).filter(Boolean)
}

function normalizeDomain(raw: string): string {
  const candidate = raw
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^\/\//, '')
    .split(/[/?#]/)[0]
    ?.replace(/:\d+$/, '')
    .replace(/^www\./i, '')
    .toLowerCase()
    .trim()

  if (!candidate || !DOMAIN_REGEX.test(candidate)) {
    throw new Error(`Site invalide : "${raw}". Exemple attendu : youtube.com`)
  }
  return candidate
}

function splitExeNames(s: string): string[] {
  return splitLines(s).map((line) => {
    if (!EXE_NAME_REGEX.test(line)) {
      throw new Error(`App invalide : "${line}". Utilise un nom de processus comme chrome.exe.`)
    }
    return line
  })
}

function splitExePaths(s: string): string[] {
  return splitLines(s).map((line) => {
    if (!/\.exe$/i.test(line.trim())) {
      throw new Error(`Chemin réseau invalide : "${line}". Choisis "Réseau" dans le scanner.`)
    }
    return line
  })
}

function ModeButton({
  selected,
  icon,
  label,
  onClick,
}: {
  selected: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'solid' : 'default'}
      onClick={onClick}
      className={cn(
        'min-h-[44px] rounded-md px-3 py-2 text-xs',
        selected
          ? 'border-accent/60 bg-accent/15 text-accent hover:bg-accent/20'
          : 'bg-bg-elevated text-text-secondary',
      )}
    >
      {icon}
      <span>{label}</span>
    </Button>
  )
}
