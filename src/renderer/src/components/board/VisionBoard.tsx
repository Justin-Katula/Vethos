import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { CountUp } from '@/components/ui/CountUp'
import { cn } from '@/lib/cn'
import type { ObjectiveItem, TaskItem, AncreItem } from '@shared/planning/types'

type Horizon = 'month' | 'year'
type Pillar = 'objectives' | 'tasks' | 'ancres'

function durationStr(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  if (rounded === Math.floor(rounded)) {
    return `${Math.floor(rounded)} h`
  }
  return `${rounded} h`
}

function getObjectiveMilestone(yearlyHours: number): { title: string; desc: string } {
  if (yearlyHours < 40) {
    return {
      title: 'Prise d’élan & Découverte',
      desc: 'Suffisant pour acquérir les bases fondamentales et installer la curiosité.',
    }
  }
  if (yearlyHours < 100) {
    return {
      title: 'Fondations solides',
      desc: 'Une pratique régulière qui commence à donner des réflexes automatiques.',
    }
  }
  if (yearlyHours < 250) {
    return {
      title: 'Autonomie & Aisance',
      desc: 'Le niveau où l’on pratique avec plaisir sans bloquer sur la technique.',
    }
  }
  if (yearlyHours < 500) {
    return {
      title: 'Expertise confirmée',
      desc: 'L’équivalent de plusieurs cours universitaires ou d’un projet majeur mené à terme.',
    }
  }
  return {
    title: 'Haut niveau de maîtrise',
    desc: 'Un investissement exceptionnel qui place tes compétences dans le top niveau.',
  }
}

function getAnchorInsight(ancre: AncreItem, yearlyHours: number): string {
  const lower = ancre.name.toLowerCase()
  if (lower.includes('lect') || lower.includes('livre') || lower.includes('read')) {
    const books = Math.max(1, Math.round(yearlyHours / 8))
    return `Soit environ ${books} livre${books > 1 ? 's' : ''} entier${books > 1 ? 's' : ''} dévoré${books > 1 ? 's' : ''} sur l’année (sur la base d’un livre de 250 pages toutes les 8 h).`
  }
  if (
    lower.includes('sport') ||
    lower.includes('muscu') ||
    lower.includes('gym') ||
    lower.includes('course') ||
    lower.includes('run') ||
    lower.includes('yoga') ||
    lower.includes('fitness')
  ) {
    return `Une transformation physique et cardiovasculaire majeure grâce à ${Math.round(yearlyHours)} h d’entraînement régulier.`
  }
  if (lower.includes('medit') || lower.includes('zen') || lower.includes('respir')) {
    return `Des centaines de séances de calme profond pour forger une stabilité émotionnelle et une concentration inébranlable.`
  }
  return `${Math.round(yearlyHours)} heures de rituel inamovible : la discipline quotidienne qui transforme ta routine en force.`
}

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

  const multiplier = horizon === 'month' ? 4 : 52
  const horizonLabel = horizon === 'month' ? 'sur 1 mois (4 semaines)' : 'sur 1 an (52 semaines)'

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
            Ce que les rythmes déclarés représentent quand ils se cumulent.
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
            1 mois
          </button>
          <button
            type="button"
            onClick={() => setHorizon('year')}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              horizon === 'year' ? 'bg-fg text-surface' : 'text-fg-3 hover:bg-surface-2 hover:text-fg-2',
            )}
          >
            1 an
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
          <span>Objectifs</span>
          <span className="font-mono text-[11px] tabular-nums opacity-60">
            {durationStr(totalObjectiveHours)}
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
          <span>Tâches</span>
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
          <span>Ancres & Rituels</span>
          <span className="font-mono text-[11px] tabular-nums opacity-60">
            {durationStr(totalAnchorHours)}
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
                  title="Aucun objectif à long terme déclaré"
                  desc="Un objectif n'a pas d'échéance : c'est un quota régulier, par exemple 4 h de guitare ou 5 h de programmation par semaine."
                  linkText="Définir mon premier objectif"
                  linkTo="/engagements"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
                    <div>
                      <span className="num iris-text text-[30px] leading-none">
                        <CountUp value={totalObjectiveHours} format={(n) => durationStr(n)} />
                      </span>
                      <span className="ml-2 text-xs text-fg-3">
                        prévues sur tes objectifs {horizonLabel}
                      </span>
                    </div>
                    <div className="text-right text-[11.5px] text-fg-3 font-mono">
                      {durationStr(weeklyObjectiveHours)} / semaine
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {objectives.map((obj) => {
                      const objWeeklyHours = obj.weeklyTargetMinutes / 60
                      const objTotalHours = objWeeklyHours * multiplier
                      const yearlyHours = objWeeklyHours * 52
                      const milestone = getObjectiveMilestone(yearlyHours)

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
                                {durationStr(objTotalHours)}
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
                            <span>{durationStr(objWeeklyHours)}/semaine</span>
                            <span className="font-mono font-medium text-fg-2">
                              {durationStr(yearlyHours)} / an
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
                  title="Toutes tes tâches sont accomplies"
                  desc="Quand une nouvelle tâche est déclarée, elle apparaît ici avec le temps restant à servir."
                  linkText="Ajouter une tâche"
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
                        projet{activeRootTasks.length > 1 ? 's' : ''} en cours (
                        {durationStr(totalTaskHours)} restant)
                      </span>
                    </div>
                    <span className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-fg-2">
                      échéances actives
                    </span>
                  </div>

                  <div className="rounded border border-line bg-surface p-4 text-xs leading-relaxed text-fg-2">
                    <p className="font-medium text-fg">Lecture du reste à faire</p>
                    <p className="mt-1.5 leading-relaxed text-fg-3">
                      Le moteur place ces minutes dans les jours où elles peuvent tenir, après le
                      sommeil, les obligations fixes et les marges de repos.
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
                  title="Aucun rituel ancré pour l’instant"
                  desc="Une ancre est un rendez-vous fixe avec toi-même qui ne bouge jamais, par exemple sport à 18 h ou lecture à 21 h."
                  linkText="Créer une ancre"
                  linkTo="/engagements"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3 rounded border border-line bg-surface-2 px-4 py-3">
                    <div>
                      <span className="num iris-text text-[30px] leading-none">
                        <CountUp value={totalAnchorHours} format={(n) => durationStr(n)} />
                      </span>
                      <span className="ml-2 text-xs text-fg-3">
                        prévues par tes ancres {horizonLabel}
                      </span>
                    </div>
                    <span className="text-[11.5px] font-mono text-fg-3">
                      {durationStr(weeklyAnchorHours)} / semaine
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {ancres.map((ancre) => {
                      const ancreWeeklyHours =
                        (ancre.normalMaxMinutes * ancre.daysOfWeek.length) / 60
                      const ancreTotalHours = ancreWeeklyHours * multiplier
                      const yearlyHours = ancreWeeklyHours * 52
                      const insight = getAnchorInsight(ancre, yearlyHours)

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
                                {durationStr(ancreTotalHours)}
                              </span>
                            </div>

                            <p className="mt-2 text-[11px] leading-relaxed text-fg-3">{insight}</p>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[10.5px] text-fg-3">
                            <span>
                              {ancre.daysOfWeek.length} j / semaine · {ancre.normalMaxMinutes} min
                            </span>
                            <span className="font-mono font-medium text-fg-2">
                              {durationStr(yearlyHours)} / an
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
