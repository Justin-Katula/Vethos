import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Globe, Shield } from 'lucide-react'
import type { DiscoveredSite, WorkBlockingConfig } from '@shared/schemas'
import { cn } from '@/lib/cn'
import { vethos } from '@/lib/ipc'
import { useSettingsStore } from '@/store/settings.store'
import { useRegistryStore } from '@/store/registry.store'
import { createDefaultWorkBlockingConfig } from '@/lib/work-blocking'
import { Button } from '@/components/ui/Button'
import { AppSearchPicker } from './AppSearchPicker'

type DiscoveredApp = Awaited<ReturnType<typeof vethos.app.discoverInstalledApps>>[number]

type Props = {
  value: WorkBlockingConfig | undefined
  onChange: (value: WorkBlockingConfig | undefined) => void
  subjectLabel: 'tâche' | 'objectif'
}

export function WorkBlockingFields({ value, onChange, subjectLabel }: Props): JSX.Element {
  const defaultCooldownMinutes = useSettingsStore((s) => s.defaultUnlockCooldownMinutes)
  const defaultJustificationWords = useSettingsStore((s) => s.defaultUnlockJustificationWords)
  const registryItems = useRegistryStore((s) => s.items)
  const syncDiscoveredApps = useRegistryStore((s) => s.syncDiscoveredApps)
  const [scanningApps, setScanningApps] = useState(false)
  const [showAllowedSites, setShowAllowedSites] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultConfig = useMemo(
    () =>
      createDefaultWorkBlockingConfig({
        cooldownMinutes: defaultCooldownMinutes,
        justificationWords: defaultJustificationWords,
      }),
    [defaultCooldownMinutes, defaultJustificationWords],
  )
  const config = value ?? defaultConfig
  const appChoices = useMemo<DiscoveredApp[]>(
    () =>
      registryItems
        .filter((item) => item.kind === 'app' && item.blockable !== false)
        .map((item) => {
          const exeName = item.executableName ?? item.identifier
          return {
            name: item.displayName,
            exeName,
            exePath: '',
            publisher: item.category ?? '',
            packageId: item.identifier,
            source: 'registry',
            hasExecutablePath: false,
            iconDataUrl: item.iconDataUrl,
          } satisfies DiscoveredApp
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [registryItems],
  )

  useEffect(() => {
    if (!value) onChange(defaultConfig)
  }, [defaultConfig, onChange, value])

  const update = (patch: Partial<WorkBlockingConfig>): void => {
    onChange({ ...config, mode: 'allowlist', ...patch })
  }

  const setEnabled = (enabled: boolean): void => {
    onChange({ ...config, mode: 'allowlist', enabled })
  }

  const appendLine = (field: 'sites' | 'processes' | 'networkApps', valueToAdd: string): void => {
    const clean = field === 'sites' ? normalizeDomainDraft(valueToAdd) : valueToAdd.trim()
    if (!clean) return
    const current = config[field]
    if (current.some((line) => line.toLowerCase() === clean.toLowerCase())) return
    update({ [field]: [...current, clean] } as Partial<WorkBlockingConfig>)
  }

  const handleScanApps = useCallback(async (): Promise<void> => {
    setScanningApps(true)
    setError(null)
    try {
      const apps = await vethos.app.discoverInstalledApps()
      await syncDiscoveredApps(apps)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setScanningApps(false)
    }
  }, [syncDiscoveredApps])

  const sitesLabel = 'Sites utiles à laisser accessibles'
  const processesLabel = 'Applications nécessaires'
  const networkAppsLabel = 'Applications réseau nécessaires'

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Blocage de {subjectLabel}
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            {config.enabled ? 'Actif pendant les blocs planifiés.' : 'Désactivé pour ce travail.'}
          </div>
        </div>
        <Button
          type="button"
          variant={config.enabled ? 'solid' : 'default'}
          size="sm"
          onClick={() => setEnabled(!config.enabled)}
        >
          <Shield size={13} />
          {config.enabled ? 'Activé' : 'Activer'}
        </Button>
      </div>

      {config.enabled && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-xs text-text-secondary">
            Mode strict : choisis uniquement les apps nécessaires. Coach comparera ensuite tes choix
            avec le contexte pour laisser tranquille ce qui sert vraiment la session.
          </div>

          <AppPickerSection
            discoveredApps={appChoices}
            scanningApps={scanningApps}
            onScanApps={handleScanApps}
            onPickProcess={(exeName) => appendLine('processes', exeName)}
            emptyHint="Les apps viennent de la page Apps. Utilise le scan seulement pour rafraîchir l'inventaire."
          />

          {(config.processes.length > 0 || config.networkApps.length > 0) && (
            <SelectedAppsFields
              processesLabel={processesLabel}
              networkAppsLabel={networkAppsLabel}
              processes={config.processes.join('\n')}
              networkApps={config.networkApps.join('\n')}
              onProcessesChange={(text) => update({ processes: splitLines(text) })}
              onNetworkAppsChange={(text) => update({ networkApps: splitLines(text) })}
            />
          )}

          <RevealButton
            open={showAllowedSites}
            icon={<Globe size={14} />}
            label="Sites utiles"
            count={config.sites.length}
            onClick={() => setShowAllowedSites((open) => !open)}
          />
          {showAllowedSites && (
            <SitesField
              label={sitesLabel}
              hint="Optionnel. Un domaine utile par ligne. Ex : docs.google.com"
              value={config.sites.join('\n')}
              discoveredSites={[]}
              onChange={(text) => update({ sites: splitDomainDraft(text) })}
              onPick={(domain) => appendLine('sites', domain)}
            />
          )}

          {config.mode === 'allowlist' &&
            config.sites.length + config.processes.length + config.networkApps.length === 0 && (
              <div className="rounded-md border border-orange/40 bg-orange/10 px-3 py-2 text-xs text-orange">
                Ajoute au moins une app ou un site utile avant d&apos;utiliser ce mode.
              </div>
            )}

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RevealButton({
  open,
  icon,
  label,
  count,
  onClick,
}: {
  open: boolean
  icon: React.ReactNode
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="default"
      onClick={onClick}
      className="w-full rounded-md bg-bg-elevated px-3 py-2.5 text-left"
      contentClassName="w-full justify-between"
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate text-sm font-medium text-text-primary">{label}</span>
        {count > 0 && (
          <span className="rounded-2xl border border-border-subtle px-2 py-0.5 text-xs text-text-muted">
            {count}
          </span>
        )}
      </span>
      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
    </Button>
  )
}

function SitesField({
  label,
  hint,
  value,
  discoveredSites,
  onChange,
  onPick,
}: {
  label: string
  hint: string
  value: string
  discoveredSites: DiscoveredSite[]
  onChange: (value: string) => void
  onPick: (domain: string) => void
}) {
  return (
    <div>
      <TextAreaField label={label} hint={hint} value={value} onChange={onChange} />
      {discoveredSites.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {discoveredSites.map((site) => (
            <Button
              key={site.domain}
              type="button"
              variant="default"
              size="sm"
              onClick={() => onPick(site.domain)}
              className="rounded-2xl bg-bg-elevated px-2.5 py-1 text-[10px] text-text-secondary"
            >
              {site.domain}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function SelectedAppsFields({
  processesLabel,
  networkAppsLabel,
  processes,
  networkApps,
  onProcessesChange,
  onNetworkAppsChange,
}: {
  processesLabel: string
  networkAppsLabel: string
  processes: string
  networkApps: string
  onProcessesChange: (value: string) => void
  onNetworkAppsChange: (value: string) => void
}) {
  return (
    <div className="space-y-4">
      <TextAreaField
        label={processesLabel}
        hint="Un nom .exe par ligne. Utilise le scanner pour éviter les noms invalides."
        value={processes}
        onChange={onProcessesChange}
      />

      <TextAreaField
        label={networkAppsLabel}
        hint="Chemin .exe complet, un par ligne."
        value={networkApps}
        onChange={onNetworkAppsChange}
      />
    </div>
  )
}

function AppPickerSection({
  discoveredApps,
  scanningApps,
  onScanApps,
  onPickProcess,
  onPickNetwork,
  emptyHint,
}: {
  discoveredApps: DiscoveredApp[]
  scanningApps: boolean
  onScanApps: () => void | Promise<void>
  onPickProcess: (exeName: string) => void
  onPickNetwork?: (exePath: string) => void
  emptyHint: string
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
        Applications détectées
      </div>
      <AppSearchPicker
        apps={discoveredApps}
        scanning={scanningApps}
        onScan={onScanApps}
        scanLabel="Rafraîchir"
        onPickProcess={onPickProcess}
        onPickNetwork={onPickNetwork}
        emptyHint={emptyHint}
      />
    </div>
  )
}

function TextAreaField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={cn(inputCls, 'mt-2 font-mono text-xs leading-relaxed')}
      />
      <p className="mt-1.5 text-xs text-text-muted">{hint}</p>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition-colors duration-200 focus:border-accent focus:ring-2 focus:ring-accent/30'

function splitLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function splitDomainDraft(s: string): string[] {
  return splitLines(s).map(normalizeDomainDraft)
}

function normalizeDomainDraft(raw: string): string {
  return (
    raw
      .trim()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/^\/\//, '')
      .split(/[/?#]/)[0]
      ?.replace(/:\d+$/, '')
      .replace(/^www\./i, '')
      .toLowerCase()
      .trim() ?? ''
  )
}
