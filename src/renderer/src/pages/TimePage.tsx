import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { PageTransition } from '@/components/PageTransition'
import { Disclosure } from '@/components/ui/Disclosure'
import { CountUp } from '@/components/ui/CountUp'
import { WeekCalendar } from '@/components/week/WeekCalendar'
import { CapacityTable, RequestPanel, ScheduleEditor, duration, toMinutes } from '@/components/editors'
import { viewportFromSettings } from '@/lib/calendar-viewport'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { dateKey } from '@/lib/planning/dates'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/palette'
import type { ScheduleCategory } from '@shared/schemas'

const inputClass =
  'rounded border border-line bg-base px-3 py-2 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-line-strong'

/**
 * Mon temps.
 *
 * Une seule page pour une seule question : de quoi ma semaine est-elle faite,
 * et combien m'en reste-t-il. La semaine et la capacité disaient la même chose
 * à deux endroits, ce qui obligeait à faire l'aller-retour pour vérifier
 * l'effet de ce qu'on venait de déclarer.
 *
 * Ce qui se déclare ici, c'est le temps SUBI : sommeil et obligations fixes.
 * Ce qu'on veut faire de son temps se déclare ailleurs.
 */
export default function TimePage() {
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
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const reduce = useReducedMotion()

  const today = dateKey(now)
  const nowMinute = now.getHours() * 60 + now.getMinutes()

  const viewport = useMemo(() => viewportFromSettings(sleepStart, sleepEnd), [sleepStart, sleepEnd])

  const sleepMinutes = useMemo(() => {
    const start = toMinutes(sleepStart) ?? 0
    const end = toMinutes(sleepEnd) ?? 0
    return start < end ? end - start : 1440 - start + end
  }, [sleepStart, sleepEnd])

  const dates = useMemo(() => plan?.capacities.map((c) => c.date) ?? [], [plan])
  const placed = useMemo(() => plan?.blocks ?? [], [plan])
  const weekAvailable = plan?.capacities.reduce((s, c) => s + c.effectiveCapacityMinutes, 0) ?? 0

  const usedCategories = useMemo(
    () => [...new Set(schedule.map((e) => e.categoryType))],
    [schedule],
  )

  return (
    <PageTransition>
      <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-y-auto px-14 pb-14 pt-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-8">
          <div>
            <h1 className="text-3xl font-semibold text-fg">Mon temps</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-fg-3">
              Le sombre est ce qui est déjà pris. Le clair est ce que le moteur a posé pour toi :
              tu ne le places jamais toi-même.
            </p>
          </div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-right"
          >
            <CountUp
              value={weekAvailable}
              format={(n) => duration(Math.round(n))}
              className="block font-mono text-3xl tabular-nums text-fg"
            />
            <p className="mt-1 text-[11px] text-fg-3">disponibles sur sept jours</p>
          </motion.div>
        </header>

        <WeekCalendar
          weekDates={dates}
          viewport={viewport}
          entries={schedule}
          blocks={placed}
          today={today}
          nowMinute={nowMinute}
        />

        {usedCategories.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            {usedCategories.map((k: ScheduleCategory) => (
              <span key={k} className="flex items-center gap-2 text-[11px] text-fg-3">
                <span
                  className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-line"
                  style={{ backgroundColor: CATEGORY_COLOR[k] }}
                />
                {CATEGORY_LABEL[k]}
              </span>
            ))}
          </div>
        )}

        <div className="mt-10 grid items-start gap-x-14 gap-y-3 lg:grid-cols-2">
          <div className="space-y-3">
            <Disclosure
              index={0}
              title="Sommeil"
              summary={`${sleepStart} → ${sleepEnd} · ${duration(sleepMinutes)}`}
            >
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 text-sm text-fg-2">
                  Coucher
                  <input
                    type="time"
                    value={sleepStart}
                    onChange={(e) => void updateSettings({ sleepStart: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-2">
                  Lever
                  <input
                    type="time"
                    value={sleepEnd}
                    onChange={(e) => void updateSettings({ sleepEnd: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
              <p className="mt-3 text-[11px] text-fg-3">
                Jamais compté comme du travail, et aucune notification n{'’'}est émise pendant ces
                heures. C{'’'}est aussi ce qui décide des heures affichées sur la grille.
              </p>
            </Disclosure>

            <Disclosure
              index={1}
              title="Obligations fixes"
              summary={
                schedule.length === 0
                  ? 'rien de déclaré'
                  : `${schedule.length} créneau${schedule.length > 1 ? 'x' : ''} sur la semaine`
              }
            >
              <ScheduleEditor entries={schedule} onChange={(entries) => void setSchedule(entries)} />
            </Disclosure>
          </div>

          <div className="space-y-3">
            {plan && (
              <Disclosure index={2} title="Le détail, jour par jour" summary="brute → disponible">
                <CapacityTable plan={plan} />
              </Disclosure>
            )}

            {plan && (
              <Disclosure
                index={3}
                title="Demander du temps libre"
                summary="l’application répond avec des chiffres"
              >
                <RequestPanel plan={plan} today={today} />
              </Disclosure>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
