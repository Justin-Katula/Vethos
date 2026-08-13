import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTransition } from '@/components/PageTransition'
import { HallClock } from '@/components/board/HallClock'
import { Board, BoardEmpty, BoardRow } from '@/components/board/Board'
import { Modal } from '@/components/ui/Modal'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { addDays, dateKey, dayOfWeek } from '@/lib/planning/dates'
import { sleepScheduleEntries } from '@shared/sleep'
import { cn } from '@/lib/cn'
import type { TaskItem } from '@/lib/planning/types'

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export default function HomePage() {
  const [now, setNow] = useState(() => new Date())
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const plan = usePlanning(now)
  const tasks = usePlanningStore((s) => s.tasks)
  const addTask = usePlanningStore((s) => s.addTask)
  const completeTask = usePlanningStore((s) => s.completeTask)
  const schedule = usePlanningStore((s) => s.schedule)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)

  const today = dateKey(now)
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const dow = dayOfWeek(today)

  const todayEntries = useMemo(
    () =>
      [...sleepScheduleEntries(sleepStart, sleepEnd), ...schedule].filter(
        (e) => e.dayOfWeek === dow,
      ),
    [schedule, sleepStart, sleepEnd, dow],
  )
  const todayBlocks = useMemo(
    () => (plan?.blocks ?? []).filter((b) => b.date === today),
    [plan, today],
  )

  const remaining = todayBlocks
    .filter((b) => b.endMinute > nowMinute && b.kind !== 'ancre')
    .reduce((s, b) => s + b.workMinutes, 0)

  const worstDeficit = plan?.feasibility.deficits[0]
  const openTasks = tasks.filter((t) => t.status === 'active' && t.remainingMinutes > 0)

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-[1560px] px-12 pb-12 pt-10">
        <header className="mb-8 flex items-baseline justify-between gap-6 border-b border-rail pb-5">
          <div className="flex items-baseline gap-4">
            <h1 className="text-2xl font-medium text-ink">
              {DAYS[dow]!.charAt(0).toUpperCase() + DAYS[dow]!.slice(1)} {now.getDate()}{' '}
              {MONTHS[now.getMonth()]}
            </h1>
            <p className="text-[13px] text-ink-3">
              {todayBlocks.length === 0
                ? 'rien au tableau'
                : remaining === 0
                  ? 'plus rien avant demain'
                  : `${duration(remaining)} devant toi`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="shrink-0 border border-rail-strong px-4 py-2 text-[13px] text-ink transition-colors hover:bg-panel-lit"
          >
            Ajouter une tâche
          </button>
        </header>

        <div className="flex flex-wrap items-start gap-x-14 gap-y-10">
          <HallClock entries={todayEntries} blocks={todayBlocks} nowMinute={nowMinute} size={340}>
            <span className="font-mono text-[38px] leading-none text-ink">{hhmm(nowMinute)}</span>
          </HallClock>

          <div className="min-w-[420px] flex-1 space-y-5">
            <Board columns={['Heure', 'Engagement', 'Durée']}>
              {todayBlocks.length === 0 ? (
                <BoardEmpty>
                  Le tableau se remplit tout seul dès que l’application connaît ton temps.
                </BoardEmpty>
              ) : (
                todayBlocks.map((b) => {
                  const isNow = b.startMinute <= nowMinute && nowMinute < b.endMinute
                  const isDone = b.endMinute <= nowMinute
                  return (
                    <BoardRow
                      key={b.id}
                      time={hhmm(b.startMinute)}
                      label={b.label}
                      note={
                        b.capOverride
                          ? 'au-delà du plafond'
                          : b.reducedToMinimum
                            ? 'version minimale'
                            : b.breakMinutes > 0
                              ? `dont ${b.breakMinutes} min de pause`
                              : undefined
                      }
                      value={duration(b.workMinutes)}
                      state={b.capOverride ? 'changed' : isNow ? 'now' : isDone ? 'done' : 'normal'}
                    />
                  )
                })
              )}
            </Board>

            {schedule.length === 0 && (
              <p className="text-[13px] text-ink-2">
                L’application ne connaît que tes heures de sommeil.{' '}
                <Link
                  to="/temps"
                  className="text-ink underline decoration-rail-strong hover:decoration-ink"
                >
                  Déclare tes cours, ton travail et tes trajets
                </Link>{' '}
                une seule fois : tout le reste s’en déduit.
              </p>
            )}

            {worstDeficit && (
              <div className="border-l-[3px] border-signal bg-signal-wash px-4 py-3">
                <p className="text-[13px] text-ink">
                  Avant le {worstDeficit.deadline}, il manque{' '}
                  <span className="font-mono">{duration(worstDeficit.deficitMinutes)}</span>, soit{' '}
                  {Math.round(worstDeficit.deficitRatio * 100)} % du travail demandé.
                </p>
                <ul className="mt-2 space-y-1">
                  {worstDeficit.options.map((o) => (
                    <li key={o.action} className="flex items-baseline gap-3 text-[12px] text-ink-2">
                      <span className="min-w-0 flex-1 truncate">{o.action}</span>
                      <span className="shrink-0 font-mono">+{duration(o.minutesFreed)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {openTasks.length > 0 && (
              <Board columns={['Échéance', 'Tâche', 'Restant']}>
                {openTasks.map((t) => (
                  <BoardRow
                    key={t.id}
                    time={t.deadline.slice(5).replace('-', '.')}
                    label={t.title}
                    note={t.category !== 'général' ? t.category : undefined}
                    value={duration(t.remainingMinutes)}
                    onClick={() => void completeTask(t.id)}
                  />
                ))}
              </Board>
            )}
          </div>
        </div>

        <AddTaskModal open={adding} onClose={() => setAdding(false)} onAdd={addTask} />
      </div>
    </PageTransition>
  )
}

function AddTaskModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (t: Omit<TaskItem, 'id' | 'createdAt' | 'parentTaskId'>) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => ({
    title: '',
    deadline: addDays(dateKey(new Date()), 7),
    importance: 5,
    category: 'général',
    workKind: 'routine' as 'routine' | 'novel',
    minutes: 60,
  }))
  const [detailed, setDetailed] = useState(false)

  const submit = () => {
    if (!draft.title.trim()) return
    void onAdd({
      title: draft.title.trim(),
      deadline: draft.deadline,
      importance: draft.importance,
      category: draft.category.trim() || 'général',
      workKind: draft.workKind,
      estimatedMinutes: draft.minutes,
      remainingMinutes: draft.minutes,
      correctionFactor: draft.workKind === 'novel' ? 1.7 : 1.4,
      status: 'active',
    })
    setDraft((d) => ({ ...d, title: '' }))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter une tâche"
      description="Trois champs suffisent. L’application corrige ton estimation avec ce que les tâches passées ont réellement coûté, puis trouve la place elle-même."
    >
      <div className="space-y-6">
        <Field label="Quoi">
          <input
            autoFocus
            type="text"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ce qu’il y a à faire"
            className="slot w-full text-[15px]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-6">
          <Field label="Pour quand">
            <input
              type="date"
              value={draft.deadline}
              onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              className="slot w-full font-mono text-[13px]"
            />
          </Field>
          <Field label="Combien de temps">
            <div className="flex items-baseline gap-2">
              <input
                type="number"
                min={5}
                max={2400}
                step={5}
                value={draft.minutes}
                onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
                className="slot w-24 font-mono text-[13px]"
              />
              <span className="text-[12px] text-ink-3">minutes</span>
            </div>
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setDetailed((v) => !v)}
          className="text-[12px] text-ink-3 underline-offset-4 transition-colors hover:text-ink-2 hover:underline"
        >
          {detailed ? 'Masquer' : 'Importance, catégorie, nature du travail'}
        </button>

        {detailed && (
          <div className="grid grid-cols-3 gap-6 border-t border-rail pt-5">
            <Field label="Importance">
              <input
                type="number"
                min={1}
                max={10}
                value={draft.importance}
                onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })}
                className="slot w-full font-mono text-[13px]"
              />
            </Field>
            <Field label="Catégorie">
              <input
                type="text"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="slot w-full text-[13px]"
              />
            </Field>
            <Field label="Nature">
              <select
                value={draft.workKind}
                onChange={(e) =>
                  setDraft({ ...draft, workKind: e.target.value as 'routine' | 'novel' })
                }
                className="slot w-full bg-panel text-[13px]"
              >
                <option value="routine">Connu</option>
                <option value="novel">Nouveau</option>
              </select>
            </Field>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-rail pt-5">
          <p className="text-[11px] text-ink-3">
            L’importance se déclare une seule fois. Elle n’est jamais recalculée.
          </p>
          <button
            type="button"
            disabled={!draft.title.trim()}
            onClick={submit}
            className={cn(
              'shrink-0 px-5 py-2 text-[13px] transition-colors',
              draft.title.trim()
                ? 'bg-ink text-hall hover:bg-white'
                : 'cursor-not-allowed border border-rail text-ink-3',
            )}
          >
            Ajouter
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-ink-3">{label}</span>
      {children}
    </label>
  )
}
