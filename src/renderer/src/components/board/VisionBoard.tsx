import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { CountUp } from '@/components/ui/CountUp'
import { cn } from '@/lib/cn'
import type { ObjectiveItem, TaskItem, AncreItem } from '@shared/planning/types'
import {
  HORIZON_LABEL,
  HORIZON_WEEKS,
  anchorInsight,
  hoursLabel,
  objectiveMilestone,
  type Horizon,
} from '@shared/projection'

type Pillar = 'objectives' | 'tasks' | 'ancres'

export function VisionBoard({
  objectives = [],
  tasks = [],
  ancres = [],
}: {
  objectives: ObjectiveItem[]
  tasks: TaskItem[]
  ancres: AncreItem[]
}) {
  const [horizon, setHorizon] = useState<Horizon>('year')
  const [pillar, setPillar] = useState<Pillar>('objectives')

  const multiplier = HORIZON_WEEKS[horizon]
  const horizonLabel = HORIZON_LABEL[horizon]

  // 1. Calculs Objectifs
  const weeklyObjectiveHours = useMemo(
    () => objectives.reduce((s, o) => s + o.weeklyTargetMinutes, 0) / 60,
    [objectives],
  )
  const totalObjectiveHours = weeklyObjectiveHours * multiplier

  // 2. Calculs Tâches
  const activeTasks = useMemo(() => tasks.filter((t) => t.status === 'active'), [tasks])
  const activeRootTasks = useMemo(
    () => activeTasks.filter((t) => t.parentTaskId === null),
    [activeTasks],
  )
  const totalTaskHours = useMemo(
    () => activeTasks.reduce((s, t) => s + t.remainingMinutes + t.extraMinutes, 0) / 60,
    [activeTasks],
  )

  // 3. Calculs Ancres
  const weeklyAnchorHours = useMemo(
    () => ancres.reduce((s, a) => s + a.normalMaxMinutes * a.daysOfWeek.length, 0) / 60,
    [ancres],
  )
  const totalAnchorHours = weeklyAnchorHours * multiplier

  return (
    <div className="surface relative overflow-hidden p-6">
      {/* En-tête du module Vision */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Projection</h2>
          <p className="text-[11.5px] text-fg-3">
            What the rhythms you declared add up to over time.
          </p>
        </div>

        {/* Sélecteur d'horizon temporel */}
        <div className="flex items-center rounded border border-line bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setHorizon('month')}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              horizon === 'month' ? 'bg-fg text-surface' : 'text-fg-3 hover:bg-surface-2 hover:text-fg-2',
            )}
          >
            1 month
          </button>
          <button
            type="button"
            onClick={() => setHorizon('year')}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              horizon === 'year' ? 'bg-fg text-surface' : 'text-fg-3 hover:bg-surface-2 hover:text-fg-2',
            )}
          >
            1 year
          </button>
        </div>
      </div>

      {/* Onglets Piliers : Objectifs / Tâches / Ancres */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPillar('objectives')}
          className={cn(
            'flex items-center gap-2 rounded border px-3.5 py-2 text-xs font-medium transition-all',
            pillar === 'objectives'
              ? 'border-line-strong bg-surface-2 text-fg'
              : 'border-transparent text-fg-3 hover:bg-surface-2 hover:text-fg-2',
          )}
          aria-pressed={pillar === 'objectives'}
        >
          <span>Goals</span>
          <span className="font-mono text-[11px] tabular-nums opacity-60">
            {hoursLabel(totalObjectiveHours)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPillar('tasks')}
          className={cn(
            'flex items-center gap-2 rounded border px-3.5 py-2 text-xs font-medium transition-all',
            pillar === 'tasks'
              ? 'border-line-strong bg-surface-2 text-fg'
              : 'border-transparent text-fg-3 hover:bg-surface-2 hover:text-fg-2',
          )}
          aria-pressed={pillar === 'tasks'}
        >
          <span>Tasks</span>
          <span className="font-mono text-[11px] tabular-nums opacity-60">
            {activeRootTasks.length} projet{activeRootTasks.length > 1 ? 's' : ''}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPillar('ancres')}
          className={cn(
            'flex items-center gap-2 rounded border px-3.5 py-2 text-xs font-medium transition-all',
            pillar === 'ancres'
              ? 'border-line-strong bg-surface-2 text-fg'
              : 'border-transparent text-fg-3 hover:bg-surface-2 hover:text-fg-2',
          )}
          aria-pressed={pillar === 'ancres'}
        >
          <span>Anchors & rituals</span>
          <span className="font-mono text-[11px] tabular-nums opacity-60">
            {hoursLabel(totalAnchorHours)}
          </span>
        </button>
      </div>

      {/* Contenu dynamique de la Vision */}
      <div className="mt-5">
        <AnimatePresence mode="wait">
          {pillar === 'objectives' && (
            <motion.div
              key={`obj-${horizon}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {objectives.length === 0 ? (
                <EmptyPillar
                  title="No long-term goal declared"
                  desc="A goal has no deadline: it is a steady quota — 4 h of guitar or 5 h of coding a week, say."
                  linkText="Set my first goal"
                  linkTo="/engagements"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
                    <div>
                      <span className="num iris-text text-[30px] leading-none">
                        <CountUp value={totalObjectiveHours} format={(n) => hoursLabel(n)} />
                      </span>
                      <span className="ml-2 text-xs text-fg-3">
                        planned across your goals {horizonLabel}
                      </span>
                    </div>
                    <div className="text-right text-[11.5px] text-fg-3 font-mono">
                      {hoursLabel(weeklyObjectiveHours)} / week
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {objectives.map((obj) => {
                      const objWeeklyHours = obj.weeklyTargetMinutes / 60
                      const objTotalHours = objWeeklyHours * multiplier
                      const yearlyHours = objWeeklyHours * 52
                      const milestone = objectiveMilestone(yearlyHours)

                      return (
                        <div
                          key={obj.id}
                          className="flex flex-col justify-between rounded border border-line bg-surface p-3.5"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-fg">
                                {obj.name}
                              </span>
                              <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-fg">
                                {hoursLabel(objTotalHours)}
                              </span>
                            </div>

                            <p className="mt-2 text-[11px] font-medium text-fg-2">
                              {milestone.title}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-fg-3">
                              {milestone.desc}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[10.5px] text-fg-3">
                            <span>{hoursLabel(objWeeklyHours)}/week</span>
                            <span className="font-mono font-medium text-fg-2">
                              {hoursLabel(yearlyHours)} / year
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {pillar === 'tasks' && (
            <motion.div
              key={`tasks-${horizon}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {activeTasks.length === 0 ? (
                <EmptyPillar
                  title="Every task is done"
                  desc="When a new task is declared, it shows up here with the time left to serve."
                  linkText="Add a task"
                  linkTo="/engagements"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
                    <div>
                      <span className="num iris-text text-[30px] leading-none">
                        {activeRootTasks.length}
                      </span>
                      <span className="ml-2 text-xs text-fg-3">
                        project{activeRootTasks.length > 1 ? 's' : ''} in progress (
                        {hoursLabel(totalTaskHours)} left)
                      </span>
                    </div>
                    <span className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-fg-2">
                      active deadlines
                    </span>
                  </div>

                  <div className="rounded border border-line bg-surface p-4 text-xs leading-relaxed text-fg-2">
                    <p className="font-medium text-fg">Reading what is left</p>
                    <p className="mt-1.5 leading-relaxed text-fg-3">
                      The engine places these minutes on the days where they can fit, after
                      sleep, fixed commitments and rest margins.
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {pillar === 'ancres' && (
            <motion.div
              key={`ancres-${horizon}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {ancres.length === 0 ? (
                <EmptyPillar
                  title="No ritual anchored yet"
                  desc="An anchor is a fixed appointment with yourself that never moves — sport at 6 pm, reading at 9 pm."
                  linkText="Create an anchor"
                  linkTo="/engagements"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
                    <div>
                      <span className="num iris-text text-[30px] leading-none">
                        <CountUp value={totalAnchorHours} format={(n) => hoursLabel(n)} />
                      </span>
                      <span className="ml-2 text-xs text-fg-3">
                        planned by your anchors {horizonLabel}
                      </span>
                    </div>
                    <span className="text-[11.5px] font-mono text-fg-3">
                      {hoursLabel(weeklyAnchorHours)} / week
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {ancres.map((ancre) => {
                      const ancreWeeklyHours =
                        (ancre.normalMaxMinutes * ancre.daysOfWeek.length) / 60
                      const ancreTotalHours = ancreWeeklyHours * multiplier
                      const yearlyHours = ancreWeeklyHours * 52
                      const insight = anchorInsight(ancre.name, yearlyHours)

                      return (
                        <div
                          key={ancre.id}
                          className="flex flex-col justify-between rounded border border-line bg-surface p-3.5"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-fg">
                                {ancre.name}
                              </span>
                              <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-fg">
                                {hoursLabel(ancreTotalHours)}
                              </span>
                            </div>

                            <p className="mt-2 text-[11px] leading-relaxed text-fg-3">{insight}</p>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[10.5px] text-fg-3">
                            <span>
                              {ancre.daysOfWeek.length} d / week · {ancre.normalMaxMinutes} min
                            </span>
                            <span className="font-mono font-medium text-fg-2">
                              {hoursLabel(yearlyHours)} / year
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function EmptyPillar({
  title,
  desc,
  linkText,
  linkTo,
}: {
  title: string
  desc: string
  linkText: string
  linkTo: string
}) {
  return (
    <div className="rounded border border-dashed border-line bg-surface p-5 text-center">
      <h3 className="text-xs font-semibold text-fg">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-[11.5px] leading-relaxed text-fg-3">{desc}</p>
      <Link
        to={linkTo}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
      >
        <span>{linkText}</span>
      </Link>
    </div>
  )
}
