import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PageTransition } from '@/components/PageTransition'
import { WeekCalendar } from '@/components/week/WeekCalendar'
import { viewportFromSettings } from '@/lib/calendar-viewport'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { dateKey } from '@/lib/planning/dates'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/palette'
import type { ScheduleCategory } from '@shared/schemas'

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

/**
 * Ma semaine.
 *
 * Une seule question, une seule réponse : à quoi vont ressembler mes sept
 * prochains jours. C'est aussi là qu'on déclare son temps, directement sur la
 * grille : voir et poser au même endroit, plutôt que saisir d'un côté et aller
 * vérifier de l'autre.
 */
export default function WeekPage() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const plan = usePlanning(now)
  const schedule = usePlanningStore((s) => s.schedule)
  const setSchedule = usePlanningStore((s) => s.setSchedule)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const reduce = useReducedMotion()

  const today = dateKey(now)
  const nowMinute = now.getHours() * 60 + now.getMinutes()

  // La fenêtre visible va du réveil au coucher. Afficher les heures de sommeil
  // sur une grille d'emploi du temps, c'est huit lignes vides à traverser avant
  // d'atteindre quoi que ce soit.
  const viewport = useMemo(() => viewportFromSettings(sleepStart, sleepEnd), [sleepStart, sleepEnd])

  const dates = useMemo(() => plan?.capacities.map((c) => c.date) ?? [], [plan])
  const placed = useMemo(() => plan?.blocks ?? [], [plan])

  const totals = useMemo(() => {
    const byKind = { task: 0, objective: 0, ancre: 0 }
    for (const b of placed) byKind[b.kind] += b.workMinutes
    return byKind
  }, [placed])

  const usedCategories = useMemo(
    () => [...new Set(schedule.map((e) => e.categoryType))],
    [schedule],
  )

  const empty = schedule.length === 0 && placed.length === 0

  return (
    <PageTransition>
      <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-y-auto px-14 pb-14 pt-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold text-fg">Ma semaine</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-fg-3">
              Tire sur une colonne pour déclarer une occupation. Le sombre est ce qui est déjà pris,
              le clair est ce que le moteur a posé pour toi.
            </p>
          </div>

          {placed.length > 0 && (
            <motion.dl
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex items-baseline gap-7"
            >
              <Total label="Tâches" minutes={totals.task} tone="text-fg" />
              <Total label="Objectifs" minutes={totals.objective} tone="text-fg-2" />
              <Total label="Ancres" minutes={totals.ancre} tone="text-fg-3" />
            </motion.dl>
          )}
        </header>

        {empty ? (
          <div className="surface flex flex-col items-start gap-3 px-8 py-10">
            <p className="text-sm text-fg-2">
              La semaine est vide parce que l{'’'}application ne sait pas encore de quoi elle est
              faite.
            </p>
            <p className="max-w-lg text-xs text-fg-3">
              Tire directement sur la grille pour poser tes cours ou ton travail, puis ajoute une
              tâche. Tu n{'’'}as jamais à placer le travail toi-même : c{'’'}est le moteur qui
              décide où il tombe.
            </p>
            <Link
              to="/temps"
              className="pressable mt-2 rounded-md bg-fg px-4 py-2 text-sm font-medium text-base"
            >
              Régler mon sommeil d{'’'}abord
            </Link>
          </div>
        ) : (
          <>
            <WeekCalendar
              weekDates={dates}
              viewport={viewport}
              entries={schedule}
              blocks={placed}
              today={today}
              nowMinute={nowMinute}
              onChangeEntries={(next) => void setSchedule(next)}
            />
            {usedCategories.length > 0 && <Legend categories={usedCategories} />}
          </>
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
 * La légende ne nomme que les bandes sombres. Les blocs clairs portent déjà
 * leur nom : les répéter ici serait du bruit.
 */
function Legend({ categories }: { categories: ScheduleCategory[] }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
      {categories.map((k) => (
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
