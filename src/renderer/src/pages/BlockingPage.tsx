import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Shield, ShieldOff, Trash2 } from 'lucide-react'
import { nexus } from '@/lib/ipc'
import {
  DURATION_STEP_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  useBlockingStore,
  type SaveResult,
} from '@/store/blocking.store'
import type { RecurringSlot } from '@shared/schemas'

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const MINUTES_PAR_JOUR = 24 * 60

function minutesEnHeure(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function dureeLisible(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function resteAvant(endsAt: number, now: number): string {
  const restant = Math.max(0, endsAt - now)
  const minutes = Math.floor(restant / 60_000)
  const secondes = Math.floor((restant % 60_000) / 1000)
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
  return `${minutes} min ${String(secondes).padStart(2, '0')} s`
}

/** Prochain multiple du pas, à partir de l'heure courante. */
function prochainCreneauRond(): number {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return (Math.ceil(minutes / DURATION_STEP_MINUTES) * DURATION_STEP_MINUTES) % MINUTES_PAR_JOUR
}

type Mode = 'now' | 'later'

type Brouillon = {
  id?: string
  mode: Mode
  label: string
  durationMinutes: number
  startMinute: number
  daysOfWeek: number[]
  appIds: string[]
}

function brouillonVide(): Brouillon {
  return {
    mode: 'now',
    label: '',
    durationMinutes: MIN_DURATION_MINUTES,
    startMinute: prochainCreneauRond(),
    daysOfWeek: [1, 2, 3, 4, 5],
    appIds: [],
  }
}

type ErreurChamp = Extract<SaveResult, { ok: false }> | null

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
    'flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-30 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400'
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

export default function BlockingPage(): JSX.Element {
  const { loaded, slots, session, load, saveSlot, deleteSlot, startManualSession, setSession } =
    useBlockingStore()
  const [apps, setApps] = useState<Array<{ name: string; exeName: string }>>([])
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null)
  const [erreur, setErreur] = useState<ErreurChamp>(null)
  const [maintenant, setMaintenant] = useState(Date.now())

  useEffect(() => {
    void load()
    void nexus.app.discoverInstalledApps().then((liste) => {
      setApps(liste.map((a) => ({ name: a.name, exeName: a.exeName })))
    })
    return nexus.blocking.onSessionChange(setSession)
  }, [load, setSession])

  useEffect(() => {
    if (!session.active) return
    const timer = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session.active])

  const appsTriees = useMemo(
    () => [...apps].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [apps],
  )

  function ouvrirNouveau(): void {
    setErreur(null)
    setBrouillon(brouillonVide())
  }

  function editer(slot: RecurringSlot): void {
    const duree =
      (slot.endMinute - slot.startMinute + MINUTES_PAR_JOUR) % MINUTES_PAR_JOUR ||
      MIN_DURATION_MINUTES
    setErreur(null)
    setBrouillon({
      id: slot.id,
      mode: 'later',
      label: slot.label,
      durationMinutes: Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, duree)),
      startMinute: slot.startMinute,
      daysOfWeek: [...slot.daysOfWeek],
      appIds: [...slot.appIds],
    })
  }

  async function enregistrer(): Promise<void> {
    if (brouillon === null) return

    const resultat =
      brouillon.mode === 'now'
        ? await startManualSession(brouillon.appIds, brouillon.durationMinutes)
        : await saveSlot({
            id: brouillon.id,
            label: brouillon.label,
            daysOfWeek: brouillon.daysOfWeek,
            startMinute: brouillon.startMinute,
            endMinute: (brouillon.startMinute + brouillon.durationMinutes) % MINUTES_PAR_JOUR,
            appIds: brouillon.appIds,
          })

    // Le formulaire ne se ferme QUE si l'enregistrement a réussi. Le fermer
    // sur un refus obligeait à tout ressaisir — c'était le défaut signalé.
    if (!resultat.ok) {
      setErreur(resultat)
      return
    }
    setErreur(null)
    setBrouillon(null)
  }

  const messageDe = (champ: string): string | null =>
    erreur !== null && erreur.field === champ ? erreur.message : null

  const bordure = (champ: string): string =>
    messageDe(champ) !== null ? 'border-red-500/60' : 'border-zinc-800'

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Blocage</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Vethos continue de surveiller l&apos;heure même fenêtre fermée.
          </p>
        </div>
        {brouillon === null && (
          <button
            type="button"
            onClick={ouvrirNouveau}
            className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
          >
            <Plus size={16} />
            Bloquer
          </button>
        )}
      </header>

      <section
        className={`flex items-center gap-3 rounded-xl border p-4 ${
          session.active ? 'border-amber-500/40 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/40'
        }`}
      >
        {session.active ? (
          <Shield size={20} className="shrink-0 text-amber-400" />
        ) : (
          <ShieldOff size={20} className="shrink-0 text-zinc-500" />
        )}
        <div className="min-w-0">
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
                {' · '}Modifier les règles n&apos;abrège pas une session en cours.
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-400">
              Aucune session active. Le prochain créneau se déclenchera tout seul.
            </p>
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
              ? `Blocage immédiat pendant ${dureeLisible(brouillon.durationMinutes)}, une seule fois.`
              : `Chaque jour coché, de ${minutesEnHeure(brouillon.startMinute)} à ${minutesEnHeure(
                  brouillon.startMinute + brouillon.durationMinutes,
                )}${
                  brouillon.startMinute + brouillon.durationMinutes >= MINUTES_PAR_JOUR
                    ? ' le lendemain'
                    : ''
                }.`}
          </p>

          {brouillon.mode === 'later' && (
            <>
              <div>
                <input
                  type="text"
                  value={brouillon.label}
                  onChange={(e) => setBrouillon({ ...brouillon, label: e.target.value })}
                  placeholder="Nom du créneau — « Matin de travail »"
                  className={`w-full rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 ${bordure('label')}`}
                />
                {messageDe('label') !== null && (
                  <p className="mt-1.5 text-xs text-red-400">{messageDe('label')}</p>
                )}
              </div>

              <div>
                <div className="flex flex-wrap gap-1.5">
                  {JOURS.map((jour, index) => {
                    const actif = brouillon.daysOfWeek.includes(index)
                    return (
                      <button
                        key={jour}
                        type="button"
                        onClick={() =>
                          setBrouillon({
                            ...brouillon,
                            daysOfWeek: actif
                              ? brouillon.daysOfWeek.filter((d) => d !== index)
                              : [...brouillon.daysOfWeek, index],
                          })
                        }
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          actif
                            ? 'bg-zinc-100 text-zinc-900'
                            : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800'
                        }`}
                      >
                        {jour}
                      </button>
                    )
                  })}
                </div>
                {messageDe('days') !== null && (
                  <p className="mt-1.5 text-xs text-red-400">{messageDe('days')}</p>
                )}
              </div>
            </>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Applications à bloquer
              {brouillon.appIds.length > 0 && (
                <span className="ml-2 normal-case text-zinc-400">
                  {brouillon.appIds.length} choisie{brouillon.appIds.length > 1 ? 's' : ''}
                </span>
              )}
            </p>
            <div
              className={`max-h-48 overflow-y-auto rounded-lg border bg-zinc-950 ${bordure('apps')}`}
            >
              {appsTriees.length === 0 && (
                <p className="p-3 text-sm text-zinc-500">Recherche des applications installées…</p>
              )}
              {appsTriees.map((app) => {
                const choisie = brouillon.appIds.includes(app.exeName)
                return (
                  <button
                    key={app.exeName}
                    type="button"
                    onClick={() =>
                      setBrouillon({
                        ...brouillon,
                        appIds: choisie
                          ? brouillon.appIds.filter((id) => id !== app.exeName)
                          : [...brouillon.appIds, app.exeName],
                      })
                    }
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                      choisie ? 'bg-zinc-800/70 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    <span className="truncate">{app.name}</span>
                    <span className="ml-3 shrink-0 font-mono text-xs text-zinc-600">
                      {app.exeName}
                    </span>
                  </button>
                )
              })}
            </div>
            {messageDe('apps') !== null && (
              <p className="mt-1.5 text-xs text-red-400">{messageDe('apps')}</p>
            )}
          </div>

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
              onClick={() => void enregistrer()}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
            >
              {brouillon.mode === 'now' ? 'Bloquer maintenant' : 'Enregistrer le créneau'}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        {loaded && slots.length === 0 && brouillon === null && (
          <p className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            Aucun créneau récurrent. Vethos ne bloquera rien tant que tu n&apos;en auras pas défini.
          </p>
        )}

        {slots.map((slot) => (
          <article
            key={slot.id}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <button type="button" onClick={() => editer(slot)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-zinc-100">{slot.label}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {slot.daysOfWeek.map((d) => JOURS[d]).join(' ')} · {minutesEnHeure(slot.startMinute)}
                {' → '}
                {minutesEnHeure(slot.endMinute)} · {slot.appIds.length} application
                {slot.appIds.length > 1 ? 's' : ''}
              </p>
            </button>
            <button
              type="button"
              onClick={() => void deleteSlot(slot.id)}
              aria-label={`Supprimer le créneau ${slot.label}`}
              className="ml-4 shrink-0 rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-800 hover:text-red-400"
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </section>
    </div>
  )
}
