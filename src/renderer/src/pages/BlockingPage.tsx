import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Search, Shield, ShieldOff, X } from 'lucide-react'
import { nexus } from '@/lib/ipc'
import {
  DURATION_STEP_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  resolveStartAt,
  useBlockingStore,
  type SaveResult,
} from '@/store/blocking.store'
import { APP_CATEGORIES, CATEGORY_LABELS, type AppCategory } from '@shared/app-categories'

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
}

function brouillonVide(): Brouillon {
  return {
    mode: 'now',
    durationMinutes: MIN_DURATION_MINUTES,
    startMinute: prochainCreneauRond(),
    appIds: [],
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
    'flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-30'
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
      <span className="min-w-[5.5rem] text-center font-mono text-sm text-zinc-100">
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

function IconeApp({ app }: { app: AppInstallee }): JSX.Element {
  if (app.iconDataUrl !== undefined) {
    return <img src={app.iconDataUrl} alt="" className="h-7 w-7 shrink-0 rounded" />
  }
  // Repli lisible plutôt qu'un carré vide : l'initiale suffit à distinguer.
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-zinc-800 text-xs font-semibold text-zinc-400">
      {app.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export default function BlockingPage(): JSX.Element {
  const { session, pending, load, startSession, cancelPending, setSession } = useBlockingStore()
  const [apps, setApps] = useState<AppInstallee[]>([])
  const [chargementApps, setChargementApps] = useState(true)
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null)
  const [erreur, setErreur] = useState<Extract<SaveResult, { ok: false }> | null>(null)
  const [categorie, setCategorie] = useState<AppCategory | 'all'>('all')
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

  const categoriesDisponibles = useMemo(() => {
    const presentes = new Set(apps.map((a) => a.category))
    return APP_CATEGORIES.filter((c) => presentes.has(c))
  }, [apps])

  const appsAffichees = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    return apps
      .filter((a) => categorie === 'all' || a.category === categorie)
      .filter((a) => terme === '' || a.name.toLowerCase().includes(terme))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [apps, categorie, recherche])

  async function lancer(): Promise<void> {
    if (brouillon === null) return
    const resultat = await startSession({
      appIds: brouillon.appIds,
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Blocage</h1>
          <p className="mt-1 text-sm text-zinc-400">
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
            className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
          >
            <Plus size={16} />
            Nouveau blocage
          </button>
        )}
      </header>

      <section
        className={`flex items-start gap-3 rounded-xl border p-4 ${
          session.active ? 'border-amber-500/40 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/40'
        }`}
      >
        {session.active ? (
          <Shield size={20} className="mt-0.5 shrink-0 text-amber-400" />
        ) : (
          <ShieldOff size={20} className="mt-0.5 shrink-0 text-zinc-500" />
        )}
        <div className="min-w-0 flex-1">
          {session.active ? (
            <>
              <p className="text-sm font-medium text-amber-200">
                Session active — {session.blockedAppIds.length} application
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
                <p className="text-sm font-medium text-zinc-200">
                  Blocage programmé — démarre dans {resteAvant(pending.startedAt, maintenant)}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {pending.appIds.length} application{pending.appIds.length > 1 ? 's' : ''} ·
                  pendant {dureeLisible(Math.round((pending.endsAt - pending.startedAt) / 60_000))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void cancelPending()}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              >
                Annuler
              </button>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Aucun blocage en cours ni programmé.</p>
          )}
        </div>
      </section>

      {brouillon !== null && (
        <section className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex rounded-lg border border-zinc-800 p-1">
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
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {mode === 'now' ? 'Maintenant' : 'Plus tard'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
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
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
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

          <p className="text-xs text-zinc-500">
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
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:text-zinc-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void lancer()}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
            >
              {brouillon.mode === 'now' ? 'Bloquer maintenant' : 'Programmer'}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Applications
              <span className="ml-2 normal-case text-zinc-500">
                {chargementApps ? '…' : apps.length}
              </span>
              {brouillon !== null && brouillon.appIds.length > 0 && (
                <span className="ml-2 normal-case text-zinc-300">
                  · {brouillon.appIds.length} choisie{brouillon.appIds.length > 1 ? 's' : ''}
                </span>
              )}
            </p>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher…"
                className="w-48 rounded-lg border border-zinc-800 bg-zinc-950 py-1.5 pl-7 pr-2 text-xs text-zinc-100 outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          <div className="mb-2 flex flex-wrap gap-1.5">
            {(['all', ...categoriesDisponibles] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategorie(c)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  categorie === c
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {c === 'all' ? 'Toutes' : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <div
            className={`max-h-64 overflow-y-auto rounded-lg border bg-zinc-950 ${
              messageDe('apps') !== null ? 'border-red-500/60' : 'border-zinc-800'
            }`}
          >
            {chargementApps && (
              <p className="p-3 text-sm text-zinc-500">
                Recherche des applications installées, menu Démarrer, registre et Microsoft Store…
              </p>
            )}
            {!chargementApps && appsAffichees.length === 0 && (
              <p className="p-3 text-sm text-zinc-500">Aucune application dans cette sélection.</p>
            )}
            {appsAffichees.map((app) => {
              const choisie = brouillon?.appIds.includes(app.exeName) ?? false
              return (
                <button
                  key={app.exeName}
                  type="button"
                  disabled={session.active}
                  onClick={() => {
                    setErreur(null)
                    // Cliquer une application sans blocage en cours d'édition
                    // en démarre un directement : pas besoin de passer par le
                    // bouton « Nouveau blocage » d'abord.
                    if (brouillon === null) {
                      setBrouillon({ ...brouillonVide(), appIds: [app.exeName] })
                      return
                    }
                    setBrouillon({
                      ...brouillon,
                      appIds: choisie
                        ? brouillon.appIds.filter((id) => id !== app.exeName)
                        : [...brouillon.appIds, app.exeName],
                    })
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${
                    choisie ? 'bg-zinc-800/70 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900'
                  }`}
                >
                  <IconeApp app={app} />
                  <span className="min-w-0 flex-1 truncate">{app.name}</span>
                  <span className="shrink-0 text-xs text-zinc-600">
                    {CATEGORY_LABELS[app.category]}
                  </span>
                  {choisie && <X size={14} className="shrink-0 text-zinc-500" />}
                </button>
              )
            })}
          </div>
          {messageDe('apps') !== null && (
            <p className="mt-1.5 text-xs text-red-400">{messageDe('apps')}</p>
          )}
        </div>
      </section>
    </div>
  )
}
