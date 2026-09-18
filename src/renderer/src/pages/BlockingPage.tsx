import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, RefreshCw, Search, Shield, ShieldOff } from 'lucide-react'
import { nexus } from '@/lib/ipc'
import { useBlockingStore } from '@/store/blocking.store'
import {
  APP_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type AppCategory,
} from '@shared/app-categories'
import { PageTransition } from '@/components/PageTransition'

type AppInstallee = {
  id?: string
  name: string
  exeName: string
  category: AppCategory | null
  classificationState?: 'RESOLVED' | 'UNRESOLVED'
  classificationSource?: string
  classificationReasonCode?: string
  classifierVersion?: number
  iconDataUrl?: string
  isProtected?: boolean
}

function resteAvant(cible: number, now: number): string {
  const restant = Math.max(0, cible - now)
  const minutes = Math.floor(restant / 60_000)
  const secondes = Math.floor((restant % 60_000) / 1000)
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
  }
  return `${minutes} min ${String(secondes).padStart(2, '0')} s`
}

function IconeApp({ app }: { app: AppInstallee }): JSX.Element {
  if (app.iconDataUrl !== undefined) {
    return <img src={app.iconDataUrl} alt="" className="h-7 w-7 shrink-0 rounded" />
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-2 text-xs font-semibold text-fg-2">
      {app.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export default function BlockingPage(): JSX.Element {
  const { session, load, setSession } = useBlockingStore()
  const [apps, setApps] = useState<AppInstallee[]>([])
  const [chargementApps, setChargementApps] = useState(true)
  const [rafraichissement, setRafraichissement] = useState(false)
  const [deployees, setDeployees] = useState<Set<AppCategory | 'unresolved'>>(new Set())
  const [recherche, setRecherche] = useState('')
  const [maintenant, setMaintenant] = useState(Date.now())

  useEffect(() => {
    void load()
    void nexus.app
      .discoverInstalledApps()
      .then((liste) => setApps(liste))
      .finally(() => setChargementApps(false))

    const unsubSession = nexus.blocking.onSessionChange(setSession)
    const unsubCatalog = nexus.app.onCatalogUpdated((liste) => setApps(liste))
    return () => {
      unsubSession()
      unsubCatalog()
    }
  }, [load, setSession])

  useEffect(() => {
    if (!session.active) return
    const timer = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session.active])

  const groupes = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    const retenues = apps.filter(
      (app) =>
        !app.isProtected &&
        (terme === '' ||
          app.name.toLowerCase().includes(terme) ||
          app.exeName.toLowerCase().includes(terme)),
    )
    const categorisees = APP_CATEGORIES.map((categorie) => ({
      categorie: categorie as AppCategory | 'unresolved',
      label: CATEGORY_LABELS[categorie],
      color: CATEGORY_COLORS[categorie],
      apps: retenues
        .filter(
          (app) => app.category === categorie && app.classificationState !== 'UNRESOLVED',
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    }))
    const visibles = terme === '' ? categorisees : categorisees.filter((groupe) => groupe.apps.length)
    const nonClassees = retenues
      .filter((app) => app.category === null || app.classificationState === 'UNRESOLVED')
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    if (nonClassees.length) {
      visibles.push({
        categorie: 'unresolved',
        label: 'Non classées',
        color: 'border-warn/40 bg-warn/10 text-warn',
        apps: nonClassees,
      })
    }
    return visibles
  }, [apps, recherche])

  async function rafraichir(): Promise<void> {
    setRafraichissement(true)
    try {
      setApps(await nexus.app.refreshInstalledApps())
    } finally {
      setRafraichissement(false)
    }
  }

  async function changerCategorie(
    app: AppInstallee,
    nouvelleCat: AppCategory | 'reset',
  ): Promise<void> {
    const appKey = app.id || app.exeName || app.name
    if (nouvelleCat === 'reset') {
      await nexus.app.resetUserOverride(appKey)
      setApps(await nexus.app.discoverInstalledApps())
      return
    }
    await nexus.app.setUserOverride(appKey, nouvelleCat)
    setApps((precedent) =>
      precedent.map((candidate) =>
        (candidate.id && candidate.id === app.id) ||
        candidate.exeName === app.exeName ||
        candidate.name === app.name
          ? {
              ...candidate,
              category: nouvelleCat,
              classificationState: 'RESOLVED',
              classificationSource: 'USER_OVERRIDE',
              classificationReasonCode: 'USER_MANUAL_OVERRIDE',
            }
          : candidate,
      ),
    )
  }

  function basculerCategorie(categorie: AppCategory | 'unresolved'): void {
    setDeployees((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(categorie)) suivant.delete(categorie)
      else suivant.add(categorie)
      return suivant
    })
  }

  return (
    <PageTransition>
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-8 px-14 pb-14 pt-12">
        <header>
          <h1 className="text-2xl font-semibold text-fg">Blocage</h1>
          <p className="mt-1 text-sm text-fg-2">
            Gère ici le catalogue. Le blocage démarre avec « Je commence » et dure exactement
            le temps de la tâche.
          </p>
        </header>

        <section
          className={`flex items-start gap-3 rounded border p-4 ${
            session.active ? 'border-accent/40 bg-accent/10' : 'border-line bg-surface'
          }`}
        >
          {session.active ? (
            <Shield size={20} className="mt-0.5 shrink-0 text-accent" />
          ) : (
            <ShieldOff size={20} className="mt-0.5 shrink-0 text-fg-3" />
          )}
          <div className="min-w-0 flex-1">
            {session.active ? (
              <>
                <p className="text-sm font-medium text-accent">
                  Tâche en cours · {session.blockedAppIds.length} application
                  {session.blockedAppIds.length > 1 ? 's' : ''} bloquée
                  {session.blockedAppIds.length > 1 ? 's' : ''}
                </p>
                <p className="mt-0.5 text-xs text-accent/70">
                  {session.endsAt === null
                    ? 'Sans échéance connue'
                    : `Se termine dans ${resteAvant(session.endsAt, maintenant)}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {session.blockedAppIds.map((id) => {
                    const app = apps.find((candidate) => candidate.exeName === id)
                    return (
                      <span
                        key={id}
                        className="flex items-center gap-1.5 rounded bg-accent/15 px-2 py-1 text-xs text-accent"
                      >
                        {app?.iconDataUrl !== undefined && (
                          <img src={app.iconDataUrl} alt="" className="h-4 w-4 rounded" />
                        )}
                        {app?.name ?? id}
                      </span>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-fg-2">
                Aucun blocage en cours. Les applications choisies sur la prochaine tâche seront
                bloquées pendant sa durée.
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium text-fg">
              Applications installées
              <span className="ml-2 text-fg-3">{chargementApps ? '…' : apps.length}</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void rafraichir()}
                disabled={rafraichissement || chargementApps}
                title="Relancer le scan des applications installées"
                className="flex items-center gap-1.5 rounded border border-line px-3 py-2 text-xs text-fg-2 transition hover:border-line-strong hover:text-fg disabled:opacity-40"
              >
                <RefreshCw size={13} className={rafraichissement ? 'animate-spin' : ''} />
                {rafraichissement ? 'Scan…' : 'Rafraîchir'}
              </button>
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
                />
                <input
                  type="text"
                  name="app-search"
                  value={recherche}
                  onChange={(event) => setRecherche(event.target.value)}
                  placeholder="Rechercher une application…"
                  className="field w-64 py-2 pl-8 pr-3 text-xs"
                  aria-label="Rechercher une application"
                />
              </div>
            </div>
          </div>

          {(chargementApps || rafraichissement) && (
            <p className="rounded border border-line/70 bg-surface/30 p-6 text-center text-sm text-fg-3">
              {rafraichissement
                ? 'Scan complet : menu Démarrer, registre, App Paths, Program Files, winget, Store…'
                : 'Chargement du catalogue…'}
            </p>
          )}

          {!chargementApps && groupes.length === 0 && (
            <p className="rounded border border-dashed border-line p-8 text-center text-sm text-fg-3">
              Aucune application ne correspond à cette recherche.
            </p>
          )}

          <div className="flex flex-col gap-1">
            {groupes.map(({ categorie, label, color, apps: appsDuGroupe }) => {
              const ouverte = deployees.has(categorie)
              return (
                <div key={categorie} className="overflow-hidden rounded">
                  <button
                    type="button"
                    onClick={() => basculerCategorie(categorie)}
                    aria-expanded={ouverte}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
                      ouverte ? 'bg-surface/70' : 'hover:bg-surface/50'
                    }`}
                  >
                    <ChevronRight
                      size={15}
                      className={`shrink-0 text-fg-3 transition-transform ${
                        ouverte ? 'rotate-90' : ''
                      }`}
                    />
                    <span
                      className={`shrink-0 rounded border px-2.5 py-1 text-[11px] font-semibold ${color}`}
                    >
                      {label}
                    </span>
                    <span className="text-xs text-fg-3">
                      ({appsDuGroupe.length} élément{appsDuGroupe.length > 1 ? 's' : ''})
                    </span>
                  </button>

                  {ouverte && (
                    <div className="flex flex-col gap-1 pb-2 pl-11 pr-2 pt-1">
                      {appsDuGroupe.length === 0 ? (
                        <p className="py-2.5 text-xs text-fg-3 italic">
                          Aucune application installée dans cette catégorie.
                        </p>
                      ) : (
                        appsDuGroupe.map((app) => (
                          <div
                            key={app.id || app.exeName}
                            className="flex items-center justify-between gap-3 rounded border border-transparent px-3 py-2 hover:border-line hover:bg-surface/60"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <IconeApp app={app} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-fg">
                                  {app.name}
                                </span>
                                <span className="flex items-center gap-2 font-mono text-[11px] text-fg-3">
                                  <span className="truncate">{app.exeName}</span>
                                  {app.classificationSource === 'USER_OVERRIDE' && (
                                    <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-sans text-[10px] text-accent">
                                      Manuel
                                    </span>
                                  )}
                                </span>
                              </span>
                            </div>
                            <select
                              value={app.category ?? 'unresolved'}
                              onChange={(event) => {
                                const value = event.target.value
                                if (value === 'reset') void changerCategorie(app, 'reset')
                                else if (value !== 'unresolved') {
                                  void changerCategorie(app, value as AppCategory)
                                }
                              }}
                              className="cursor-pointer rounded border border-line bg-surface-2 px-2 py-1 text-xs text-fg focus:border-accent focus:outline-none"
                              title="Changer la catégorie de cette application"
                              aria-label={`Catégorie de ${app.name}`}
                            >
                              {app.category === null && (
                                <option value="unresolved" disabled>
                                  Non classée
                                </option>
                              )}
                              {APP_CATEGORIES.map((candidate) => (
                                <option key={candidate} value={candidate}>
                                  {CATEGORY_LABELS[candidate]}
                                </option>
                              ))}
                              {app.classificationSource === 'USER_OVERRIDE' && (
                                <option value="reset">↺ Réinitialiser l&apos;auto</option>
                              )}
                            </select>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </PageTransition>
  )
}
