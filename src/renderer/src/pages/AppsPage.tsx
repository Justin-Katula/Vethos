import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Loader2, RefreshCw } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { CURRENT_APP_SCAN_VERSION, useRegistryStore } from '@/store/registry.store'
import { RegistryList } from '@/components/blocking/RegistryList'
import { PageSkeleton } from '@/components/ui/Skeleton'
import { vethos } from '@/lib/ipc'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { motion, AnimatePresence } from 'framer-motion'

const APP_INVENTORY_REFRESH_MS = 7 * 24 * 60 * 60 * 1000

export default function AppsPage() {
  const {
    loaded: registryLoaded,
    load: loadRegistry,
    items: registryItems,
    syncDiscoveredApps,
    appsLastScannedAt,
    appsScanVersion,
    userId,
    observeItem,
  } = useRegistryStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [isAddingSite, setIsAddingSite] = useState(false)
  const [siteInput, setSiteInput] = useState('')
  const [siteError, setSiteError] = useState('')

  useEffect(() => {
    if (!userId) return
    void loadRegistry(userId)
  }, [loadRegistry, userId])

  const scanInstalledApps = useCallback((forceRefresh = false) => {
    setScanning(true)
    return vethos.app
      .discoverInstalledApps({ forceRefresh })
      .then(async (apps) => {
        await syncDiscoveredApps(apps || [])
      })
      .catch((err) => {
        console.error('Error scanning apps:', err)
      })
      .finally(() => {
        setScanning(false)
      })
  }, [syncDiscoveredApps])

  const handleAddSite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setSiteError('')
    const trimmed = siteInput.trim().toLowerCase()
    if (!trimmed) return

    let host = trimmed.replace(/^https?:\/\//i, '')
    const firstSlash = host.indexOf('/')
    if (firstSlash !== -1) host = host.substring(0, firstSlash)
    const firstQuestion = host.indexOf('?')
    if (firstQuestion !== -1) host = host.substring(0, firstQuestion)
    const firstHash = host.indexOf('#')
    if (firstHash !== -1) host = host.substring(0, firstHash)
    const firstColon = host.indexOf(':')
    if (firstColon !== -1) host = host.substring(0, firstColon)

    const domain = host.replace(/^www\./i, '')

    const DOMAIN_REGEX = /^[a-z0-9.-]+\.[a-z]{2,}$/i
    if (!DOMAIN_REGEX.test(domain)) {
      setSiteError('Veuillez entrer un domaine valide (ex: reddit.com).')
      return
    }

    const nameParts = domain.split('.')
    const baseName = nameParts.length >= 2 ? nameParts[nameParts.length - 2]! : nameParts[0]!
    const displayName = baseName.charAt(0).toUpperCase() + baseName.slice(1)

    try {
      await observeItem({
        kind: 'site',
        identifier: domain,
        displayName,
        blockable: true,
      })
      setIsAddingSite(false)
      setSiteInput('')
    } catch (err) {
      setSiteError("Erreur lors de l'ajout du site.")
    }
  }, [siteInput, observeItem])

  useEffect(() => {
    if (!registryLoaded) return
    const savedAppsCount = registryItems.filter((item) => item.kind === 'app').length
    const lastScanMs = appsLastScannedAt ? Date.parse(appsLastScannedAt) : 0
    const inventoryIsStale = !lastScanMs || Date.now() - lastScanMs >= APP_INVENTORY_REFRESH_MS
    const cacheUsesCurrentScanner = appsScanVersion === CURRENT_APP_SCAN_VERSION
    if (savedAppsCount > 0 && !inventoryIsStale && cacheUsesCurrentScanner) return
    void scanInstalledApps()
  }, [appsLastScannedAt, appsScanVersion, registryItems, registryLoaded, scanInstalledApps])

  const blockableAppsCount = useMemo(
    () =>
      registryItems.filter(
        (item) => item.kind === 'app' && item.blockable !== false && item.executableName,
      ).length,
    [registryItems],
  )
  const displayedAppsCount = useMemo(
    () => registryItems.filter((item) => item.kind === 'app').length,
    [registryItems],
  )
  const lastScanLabel = appsLastScannedAt
    ? new Date(appsLastScannedAt).toLocaleDateString('fr-FR')
    : null

  if (!registryLoaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="space-y-2">
            <div className="h-8 w-40 animate-pulse rounded bg-bg-card" />
            <div className="h-3 w-60 animate-pulse rounded bg-bg-card" />
          </div>
        </PageSkeleton>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 overflow-y-auto px-12 pb-16 pt-16">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Applications & Sites</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Gérez les applications et sites web suivis. Classez-les comme utiles ou distractions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {displayedAppsCount > 0 && (
              <div className="rounded-xl bg-accent/10 border border-accent/25 px-4 py-2 text-xs font-bold text-accent shadow-sm flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full bg-accent', scanning && 'animate-pulse')} />
                {scanning
                  ? 'Mise à jour en arrière-plan…'
                  : `${displayedAppsCount} sauvegardées · ${blockableAppsCount} blocables${lastScanLabel ? ` · vérifiées le ${lastScanLabel}` : ''}`}
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={scanning}
              onClick={() => void scanInstalledApps(true)}
              className="h-9 gap-2 border border-border-subtle"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin')} />
              Actualiser
            </Button>
          </div>
        </header>

        <section className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Applications suivies
            </h2>
          </div>

          <div className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher parmi toutes les applications détectées..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border-subtle bg-white text-sm text-black placeholder-text-muted outline-none transition-all duration-300 focus:border-white/50 focus:bg-bg-base focus:text-text-primary focus:ring-2 focus:ring-white/20"
              />
              {scanning && (
                <Loader2 className="absolute right-3.5 h-4 w-4 text-accent animate-spin" />
              )}
            </div>

          </div>

          <RegistryList kind="app" query={searchQuery} />
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Sites web suivis
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddingSite(true)}
              className="h-8 gap-1.5 border border-border-subtle text-xs"
            >
              + Ajouter un site web
            </Button>
          </div>
          <RegistryList kind="site" />
        </section>
      </div>

      <AnimatePresence>
        {isAddingSite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setIsAddingSite(false)
              setSiteInput('')
              setSiteError('')
            }}
          >
            <motion.form
              initial={{ scale: 0.92, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => void handleAddSite(e)}
              className="info-panel w-full max-w-md rounded-xl bg-bg-elevated p-6 shadow-2xl border border-border-subtle"
            >
              <h3 className="text-lg font-semibold text-text-primary mb-2">Suivre un site web</h3>
              <p className="text-xs text-text-secondary mb-4">
                Entrez le nom de domaine ou l'adresse du site web que vous souhaitez suivre ou bloquer.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  autoFocus
                  placeholder="exemple.com ou https://exemple.com"
                  value={siteInput}
                  onChange={(e) => {
                    setSiteInput(e.target.value)
                    setSiteError('')
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-base text-sm text-text-primary outline-none focus:border-accent transition-colors"
                />
                {siteError && <p className="text-xs text-red-500">{siteError}</p>}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsAddingSite(false)
                    setSiteInput('')
                    setSiteError('')
                  }}
                >
                  Annuler
                </Button>
                <Button type="submit" variant="solid">
                  Ajouter
                </Button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

    </PageTransition>
  )
}
