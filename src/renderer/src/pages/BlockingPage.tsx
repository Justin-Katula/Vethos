import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Globe,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  X,
} from 'lucide-react'
import { nexus } from '@/lib/ipc'
import { normaliserDomaine } from '@/lib/domain'
import {
  DURATION_STEP_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  resolveStartAt,
  useBlockingStore,
  type SaveResult,
} from '@/store/blocking.store'
import {
  APP_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type AppCategory,
} from '@shared/app-categories'

const MINUTES_PAR_JOUR = 24 * 60

type AppInstallee = {
  name: string
  exeName: string
  category: AppCategory
  iconDataUrl?: string
}

function minutesEnHeure(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function dureeLisible(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function resteAvant(cible: number, now: number): string {
  const restant = Math.max(0, cible - now)
  const minutes = Math.floor(restant / 60_000)
  const secondes = Math.floor((restant % 60_000) / 1000)
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
  return `${minutes} min ${String(secondes).padStart(2, '0')} s`
}

function prochainCreneauRond(): number {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return (Math.ceil(minutes / DURATION_STEP_MINUTES) * DURATION_STEP_MINUTES) % MINUTES_PAR_JOUR
}

type Brouillon = {
  mode: 'now' | 'later'
  durationMinutes: number
  startMinute: number
  appIds: string[]
  blockedSites: string[]
}

function brouillonVide(): Brouillon {
  return {
    mode: 'now',
    durationMinutes: MIN_DURATION_MINUTES,
    startMinute: prochainCreneauRond(),
    appIds: [],
    blockedSites: [],
  }
}

function Stepper({
  valeur,
  onChange,
  pas,
  min,
  max,
  format,
  etiquette,
}: {
  valeur: number
  onChange: (v: number) => void
  pas: number
  min: number
  max: number
  format: (v: number) => string
  etiquette: string
}): JSX.Element {
  const bouton =
    'flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle text-text-secondary transition hover:border-border-strong hover:text-text-primary disabled:opacity-30'
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Diminuer ${etiquette}`}
        disabled={valeur <= min}
        onClick={() => onChange(Math.max(min, valeur - pas))}
        className={bouton}
      >
        <Minus size={15} />
      </button>
      <span className="min-w-[5.5rem] text-center font-mono text-sm text-text-primary">
        {format(valeur)}
      </span>
      <button
        type="button"
        aria-label={`Augmenter ${etiquette}`}
        disabled={valeur >= max}
        onClick={() => onChange(Math.min(max, valeur + pas))}
        className={bouton}
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

function ChampSites({
  sites,
  onChange,
  erreur,
}: {
  sites: string[]
  onChange: (sites: string[]) => void
  erreur: string | null
}): JSX.Element {
  const [saisie, setSaisie] = useState('')
  const [invalide, setInvalide] = useState(false)

  function ajouter(): void {
    const domaine = normaliserDomaine(saisie)
    if (domaine === null) {
      setInvalide(saisie.trim().length > 0)
      return
    }
    setInvalide(false)
    setSaisie('')
    if (!sites.includes(domaine)) onChange([...sites, domaine])
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text-secondary">
        Sites web
        {sites.length > 0 && (
          <span className="ml-2 normal-case text-text-secondary">{sites.length} bloqué{sites.length > 1 ? 's' : ''}</span>
        )}
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={saisie}
            onChange={(e) => {
              setSaisie(e.target.value)
              setInvalide(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ajouter()
              }
            }}
            placeholder="youtube.com"
            className={`w-full rounded-lg border bg-bg-base py-2 pl-8 pr-3 text-sm text-text-primary outline-none transition focus:border-border-strong ${
              invalide || erreur !== null ? 'border-red-500/60' : 'border-border-subtle'
            }`}
          />
        </div>
        <button
          type="button"
          onClick={ajouter}
          className="rounded-lg border border-border-subtle px-3 text-sm text-text-secondary transition hover:border-border-strong hover:text-text-primary"
        >
          Ajouter
        </button>
      </div>
      {invalide && (
        <p className="mt-1.5 text-xs text-red-400">
          Entre un domaine, par exemple « youtube.com ».
        </p>
      )}
      {erreur !== null && <p className="mt-1.5 text-xs text-red-400">{erreur}</p>}
      {sites.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sites.map((site) => (
            <span
              key={site}
              className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-card/60 py-1 pl-2.5 pr-1 text-xs text-text-secondary"
            >
              {site}
              <button
                type="button"
                onClick={() => onChange(sites.filter((s) => s !== site))}
                aria-label={`Retirer ${site}`}
                className="rounded p-0.5 text-text-muted transition hover:bg-bg-card-hover hover:text-red-400"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-text-muted">
        Seule la page du site est recouverte : tes onglets et ta barre d&apos;adresse restent
        visibles, et changer d&apos;onglet lève le blocage.
      </p>
    </div>
  )
}

function IconeApp({ app }: { app: AppInstallee }): JSX.Element {
  if (app.iconDataUrl !== undefined) {
    return <img src={app.iconDataUrl} alt="" className="h-7 w-7 shrink-0 rounded" />
  }
  // Repli lisible plutôt qu'un carré vide : l'initiale suffit à distinguer.
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-bg-card-hover text-xs font-semibold text-text-secondary">
      {app.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export default function BlockingPage(): JSX.Element {
  const { session, pending, load, startSession, cancelPending, setSession } = useBlockingStore()
  const [apps, setApps] = useState<AppInstallee[]>([])
  const [chargementApps, setChargementApps] = useState(true)
  const [rafraichissement, setRafraichissement] = useState(false)
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null)
  const [erreur, setErreur] = useState<Extract<SaveResult, { ok: false }> | null>(null)
  const [deployees, setDeployees] = useState<Set<AppCategory>>(new Set())
  const [recherche, setRecherche] = useState('')
  const [maintenant, setMaintenant] = useState(Date.now())

  useEffect(() => {
    void load()
    void nexus.app
      .discoverInstalledApps()
      .then((liste) => setApps(liste))
      .finally(() => setChargementApps(false))
    return nexus.blocking.onSessionChange(setSession)
  }, [load, setSession])

  useEffect(() => {
    if (!session.active && pending === null) return
    const timer = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session.active, pending])

  /**
   * Applications groupées par catégorie, dans l'ordre du catalogue — « Autres »
   * reste en dernier. Une catégorie vide après filtrage disparaît : mieux vaut
   * une liste courte qu'une rangée de compteurs à zéro.
   */
  const groupes = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    const retenues = apps.filter((a) => terme === '' || a.name.toLowerCase().includes(terme))
    return APP_CATEGORIES.map((cat) => ({
      categorie: cat,
      apps: retenues
        .filter((a) => a.category === cat)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    })).filter((groupe) => groupe.apps.length > 0)
  }, [apps, recherche])

  async function rafraichir(): Promise<void> {
    setRafraichissement(true)
    try {
      setApps(await nexus.app.refreshInstalledApps())
    } finally {
      setRafraichissement(false)
    }
  }

  /**
   * Met à jour les sites du brouillon, en l'ouvrant s'il n'existe pas encore.
   * Même logique que pour les applications : ajouter une cible démarre la
   * composition d'un blocage, sans passer par un bouton préalable.
   */
  function ajouterSites(sites: string[]): void {
    setErreur(null)
    if (brouillon === null) {
      setBrouillon({ ...brouillonVide(), blockedSites: sites })
      return
    }
    setBrouillon({ ...brouillon, blockedSites: sites })
  }

  function basculerCategorie(cat: AppCategory): void {
    setDeployees((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(cat)) suivant.delete(cat)
      else suivant.add(cat)
      return suivant
    })
  }

  function basculerApp(exeName: string): void {
    setErreur(null)
    // Cliquer une application sans blocage en cours d'édition en démarre un
    // directement : pas besoin de passer par « Nouveau blocage » d'abord.
    if (brouillon === null) {
      setBrouillon({ ...brouillonVide(), appIds: [exeName] })
      return
    }
    const choisie = brouillon.appIds.includes(exeName)
    setBrouillon({
      ...brouillon,
      appIds: choisie
        ? brouillon.appIds.filter((id) => id !== exeName)
        : [...brouillon.appIds, exeName],
    })
  }

  async function lancer(): Promise<void> {
    if (brouillon === null) return
    const resultat = await startSession({
      appIds: brouillon.appIds,
      blockedSites: brouillon.blockedSites,
      durationMinutes: brouillon.durationMinutes,
      startMinute: brouillon.mode === 'now' ? null : brouillon.startMinute,
    })
    // Le formulaire ne se ferme QUE si le lancement a réussi.
    if (!resultat.ok) {
      setErreur(resultat)
      return
    }
    setErreur(null)
    setBrouillon(null)
  }

  const messageDe = (champ: string): string | null =>
    erreur !== null && erreur.field === champ ? erreur.message : null

  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-8 px-14 pb-14 pt-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Blocage</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Vethos continue de surveiller l&apos;heure même fenêtre fermée.
          </p>
        </div>
        {brouillon === null && !session.active && (
          <button
            type="button"
            onClick={() => {
              setErreur(null)
              setBrouillon(brouillonVide())
            }}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-base transition hover:bg-white"
          >
            <Plus size={16} />
            Nouveau blocage
          </button>
        )}
      </header>

      <section
        className={`flex items-start gap-3 rounded-xl border p-4 ${
          session.active ? 'border-amber-500/40 bg-amber-500/10' : 'border-border-subtle bg-bg-card/40'
        }`}
      >
        {session.active ? (
          <Shield size={20} className="mt-0.5 shrink-0 text-amber-400" />
        ) : (
          <ShieldOff size={20} className="mt-0.5 shrink-0 text-text-muted" />
        )}
        <div className="min-w-0 flex-1">
          {session.active ? (
            <>
              <p className="text-sm font-medium text-amber-200">
                Session active, {session.blockedAppIds.length} application
                {session.blockedAppIds.length > 1 ? 's' : ''} bloquée
                {session.blockedAppIds.length > 1 ? 's' : ''}
              </p>
              <p className="mt-0.5 text-xs text-amber-200/70">
                {session.endsAt === null
                  ? 'Sans échéance connue'
                  : `Se termine dans ${resteAvant(session.endsAt, maintenant)}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {session.blockedAppIds.map((id) => {
                  const app = apps.find((a) => a.exeName === id)
                  return (
                    <span
                      key={id}
                      className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-100"
                    >
                      {app?.iconDataUrl !== undefined && (
                        <img src={app.iconDataUrl} alt="" className="h-4 w-4 rounded-sm" />
                      )}
                      {app?.name ?? id}
                    </span>
                  )
                })}
              </div>
            </>
          ) : pending !== null ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Blocage programmé, démarre dans {resteAvant(pending.startedAt, maintenant)}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {pending.appIds.length} application{pending.appIds.length > 1 ? 's' : ''} ·
                  pendant {dureeLisible(Math.round((pending.endsAt - pending.startedAt) / 60_000))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void cancelPending()}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card-hover hover:text-text-primary"
              >
                Annuler
              </button>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Aucun blocage en cours ni programmé.</p>
          )}
        </div>
      </section>

      {brouillon !== null && (
        <section className="flex flex-col gap-5 rounded-xl border border-border-subtle bg-bg-card/40 p-5">
          <div className="flex rounded-lg border border-border-subtle p-1">
            {(['now', 'later'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setErreur(null)
                  setBrouillon({ ...brouillon, mode })
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  brouillon.mode === mode
                    ? 'bg-accent text-bg-base'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {mode === 'now' ? 'Maintenant' : 'Plus tard'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-text-secondary">
                Pendant
              </p>
              <Stepper
                valeur={brouillon.durationMinutes}
                onChange={(v) => setBrouillon({ ...brouillon, durationMinutes: v })}
                pas={DURATION_STEP_MINUTES}
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
                format={dureeLisible}
                etiquette="la durée"
              />
            </div>

            {brouillon.mode === 'later' && (
              <div>
                <p className="mb-2 text-sm font-medium text-text-secondary">
                  À partir de
                </p>
                <Stepper
                  valeur={brouillon.startMinute}
                  onChange={(v) => setBrouillon({ ...brouillon, startMinute: v })}
                  pas={DURATION_STEP_MINUTES}
                  min={0}
                  max={MINUTES_PAR_JOUR - DURATION_STEP_MINUTES}
                  format={minutesEnHeure}
                  etiquette="l'heure de début"
                />
              </div>
            )}
          </div>

          {messageDe('duration') !== null && (
            <p className="text-xs text-red-400">{messageDe('duration')}</p>
          )}

          <p className="text-xs text-text-muted">
            {brouillon.mode === 'now'
              ? `Blocage immédiat pendant ${dureeLisible(brouillon.durationMinutes)}.`
              : `Démarre ${
                  // Une heure déjà passée vise forcément demain : le dire évite
                  // de croire qu'on a programmé un blocage dans le passé.
                  resolveStartAt(brouillon.startMinute, new Date()) >
                  new Date().setHours(23, 59, 59, 999)
                    ? 'demain'
                    : "aujourd'hui"
                } à ${minutesEnHeure(brouillon.startMinute)}, pendant ${dureeLisible(
                  brouillon.durationMinutes,
                )}.`}
          </p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setErreur(null)
                setBrouillon(null)
              }}
              className="rounded-lg px-4 py-2 text-sm text-text-secondary transition hover:text-text-primary"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void lancer()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg-base transition hover:bg-white"
            >
              {brouillon.mode === 'now' ? 'Bloquer maintenant' : 'Programmer'}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-primary">Sites web</h2>
        <div className="rounded-xl border border-border-subtle bg-bg-card/40 p-4">
          <ChampSites
            sites={brouillon?.blockedSites ?? []}
            onChange={ajouterSites}
            erreur={messageDe('sites')}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-text-primary">
            Applications installées
            <span className="ml-2 text-text-muted">{chargementApps ? '…' : apps.length}</span>
            {brouillon !== null && brouillon.appIds.length > 0 && (
              <span className="ml-2 text-text-secondary">
                · {brouillon.appIds.length} choisie{brouillon.appIds.length > 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void rafraichir()}
              disabled={rafraichissement || chargementApps}
              title="Relancer le scan des applications installées"
              className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary transition hover:border-border-strong hover:text-text-primary disabled:opacity-40"
            >
              <RefreshCw size={13} className={rafraichissement ? 'animate-spin' : ''} />
              {rafraichissement ? 'Scan…' : 'Rafraîchir'}
            </button>
            <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une application…"
              className="w-64 rounded-lg border border-border-subtle bg-bg-base/60 py-2 pl-8 pr-3 text-xs text-text-primary outline-none transition focus:border-border-strong"
            />
            </div>
          </div>
        </div>

        {(chargementApps || rafraichissement) && (
          <p className="rounded-xl border border-border-subtle/70 bg-bg-card/30 p-6 text-center text-sm text-text-muted">
            {rafraichissement
              ? 'Scan complet : menu Démarrer, registre, App Paths, Program Files, winget, Store…'
              : 'Chargement du catalogue…'}
          </p>
        )}

        {!chargementApps && groupes.length === 0 && (
          <p className="rounded-xl border border-dashed border-border-subtle p-8 text-center text-sm text-text-muted">
            Aucune application ne correspond à cette recherche.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {groupes.map(({ categorie: cat, apps: appsDuGroupe }) => {
            const ouverte = deployees.has(cat)
            const choisiesIci = appsDuGroupe.filter((a) =>
              (brouillon?.appIds ?? []).includes(a.exeName),
            ).length
            return (
              <div key={cat} className="overflow-hidden rounded-xl">
                <button
                  type="button"
                  onClick={() => basculerCategorie(cat)}
                  aria-expanded={ouverte}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
                    ouverte ? 'bg-bg-card/70' : 'hover:bg-bg-card/50'
                  }`}
                >
                  <ChevronRight
                    size={15}
                    className={`shrink-0 text-text-muted transition-transform ${
                      ouverte ? 'rotate-90' : ''
                    }`}
                  />
                  <span
                    className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${CATEGORY_COLORS[cat]}`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="text-xs text-text-muted">
                    ({appsDuGroupe.length} élément{appsDuGroupe.length > 1 ? 's' : ''})
                  </span>
                  {choisiesIci > 0 && (
                    <span className="ml-auto shrink-0 text-xs font-medium text-amber-300">
                      {choisiesIci} choisie{choisiesIci > 1 ? 's' : ''}
                    </span>
                  )}
                </button>

                {ouverte && (
                  <div className="flex flex-col gap-1 pb-2 pl-11 pr-2 pt-1">
                    {appsDuGroupe.map((app) => {
                      const choisie = brouillon?.appIds.includes(app.exeName) ?? false
                      return (
                        <button
                          key={app.exeName}
                          type="button"
                          disabled={session.active}
                          onClick={() => basculerApp(app.exeName)}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                            choisie
                              ? 'border-amber-500/40 bg-amber-500/10'
                              : 'border-transparent hover:border-border-subtle hover:bg-bg-card/60'
                          }`}
                        >
                          <IconeApp app={app} />
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm font-medium ${
                                choisie ? 'text-amber-100' : 'text-text-primary'
                              }`}
                            >
                              {app.name}
                            </span>
                            <span className="block truncate font-mono text-[11px] text-text-muted">
                              {app.exeName}
                            </span>
                          </span>
                          {choisie && <Check size={16} className="shrink-0 text-amber-400" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
