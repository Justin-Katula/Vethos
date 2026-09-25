import { dureeNuitHHMM, plancherSommeil } from '@shared/sommeil-plancher'
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { PageTransition } from '@/components/PageTransition'
import { Disclosure } from '@/components/ui/Disclosure'
import { CountUp } from '@/components/ui/CountUp'
import { WeekCalendar } from '@/components/week/WeekCalendar'
import {
  CapacityTable,
  RequestPanel,
  ScheduleEditor,
  duration,
  toMinutes,
} from '@/components/editors'
import { viewportFromSettings } from '@/lib/calendar-viewport'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { dateKey } from '@shared/planning/dates'
import { CATEGORY_COLOR, CATEGORY_LABEL, entryFill } from '@/lib/palette'
import { useResolvedTheme } from '@/lib/use-theme'
import type { ScheduleCategory } from '@shared/schemas'

const inputClass = 'field text-sm'

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
  const theme = useResolvedTheme()
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
  const ageBracket = useSettingsStore((s) => s.ageBracket)
  // Le plancher de sommeil par âge : une nuit plus courte n'est pas enregistrée.
  const [sleepRefused, setSleepRefused] = useState<string | null>(null)
  const setSleep = (start: string, end: string) => {
    const d = dureeNuitHHMM(start, end)
    const floor = plancherSommeil(ageBracket)
    if (d !== null && d < floor) {
      setSleepRefused(`A night is at least ${floor / 60} hours.`)
      return
    }
    setSleepRefused(null)
    void updateSettings({ sleepStart: start, sleepEnd: end })
  }
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
            <h1 className="text-[30px] font-semibold text-fg">My time</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-3">
              Declare the time already taken. Vethos then works out what is left across the
              week.
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
              className="num iris-text block text-[38px] leading-none"
            />
            <p className="mt-2.5 text-[11.5px] text-fg-3">available across seven days</p>
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
                  // Une légende doit montrer EXACTEMENT ce qu'elle nomme : le
                  // même calcul que les arcs du cadran, pas une marque à part.
                  style={{ backgroundColor: entryFill(CATEGORY_COLOR[k], theme) }}
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
              title="Sleep"
              summary={`${sleepStart} → ${sleepEnd} · ${duration(sleepMinutes)}`}
            >
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 text-sm text-fg-2">
                  Bedtime
                  <input
                    type="time"
                    name="sleep-start"
                    value={sleepStart}
                    onChange={(e) => setSleep(e.target.value, sleepEnd)}
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-2">
                  Wake-up
                  <input
                    type="time"
                    name="sleep-end"
                    value={sleepEnd}
                    onChange={(e) => setSleep(sleepStart, e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              {sleepRefused && <p className="mt-3 text-[12px] text-warn">{sleepRefused}</p>}
              <p className="mt-3 text-[11px] text-fg-3">
                Never counted as work, and no notification is sent during these hours. It is
                also what decides which hours the grid shows.
              </p>
            </Disclosure>

            <Disclosure
              index={1}
              title="Fixed commitments"
              summary={
                schedule.length === 0
                  ? 'nothing declared'
                  : `${schedule.length} slot${schedule.length > 1 ? 's' : ''} across the week`
              }
            >
              <ScheduleEditor
                entries={schedule}
                onChange={(entries) => void setSchedule(entries)}
              />
            </Disclosure>
          </div>

          <div className="space-y-3">
            {plan && (
              <Disclosure index={2} title="Day by day" summary="raw → available">
                <CapacityTable plan={plan} />
              </Disclosure>
            )}

            {plan && (
              <Disclosure
                index={3}
                title="Ask for free time"
                summary="the app answers with numbers"
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
