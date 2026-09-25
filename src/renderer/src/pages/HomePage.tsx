import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gauge, Hourglass, Leaf, Plus, TimerReset } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { HallClock } from '@/components/board/HallClock'
import { Board, BoardEmpty, BoardRow } from '@/components/board/Board'
import { VisionBoard } from '@/components/board/VisionBoard'
import { TaskHierarchyList } from '@/components/tasks/TaskHierarchy'
import { Bracket, GlowCard, MetricPill } from '@/components/ui/Iris'
import { Modal } from '@/components/ui/Modal'
import { StopSession } from '@/components/tasks/StopSession'
import { nexus } from '@/lib/ipc'
import { overlayDueFor } from '@shared/planning/clock'
import { activeConfirmedSession } from '@shared/planning/session'
import { revueDimanche, revueEnClair } from '@shared/coach/coach'
import { IntelligentBlockingReviewModal } from '@/components/blocking/IntelligentBlockingReviewModal'
import { usePlanning } from '@/lib/use-planning'
import { MORE_TIME_STEP_MINUTES, usePlanningStore, type TaskDraft } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { addDays, dateKey, dayOfWeek } from '@shared/planning/dates'
import { scheduleEntriesForDate } from '@shared/planning/capacity'
import { maxTaskMinutesPerDay } from '@shared/planning/placement'
import { sleepScheduleEntries } from '@shared/sleep'
import { signalSentences } from '@shared/phrases'
import type { AncreItem, ObjectiveItem, TaskItem } from '@shared/planning/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
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

/**
 * La même durée, coupée en nombre et en unité — les capsules mettent l'unité
 * plus petite et plus sourde que le nombre, pour que l'œil attrape le chiffre
 * en premier. Au-delà de l'heure pleine, « 2 h 30 » reste d'un seul tenant :
 * séparer les minutes de l'heure donnerait deux nombres à lire au lieu d'un.
 */
function splitDuration(minutes: number): { value: string; unit?: string } {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return { value: String(m), unit: 'min' }
  if (m === 0) return { value: String(h), unit: 'h' }
  return { value: `${h} h ${String(m).padStart(2, '0')}` }
}


export default function HomePage() {
  const [now, setNow] = useState(() => new Date())
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(id)
  }, [])

  const applyDueRemovals = usePlanningStore((s) => s.applyDueRemovals)
  useEffect(() => {
    void applyDueRemovals()
  }, [now, applyDueRemovals])

  const plan = usePlanning(now)
  const tasks = usePlanningStore((s) => s.tasks)
  const objectives = usePlanningStore((s) => s.objectives)
  const ancres = usePlanningStore((s) => s.ancres)
  const addTask = usePlanningStore((s) => s.addTask)
  const addMoreTime = usePlanningStore((s) => s.addMoreTime)
  const schedule = usePlanningStore((s) => s.schedule)
  const sessionConfirmations = usePlanningStore((s) => s.sessionConfirmations)
  // B.5.2 : temps RÉELLEMENT fait par tâche — mesuré par l'horloge de
  // planification (processus main), jamais déclaré ici.
  const worked = usePlanningStore((s) => s.learning.workedMinutesByRef)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)

  const today = dateKey(now)
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const dow = dayOfWeek(today)

  const todayEntries = useMemo(
    () =>
      scheduleEntriesForDate(
        [...sleepScheduleEntries(sleepStart, sleepEnd), ...schedule],
        today,
        dow,
      ),
    [schedule, sleepStart, sleepEnd, dow, today],
  )
  const todayBlocks = useMemo(
    () => (plan?.blocks ?? []).filter((b) => b.date === today),
    [plan, today],
  )

  const remaining = todayBlocks
    .filter((b) => b.endMinute > nowMinute && b.kind !== 'ancre')
    .reduce((s, b) => {
      const elapsed = b.startMinute <= nowMinute ? Math.max(0, nowMinute - b.startMinute) : 0
      const blockRemaining = Math.max(0, b.workMinutes - elapsed)
      return s + blockRemaining
    }, 0)

  // Les trois chiffres de la journée, tous pris tels quels dans le moteur —
  // aucun n'est un score inventé ici. A.3 pour la capacité, E.2 pour le repos,
  // et la somme du travail effectif réellement posé pour ce qui est engagé.
  const todayCapacity = plan?.capacities.find((c) => c.date === today)
  const plannedToday = todayBlocks.reduce((s, b) => s + b.workMinutes, 0)
  // D.7 : retard MESURÉ, jamais supposé. Il n'apparaît que s'il existe.
  const delayToday = todayCapacity?.delayMinutes ?? 0

  const worstDeficit = plan?.feasibility.deficits[0]
  // D.2 : avertissement PASSIF (85-100 % de tension, encore faisable) — la
  // pire échéance seulement, même logique que `worstDeficit` juste au-dessus.
  // Mutuellement exclusif par échéance avec `worstDeficit` (`tensionWarningFor`
  // exclut déjà les densités > 1), mais les deux peuvent coexister si deux
  // échéances différentes sont concernées.
  const worstTension = [...(plan?.feasibility.tensionWarnings ?? [])].sort(
    (a, b) => b.tensionRatio - a.tensionRatio,
  )[0]
  const openTasks = tasks.filter((t) => t.status === 'active')

  // D.7 : un bloc dont la fenêtre est fermée et qui n'a jamais été confirmé
  // aujourd'hui. `sessionConfirmations` ne couvre QUE le jour courant (voir
  // le schéma) — c'est bien ce jour-là que ce tableau montre.
  const missedBlockIds = useMemo(() => {
    if (sessionConfirmations?.date !== today) return new Set<string>()
    const confirmed = sessionConfirmations.confirmedAt
    return new Set(
      todayBlocks.filter((b) => b.endMinute <= nowMinute && !(b.id in confirmed)).map((b) => b.id),
    )
  }, [sessionConfirmations, todayBlocks, today, nowMinute])

  // C.3.4 : signaux passifs — jamais une question, jamais une action
  // automatique. `density_deficit` est déjà couvert par la carte de déficit
  // ci-dessous, avec ses options de résolution ; inutile de le répéter ici.
  const nameOf = (id: string): string | undefined =>
    tasks.find((t) => t.id === id)?.title ??
    objectives.find((o) => o.id === id)?.name ??
    ancres.find((a) => a.id === id)?.name

  const otherSignals = signalSentences(plan?.signals ?? [], nameOf)

  // Retrait progressif : quand l'overlay ne vient plus (phases 3-4), la séance
  // se démarre d'ici — un démarrage spontané, mesuré, avec blocage.
  const learning = usePlanningStore((s) => s.learning)
  const startable = todayBlocks.find(
    (b) =>
      b.startMinute <= nowMinute &&
      nowMinute < b.endMinute &&
      b.preview !== true &&
      !(sessionConfirmations?.date === today && b.id in sessionConfirmations.confirmedAt) &&
      !overlayDueFor({ learning, block: b, nowMinute, today }),
  )

  // La revue du dimanche : 3 chiffres, 1 ajustement, 1 question — tirés du
  // journal des séances et de la rampe, jamais inventés.
  const revue =
    dow === 6
      ? revueDimanche({
          events: learning.sessionEvents ?? [],
          today,
          doses: plan?.objectiveDoses ?? {},
          noms: Object.fromEntries(objectives.map((o) => [o.id, o.name])),
        })
      : null

  // La séance confirmée en cours, s'il y en a une : c'est là que vit « Stop ».
  // Dérivée de la VRAIE session (confirmée, non arrêtée, fenêtre ouverte),
  // pas d'un bloc du plan : une ancre arrêtée garde son créneau.
  const session = activeConfirmedSession(sessionConfirmations ?? null, today, nowMinute)
  const running = session ? todayBlocks.find((b) => b.id === session.blockId) : undefined

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-[1560px] px-12 pb-20 pt-9">
        <header className="flex items-baseline justify-between gap-6">
          <h1 className="text-[22px] font-medium text-fg">
            {DAYS[dow]!.charAt(0).toUpperCase() + DAYS[dow]!.slice(1)} {now.getDate()}{' '}
            {MONTHS[now.getMonth()]}
          </h1>
          <button type="button" onClick={() => setAdding(true)} className="btn-iris pressable">
            <Plus size={15} />
            Add a task
          </button>
        </header>

        {/* D.8 : « Je commence » n'existe QUE dans l'overlay plein écran.
            C'est la friction voulue : la question n'a de sens que si elle
            interrompt vraiment ce qui se passait avant. Un bouton discret dans
            l'application la vidait de son sens — et il envoyait l'id calculé
            par le renderer, que le processus main ne reconnaissait pas. */}

        {/* ── LA COMPOSITION ─────────────────────────────────────────────────
            Deux colonnes, pas une colonne centrée.

            Centré, le cadran laissait cinq cents pixels de noir mort de
            chaque côté : la mise en page d'un téléphone étirée sur un écran
            large. Ici l'objet tient sa propre colonne à gauche, et tout ce
            qui se LIT occupe la droite. Rien n'est jamais vide, et
            l'asymétrie fait le travail que la symétrie ne faisait pas —
            l'œil sait où commencer.

            La colonne de gauche est collante : le cadran reste visible
            pendant qu'on fait défiler le reste. C'est la seule chose de
            l'écran qu'on regarde plutôt qu'on lit. */}
        <div className="mt-8 grid grid-cols-1 items-start gap-x-16 gap-y-12 xl:grid-cols-[minmax(400px,440px)_minmax(0,1fr)]">
          <section className="relative flex flex-col items-center xl:sticky xl:top-9">
            <HallClock entries={todayEntries} blocks={todayBlocks} nowMinute={nowMinute} size={400}>
              {remaining > 0 ? (
                <>
                  <span className="num iris-text text-[48px] leading-none">
                    {duration(remaining)}
                  </span>
                  <span className="mt-2.5 text-[12.5px] text-fg-2">devant toi</span>
                </>
              ) : (
                <>
                  <span className="num text-[48px] leading-none text-fg-2">{hhmm(nowMinute)}</span>
                  <span className="mt-2.5 text-[12.5px] text-fg-3">
                    {todayBlocks.length === 0 ? 'nothing on the board' : 'nothing left before tomorrow'}
                  </span>
                </>
              )}
            </HallClock>

            {todayCapacity && (
              <div className="mt-1 w-full">
                <Bracket count={delayToday > 0 ? 4 : 3} />
                <div
                  className="grid gap-2.5"
                  style={{
                    gridTemplateColumns: `repeat(${delayToday > 0 ? 4 : 3}, minmax(0, 1fr))`,
                  }}
                >
                  <MetricPill
                    icon={<Gauge size={15} strokeWidth={2} />}
                    label="Capacity"
                    tone="quiet"
                    {...splitDuration(todayCapacity.effectiveCapacityMinutes)}
                  />
                  <MetricPill
                    icon={<Hourglass size={15} strokeWidth={2} />}
                    label="Committed"
                    {...splitDuration(plannedToday)}
                  />
                  <MetricPill
                    icon={<Leaf size={15} strokeWidth={2} />}
                    label="Rest"
                    tone="quiet"
                    {...splitDuration(todayCapacity.restReservedMinutes)}
                  />
                  {delayToday > 0 && (
                    <MetricPill
                      icon={<TimerReset size={15} strokeWidth={2} />}
                      label="Late"
                      tone="warn"
                      {...splitDuration(delayToday)}
                    />
                  )}
                </div>
              </div>
            )}
          </section>

          {/* La colonne qui se LIT. Tout y descend dans l'ordre où on en a
              besoin : ce qui est prévu aujourd'hui, ce que l'application a
              remarqué sur la semaine, puis les tâches ouvertes. */}
          <div className="min-w-0 space-y-6">
            {revue && (
              <div className="space-y-1 rounded border border-line px-4 py-3">
                <p className="text-[11px] font-medium tracking-wide text-fg-3">THIS WEEK</p>
                {revueEnClair(revue).map((l) => (
                  <p key={l} className="text-[13.5px] text-fg-2">
                    {l}
                  </p>
                ))}
              </div>
            )}
            {!running && startable && (
              <div className="flex items-center justify-between gap-4 rounded border border-line px-4 py-3">
                <span className="text-[13.5px] text-fg">{startable.label}</span>
                <button
                  type="button"
                  className="btn-iris pressable"
                  onClick={() => void nexus.planning.confirmBlock(startable.id)}
                >
                  Start
                </button>
              </div>
            )}
            {running && (
              <div className="flex items-center justify-between gap-4 rounded border border-line px-4 py-3">
                <span className="text-[13.5px] text-fg">
                  {running.label}
                  <span className="ml-2 text-fg-3">
                    {duration(Math.max(0, running.workMinutes - (nowMinute - running.startMinute)))} left
                  </span>
                </span>
                <StopSession label={running.label} />
              </div>
            )}
            <Board columns={['Time', 'Commitment', 'Duration']}>
              {todayBlocks.length === 0 ? (
                <BoardEmpty>
                  The board fills itself in as soon as the app knows your time.
                </BoardEmpty>
              ) : (
                todayBlocks.map((b) => {
                  const isNow = b.startMinute <= nowMinute && nowMinute < b.endMinute
                  const isDone = b.endMinute <= nowMinute
                  const isMissed = missedBlockIds.has(b.id)
                  const isConfirmed =
                    sessionConfirmations?.confirmedAt && b.id in sessionConfirmations.confirmedAt

                  let noteText: string | undefined = undefined
                  if (isMissed) {
                    noteText = 'never started'
                  } else if (isNow && isConfirmed) {
                    noteText = 'running · started'
                  } else if (isNow && !isConfirmed) {
                    noteText = 'waiting to be started'
                  } else if (b.capOverride) {
                    noteText = 'over the daily cap'
                  } else if (b.reducedToMinimum) {
                    noteText = 'reduced to its minimum'
                  } else if (b.breakMinutes > 0) {
                    noteText = `includes a ${b.breakMinutes} min break`
                  }

                  let valueText = duration(b.workMinutes)
                  if (isNow) {
                    const elapsed = Math.max(0, nowMinute - b.startMinute)
                    const remainingWork = Math.max(0, b.workMinutes - elapsed)
                    valueText = `${duration(remainingWork)} left`
                  }

                  return (
                    <BoardRow
                      key={b.id}
                      time={hhmm(b.startMinute)}
                      label={b.label}
                      note={noteText}
                      value={valueText}
                      state={b.capOverride ? 'changed' : isNow ? 'now' : isDone ? 'done' : 'normal'}
                    />
                  )
                })
              )}
            </Board>

            {schedule.length === 0 && (
              <p className="text-[13px] text-fg-2">
                Vethos only knows your sleep hours so far.{' '}
                <Link
                  to="/temps"
                  className="text-fg underline decoration-line-strong hover:decoration-fg"
                >
                  Declare your classes, your work and your commutes
                </Link>{' '}
                once — everything else follows from them.
              </p>
            )}

            {/* ── CE QUE L'APPLICATION A REMARQUÉ ─────────────────────────────
              Des cartes, jamais des lignes du tableau : ce sont des FAITS sur
              la SEMAINE, pas des blocs de la journée. Glissés dans le tableau,
              ils se lisaient comme des rendez-vous qu'on aurait ratés. */}
            <div className="space-y-4">
              {worstDeficit && (
                <GlowCard glow className="space-y-3">
                  <p className="text-[13px] leading-relaxed text-fg">
                    Before {worstDeficit.deadline}, you are{' '}
                    <span className="num text-accent">{duration(worstDeficit.deficitMinutes)}</span>
                    {' '}short — {Math.round(worstDeficit.deficitRatio * 100)} % of the work you asked for.
                  </p>
                  <ul className="space-y-1.5 border-t border-line pt-3">
                    {worstDeficit.options.map((o) => (
                      <li
                        key={o.action}
                        className="flex items-baseline gap-3 text-[12px] text-fg-2"
                      >
                        <span className="min-w-0 flex-1">{o.action}</span>
                        <span className="shrink-0 font-mono text-accent">
                          +{duration(o.minutesFreed)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </GlowCard>
              )}

              {/* C.3.4/F : signaux passifs — jamais une question, jamais une
                action automatique. */}
              {otherSignals.length > 0 && (
                <GlowCard className="space-y-2.5">
                  {otherSignals.map(({ key, text }) => (
                    <p
                      key={key}
                      className="border-l-2 border-warn/50 pl-3 text-[13px] leading-relaxed text-fg-2"
                    >
                      {text}
                    </p>
                  ))}
                </GlowCard>
              )}

              {/* D.2/C.3.2 : avertissement discret. Il reste du texte nu : lui
                donner une carte le mettrait au même rang qu'un déficit, alors
                qu'il n'y a précisément rien à faire. */}
              {worstTension && (
                <p className="px-1 text-[12px] leading-relaxed text-fg-3">
                  Before {worstTension.deadline}, {Math.round(worstTension.tensionRatio * 100)} % of
                  your available time is already taken — still room, but it is tightening.
                </p>
              )}
            </div>

            {/* Hiérarchie & Liste des tâches */}
            {openTasks.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-baseline justify-between border-b border-line pb-2">
                  <h2 className="text-sm font-semibold text-fg">Tasks in progress</h2>
                  <p className="text-[11px] text-fg-3">
                    Completed automatically on real time done · “+25 min” if needed
                  </p>
                </div>

                <TaskHierarchyList
                  tasks={openTasks}
                  worked={worked}
                  onAddMoreTime={(id) => void addMoreTime(id, MORE_TIME_STEP_MINUTES)}
                  stepMinutes={MORE_TIME_STEP_MINUTES}
                />
              </div>
            )}
          </div>
        </div>

        {/* Section « Faire rêver » / Vision & Projections */}
        <div className="mt-14 w-full">
          <VisionBoard objectives={objectives} tasks={tasks} ancres={ancres} />
        </div>

        <AddTaskModal
          open={adding}
          onClose={() => setAdding(false)}
          // B.5 : le découpage automatique se déclenche dès que la durée
          // corrigée ne tient plus dans un seul jour sous le plafond de D.5.
          onAdd={(draft) =>
            addTask(draft, { maxPerDayMinutes: maxTaskMinutesPerDay(plan?.capacities ?? []) })
          }
        />
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
  onAdd: (t: TaskDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => ({
    title: '',
    plan: '',
    deadline: addDays(dateKey(new Date()), 7),
    importance: 5,
    category: 'general',
    workKind: 'routine' as 'routine' | 'novel',
    minutes: 60,
  }))
  const [detailed, setDetailed] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<TaskDraft | null>(null)

  const submit = () => {
    if (!draft.title.trim() || !draft.plan.trim()) return
    setPendingDraft({
      title: draft.title.trim(),
      plan: draft.plan.trim(),
      deadline: draft.deadline,
      importance: draft.importance,
      category: draft.category.trim() || 'general',
      workKind: draft.workKind,
      estimatedMinutes: draft.minutes,
      remainingMinutes: draft.minutes,
      correctionFactor: draft.workKind === 'novel' ? 1.7 : 1.4,
      status: 'active',
      appsToBlock: [],
    })
  }

  return (
    <>
      <Modal
        open={open && !pendingDraft}
        onClose={onClose}
        title="Add a task"
        description="The AI works out which apps to block from what you write in your plan."
      >
        <div className="space-y-6">
          <Field label="What (free title)">
            <input
              autoFocus
              type="text"
              name="task-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="What there is to do"
              className="field w-full text-[15px]"
            />
          </Field>

          <Field label="What will this concretely involve? (plan required)">
            <textarea
              rows={2}
              name="task-plan"
              value={draft.plan}
              onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
              placeholder="Tonight at my desk, I edit the first 3 minutes of the video in Premiere."
              className="field w-full resize-none text-[13px]"
            />
          </Field>

        <div className="grid grid-cols-2 gap-6">
          <Field label="Due when">
            <input
              type="date"
              name="task-deadline"
              value={draft.deadline}
              onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              className="field w-full font-mono text-[13px]"
            />
          </Field>
          <Field label="How long">
            <div className="flex items-baseline gap-2">
              <input
                type="number"
                name="task-minutes"
                min={5}
                max={2400}
                step={5}
                value={draft.minutes}
                onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
                className="field w-24 font-mono text-[13px]"
              />
              <span className="text-[12px] text-fg-3">minutes</span>
            </div>
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setDetailed((v) => !v)}
          className="text-[12px] text-fg-3 underline-offset-4 transition-colors hover:text-fg-2 hover:underline"
        >
          {detailed ? 'Hide' : 'Importance, category, kind of work'}
        </button>

        {detailed && (
          <div className="grid grid-cols-3 gap-6 border-t border-line pt-5">
            <Field label="Importance">
              <input
                type="number"
                name="task-importance"
                min={1}
                max={10}
                value={draft.importance}
                onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })}
                className="field w-full font-mono text-[13px]"
              />
            </Field>
            <Field label="Category">
              <input
                type="text"
                name="task-category"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="field w-full text-[13px]"
              />
            </Field>
            <Field label="Kind">
              <select
                value={draft.workKind}
                name="task-work-kind"
                onChange={(e) =>
                  setDraft({ ...draft, workKind: e.target.value as 'routine' | 'novel' })
                }
                className="field w-full bg-surface text-[13px]"
              >
                <option value="routine">Done before</option>
                <option value="novel">First time</option>
              </select>
            </Field>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-line pt-5">
          <p className="text-[11px] text-fg-3">
            Importance and the plan are declared at creation.
          </p>
          <button
            type="button"
            disabled={!draft.title.trim() || !draft.plan.trim()}
            onClick={submit}
            className="btn-iris pressable shrink-0"
          >
            <Plus size={15} />
            Add
          </button>
        </div>
      </div>
    </Modal>

    {pendingDraft && (
      <IntelligentBlockingReviewModal
        open={true}
        title={pendingDraft.title}
        plan={pendingDraft.plan}
        kindLabel="task"
        onConfirm={(blockedApps) => {
          void onAdd({
            ...pendingDraft,
            appsToBlock: blockedApps,
          })
          setPendingDraft(null)
          setDraft((d) => ({ ...d, title: '', plan: '' }))
          onClose()
        }}
        onCancel={() => setPendingDraft(null)}
      />
    )}
  </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-fg-3">{label}</span>
      {children}
    </label>
  )
}
