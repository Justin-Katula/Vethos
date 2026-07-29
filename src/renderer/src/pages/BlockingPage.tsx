import { useEffect, useMemo, useState } from 'react'
import { Plus, Shield, ShieldOff, Trash2 } from 'lucide-react'
import { nexus } from '@/lib/ipc'
import { useBlockingStore, type SlotDraft } from '@/store/blocking.store'
import type { RecurringSlot } from '@shared/schemas'

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function minutesEnHeure(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function heureEnMinutes(valeur: string): number {
  const [h, m] = valeur.split(':')
  return Number(h ?? 0) * 60 + Number(m ?? 0)
}

function resteAvant(endsAt: number, now: number): string {
  const restant = Math.max(0, endsAt - now)
  const minutes = Math.floor(restant / 60_000)
  const secondes = Math.floor((restant % 60_000) / 1000)
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
  }
  return `${minutes} min ${String(secondes).padStart(2, '0')} s`
}

const BROUILLON_VIDE: SlotDraft = {
  label: '',
  daysOfWeek: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 12 * 60,
  appIds: [],
}

type AppInstallee = { name: string; exeName: string }

export default function BlockingPage(): JSX.Element {
  const { loaded, slots, session, load, saveSlot, deleteSlot, setSession } = useBlockingStore()
  const [apps, setApps] = useState<AppInstallee[]>([])
  const [brouillon, setBrouillon] = useState<SlotDraft | null>(null)
  const [maintenant, setMaintenant] = useState(Date.now())

  useEffect(() => {
    void load()
    void nexus.app.discoverInstalledApps().then((liste) => {
      setApps(liste.map((a) => ({ name: a.name, exeName: a.exeName })))
    })
    return nexus.blocking.onSessionChange(setSession)
  }, [load, setSession])

  // Compte à rebours : une seconde suffit, la précision au-delà n'apporte rien.
  useEffect(() => {
    if (!session.active) return
    const timer = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session.active])

  const appsTriees = useMemo(
    () => [...apps].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [apps],
  )

  function editer(slot: RecurringSlot): void {
    setBrouillon({
      id: slot.id,
      label: slot.label,
      daysOfWeek: [...slot.daysOfWeek],
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      appIds: [...slot.appIds],
    })
  }

  async function enregistrer(): Promise<void> {
    if (brouillon === null) return
    await saveSlot(brouillon)
    setBrouillon(null)
  }

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
            onClick={() => setBrouillon({ ...BROUILLON_VIDE })}
            className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
          >
            <Plus size={16} />
            Nouveau créneau
          </button>
        )}
      </header>

      <section
        className={`flex items-center gap-3 rounded-xl border p-4 ${
          session.active
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-zinc-800 bg-zinc-900/40'
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
                {' · '}
                Modifier les règles n&apos;abrège pas une session en cours.
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
        <section className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <input
            type="text"
            value={brouillon.label}
            onChange={(e) => setBrouillon({ ...brouillon, label: e.target.value })}
            placeholder="Nom du créneau — « Matin de travail »"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
          />

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

          <div className="flex items-center gap-3 text-sm text-zinc-300">
            <label className="flex items-center gap-2">
              De
              <input
                type="time"
                value={minutesEnHeure(brouillon.startMinute)}
                onChange={(e) =>
                  setBrouillon({ ...brouillon, startMinute: heureEnMinutes(e.target.value) })
                }
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-zinc-100 outline-none focus:border-zinc-600"
              />
            </label>
            <label className="flex items-center gap-2">
              à
              <input
                type="time"
                value={minutesEnHeure(brouillon.endMinute)}
                onChange={(e) =>
                  setBrouillon({ ...brouillon, endMinute: heureEnMinutes(e.target.value) })
                }
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-zinc-100 outline-none focus:border-zinc-600"
              />
            </label>
            {brouillon.endMinute < brouillon.startMinute && (
              <span className="text-xs text-zinc-500">franchit minuit</span>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Applications à bloquer
            </p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950">
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
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setBrouillon(null)}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:text-zinc-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void enregistrer()}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
            >
              Enregistrer
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        {loaded && slots.length === 0 && brouillon === null && (
          <p className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            Aucun créneau. Vethos ne bloquera rien tant que tu n&apos;en auras pas défini un.
          </p>
        )}

        {slots.map((slot) => (
          <article
            key={slot.id}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <button
              type="button"
              onClick={() => editer(slot)}
              className="min-w-0 flex-1 text-left"
            >
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
