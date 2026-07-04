import { useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { vethos } from '@/lib/ipc'
import { Button } from '@/components/ui/Button'

type DiscoveredApp = Awaited<ReturnType<typeof vethos.app.discoverInstalledApps>>[number]

type Props = {
  apps: DiscoveredApp[]
  scanning: boolean
  onScan: () => void | Promise<void>
  onPickProcess: (exeName: string) => void
  onPickNetwork?: (exePath: string) => void
  scanLabel?: string
  emptyHint?: string
}

export function AppSearchPicker({
  apps,
  scanning,
  onScan,
  onPickProcess,
  onPickNetwork,
  scanLabel = 'Scanner',
  emptyHint = "Lance le scan une fois, puis cherche l'app à ajouter.",
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return apps
    return apps.filter((app) =>
      [
        app.name,
        app.exeName,
        app.exePath,
        app.publisher,
        app.packageId,
        app.source,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [apps, query])

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une app..."
            className={cn(inputCls, 'pl-8')}
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void onScan()}
          disabled={scanning}
          className="shrink-0"
        >
          <RefreshCw size={13} className={scanning ? 'animate-spin' : undefined} />
          {scanning ? 'Scan...' : scanLabel}
        </Button>
      </div>

      {apps.length > 0 ? (
        <div className="info-panel mt-3 max-h-80 overflow-y-auto rounded-lg bg-bg-elevated">
          {filteredApps.length === 0 ? (
            <div className="px-3 py-3 text-xs text-text-muted">
              Aucune app ne correspond à cette recherche.
            </div>
          ) : (
            filteredApps.map((app) => {
              const hasExecutablePath = app.hasExecutablePath !== false && app.exePath.length > 0
              return (
                <div
                  key={`${app.source ?? 'app'}-${app.packageId ?? app.exePath}-${app.exeName}`}
                  className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0"
                >
                  <AppIcon app={app} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {app.name}
                    </div>
                    <div className="truncate font-mono text-xs text-text-muted">
                      {app.exeName}
                      {app.source === 'winget' && ' · winget'}
                      {!hasExecutablePath && ' · chemin inconnu'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onPickProcess(app.exeName)}
                  >
                    Processus
                  </Button>
                  {onPickNetwork && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onPickNetwork(app.exePath)}
                      disabled={!hasExecutablePath}
                      title={
                        hasExecutablePath
                          ? 'Bloquer par chemin réseau'
                          : "winget ne fournit pas de chemin .exe pour cette app"
                      }
                    >
                      Réseau
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-text-muted">
          {scanning ? 'Scan des applications en cours...' : emptyHint}
        </p>
      )}
    </div>
  )
}

function AppIcon({ app }: { app: DiscoveredApp }): JSX.Element {
  if (app.iconDataUrl) {
    return (
      <img
        src={app.iconDataUrl}
        alt=""
        className="h-10 w-10 flex-shrink-0 rounded-md object-contain"
        draggable={false}
      />
    )
  }

  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg-card text-sm font-semibold text-text-muted">
      {app.name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-border-subtle bg-white px-3 py-2 text-sm text-black placeholder-text-muted outline-none transition-all duration-300 focus:border-white/50 focus:bg-bg-base focus:text-text-primary focus:ring-2 focus:ring-white/20'
