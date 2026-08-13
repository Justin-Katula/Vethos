import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { WeekGrid } from '@/components/week/WeekGrid'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { dateKey } from '@/lib/planning/dates'
import { sleepScheduleEntries } from '@shared/sleep'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/palette'
import type { PlacedBlock } from '@/lib/planning/types'

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

const KIND_LABEL: Record<PlacedBlock['kind'], string> = {
  task: 'Tâche',
  objective: 'Objectif',
  ancre: 'Ancre',
}

/**
 * Ma semaine.
 *
 * Une seule question, une seule réponse : à quoi vont ressembler mes sept
 * prochains jours. Rien d'autre ne vit sur cette page.
 */
export default function WeekPage() {
  const [now, setNow] = useState(() => new Date())
  const [selected, setSelected] = useState<PlacedBlock | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const plan = usePlanning(now)
  const schedule = usePlanningStore((s) => s.schedule)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const reduce = useReducedMotion()

  const today = dateKey(now)
  const nowMinute = now.getHours() * 60 + now.getMinutes()

  const fullSchedule = useMemo(
    () => [...sleepScheduleEntries(sleepStart, sleepEnd), ...schedule],
    [schedule, sleepStart, sleepEnd],
  )

  const dates = plan?.capacities.map((c) => c.date) ?? []
  const placed = plan?.blocks ?? []

  const totals = useMemo(() => {
    const byKind = { task: 0, objective: 0, ancre: 0 }
    for (const b of placed) byKind[b.kind] += b.workMinutes
    return byKind
  }, [placed])

  const nothingDeclared = schedule.length === 0 && placed.length === 0

  return (
    <PageTransition>
      <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-y-auto px-14 pb-14 pt-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold text-fg">Ma semaine</h1>
            <p className="mt-1.5 max-w-xl text-sm text-fg-3">
              Tout ce qui prend de la place, à l{'’'}échelle. Le sombre est déjà pris, le clair
              t{'’'}appartient.
            </p>
          </div>

          {placed.length > 0 && (
            <motion.dl
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="flex items-baseline gap-7"
            >
              <Total label="Tâches" minutes={totals.task} tone="text-fg" />
              <Total label="Objectifs" minutes={totals.objective} tone="text-fg-2" />
              <Total label="Ancres" minutes={totals.ancre} tone="text-fg-3" />
            </motion.dl>
          )}
        </header>

        {nothingDeclared ? (
          <div className="surface flex flex-col items-start gap-3 px-8 py-10">
            <p className="text-sm text-fg-2">
              La semaine est vide parce que l{'’'}application ne sait pas encore de quoi elle est
              faite.
            </p>
            <p className="max-w-lg text-xs text-fg-3">
              Déclare tes heures de sommeil, tes cours ou ton travail, puis ajoute une tâche. Le
              tableau se remplit tout seul : tu n{'’'}as jamais à placer quoi que ce soit toi-même.
            </p>
            <Link
              to="/temps"
              className="pressable mt-2 rounded-md bg-fg px-4 py-2 text-sm font-medium text-base"
            >
              Déclarer mon temps
            </Link>
          </div>
        ) : (
          <WeekGrid
            dates={dates}
            schedule={fullSchedule}
            blocks={placed}
            today={today}
            nowMinute={nowMinute}
            onSelect={setSelected}
          />
        )}

        <AnimatePresence>
          {selected && (
            <motion.aside
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="surface fixed bottom-8 left-1/2 z-40 w-[min(28rem,calc(100vw-8rem))] -translate-x-1/2 px-5 py-4"
            >
              <div className="flex items-start gap-4">
                <span
                  className="mt-1 h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: selected.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{selected.label}</p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-fg-2">
                    {hhmm(selected.startMinute)} {'→'} {hhmm(selected.endMinute)}
                    <span className="ml-2 font-sans text-fg-3">
                      {KIND_LABEL[selected.kind]} · {duration(selected.workMinutes)}
                    </span>
                  </p>
                  {selected.breakMinutes > 0 && (
                    <p className="mt-1 text-[11px] text-fg-3">
                      dont {selected.breakMinutes} min de pause, incluses dans le bloc
                    </p>
                  )}
                  {selected.reducedToMinimum && (
                    <p className="mt-1 text-[11px] text-fg-3">
                      Réduite à sa version minimale : la journée était saturée.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 text-fg-3 transition-colors hover:text-fg"
                  aria-label="Fermer"
                >
                  <X size={15} />
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {placed.length > 0 && (
          <Legend schedule={fullSchedule} />
        )}
      </div>
    </PageTransition>
  )
}

function Total({ label, minutes, tone }: { label: string; minutes: number; tone: string }) {
  if (minutes <= 0) return null
  return (
    <div>
      <dd className={`font-mono text-lg tabular-nums ${tone}`}>{duration(minutes)}</dd>
      <dt className="mt-0.5 text-[11px] text-fg-3">{label}</dt>
    </div>
  )
}

/**
 * La légende n'existe que pour ce que la grille ne nomme pas : les bandes
 * sombres. Les blocs clairs portent déjà leur nom.
 */
function Legend({ schedule }: { schedule: { categoryType: keyof typeof CATEGORY_LABEL }[] }) {
  const kinds = [...new Set(schedule.map((e) => e.categoryType))]
  if (kinds.length === 0) return null

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-2 text-[11px] text-fg-3">
          <span
            className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-line"
            style={{ backgroundColor: CATEGORY_COLOR[k] }}
          />
          {CATEGORY_LABEL[k]}
        </span>
      ))}
    </div>
  )
}
