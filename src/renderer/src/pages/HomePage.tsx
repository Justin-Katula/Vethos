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
import { IntelligentBlockingReviewModal } from '@/components/blocking/IntelligentBlockingReviewModal'
import { usePlanning } from '@/lib/use-planning'
import { MORE_TIME_STEP_MINUTES, usePlanningStore, type TaskDraft } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { addDays, dateKey, dayOfWeek } from '@shared/planning/dates'
import { scheduleEntriesForDate } from '@shared/planning/capacity'
import { maxTaskMinutesPerDay } from '@shared/planning/placement'
import { sleepScheduleEntries } from '@shared/sleep'
import type { AncreItem, ObjectiveItem, PlanningSignal, TaskItem } from '@shared/planning/types'

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

function resolveRefName(
  refId: string,
  tasks: TaskItem[],
  objectives: ObjectiveItem[],
  ancres: AncreItem[],
): string {
  return (
    tasks.find((t) => t.id === refId)?.title ??
    objectives.find((o) => o.id === refId)?.name ??
    ancres.find((a) => a.id === refId)?.name ??
    'Ce bloc'
  )
}

/**
 * C.3.4 : traduit un signal en une phrase factuelle, jamais un jugement — le
 * moteur produit des faits chiffrés (F), cette fonction ne fait que les
 * rendre lisibles. `density_deficit` n'est pas traité ici : la carte de
 * déficit juste au-dessus le montre déjà, avec ses options de résolution.
 */
function signalText(
  signal: PlanningSignal,
  tasks: TaskItem[],
  objectives: ObjectiveItem[],
  ancres: AncreItem[],
): string | null {
  const data = signal.data
  switch (signal.type) {
    case 'anchor_missed_3x': {
      const ancreId = typeof data['ancreId'] === 'string' ? data['ancreId'] : ''
      const count = typeof data['missedCount'] === 'number' ? data['missedCount'] : 0
      const name = ancres.find((a) => a.id === ancreId)?.name ?? 'Cette ancre'
      return `${name} — ratée ${count} fois de suite, jamais confirmée.`
    }
    case 'objective_stalled': {
      const name = typeof data['name'] === 'string' ? data['name'] : 'Cet objectif'
      const days =
        typeof data['daysSinceLastService'] === 'number' ? data['daysSinceLastService'] : 0
      return `${name} — n'a pas avancé depuis ${days} jours.`
    }
    case 'delay_repeated': {
      const refId = typeof data['refId'] === 'string' ? data['refId'] : ''
      const count = typeof data['consecutiveDelays'] === 'number' ? data['consecutiveDelays'] : 0
      const name = resolveRefName(refId, tasks, objectives, ancres)
      return `${name} — retard répété, ${count} fois de suite.`
    }
    default:
      return null
  }
}

export default function HomePage() {
  const [now, setNow] = useState(() => new Date())
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(id)
  }, [])

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
  const otherSignals = (plan?.signals ?? [])
    .map((s) => ({ signal: s, text: signalText(s, tasks, objectives, ancres) }))
    .filter((s): s is { signal: PlanningSignal; text: string } => s.text !== null)

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
            Ajouter une tâche
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
                    {todayBlocks.length === 0 ? 'rien au tableau' : 'plus rien avant demain'}
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
                    label="Capacité"
                    tone="quiet"
                    {...splitDuration(todayCapacity.effectiveCapacityMinutes)}
                  />
                  <MetricPill
                    icon={<Hourglass size={15} strokeWidth={2} />}
                    label="Engagé"
                    {...splitDuration(plannedToday)}
                  />
                  <MetricPill
                    icon={<Leaf size={15} strokeWidth={2} />}
                    label="Repos"
                    tone="quiet"
                    {...splitDuration(todayCapacity.restReservedMinutes)}
                  />
                  {delayToday > 0 && (
                    <MetricPill
                      icon={<TimerReset size={15} strokeWidth={2} />}
                      label="Retard"
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
            <Board columns={['Heure', 'Engagement', 'Durée']}>
              {todayBlocks.length === 0 ? (
                <BoardEmpty>
                  Le tableau se remplit tout seul dès que l’application connaît ton temps.
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
                    noteText = 'jamais confirmé'
                  } else if (isNow && isConfirmed) {
                    noteText = 'en cours · confirmée'
                  } else if (isNow && !isConfirmed) {
                    noteText = 'en attente de démarrage'
                  } else if (b.capOverride) {
                    noteText = 'au-delà du plafond'
                  } else if (b.reducedToMinimum) {
                    noteText = 'version minimale'
                  } else if (b.breakMinutes > 0) {
                    noteText = `dont ${b.breakMinutes} min de pause`
                  }

                  let valueText = duration(b.workMinutes)
                  if (isNow) {
                    const elapsed = Math.max(0, nowMinute - b.startMinute)
                    const remainingWork = Math.max(0, b.workMinutes - elapsed)
                    valueText = `reste ${duration(remainingWork)}`
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
                L’application ne connaît que tes heures de sommeil.{' '}
                <Link
                  to="/temps"
                  className="text-fg underline decoration-line-strong hover:decoration-fg"
                >
                  Déclare tes cours, ton travail et tes trajets
                </Link>{' '}
                une seule fois : tout le reste s’en déduit.
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
                    Avant le {worstDeficit.deadline}, il manque{' '}
                    <span className="num text-accent">{duration(worstDeficit.deficitMinutes)}</span>
                    , soit {Math.round(worstDeficit.deficitRatio * 100)} % du travail demandé.
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
                  {otherSignals.map(({ signal, text }) => (
                    <p
                      key={signal.subject}
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
                  Avant le {worstTension.deadline}, {Math.round(worstTension.tensionRatio * 100)} %
                  du temps disponible est déjà pris — encore de la marge, mais ça se resserre.
                </p>
              )}
            </div>

            {/* Hiérarchie & Liste des tâches */}
            {openTasks.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-baseline justify-between border-b border-line pb-2">
                  <h2 className="text-sm font-semibold text-fg">Mes tâches en cours</h2>
                  <p className="text-[11px] text-fg-3">
                    Complétion automatique au temps réel fait · « +25 min » si besoin
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
    category: 'général',
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
      category: draft.category.trim() || 'général',
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
        title="Ajouter une tâche"
        description="L’IA décide intelligemment des applications à bloquer à partir de ce que tu écris dans ton plan."
      >
        <div className="space-y-6">
          <Field label="Quoi (Titre libre)">
            <input
              autoFocus
              type="text"
              name="task-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Ce qu’il y a à faire"
              className="field w-full text-[15px]"
            />
          </Field>

          <Field label="En quoi consiste concrètement ce que tu vas faire ? (Plan obligatoire)">
            <textarea
              rows={2}
              name="task-plan"
              value={draft.plan}
              onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
              placeholder="Ce soir à mon bureau, je vais monter les 3 premières minutes de la vidéo dans Premiere."
              className="field w-full resize-none text-[13px]"
            />
          </Field>

        <div className="grid grid-cols-2 gap-6">
          <Field label="Pour quand">
            <input
              type="date"
              name="task-deadline"
              value={draft.deadline}
              onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              className="field w-full font-mono text-[13px]"
            />
          </Field>
          <Field label="Combien de temps">
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
          {detailed ? 'Masquer' : 'Importance, catégorie, nature du travail'}
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
            <Field label="Catégorie">
              <input
                type="text"
                name="task-category"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="field w-full text-[13px]"
              />
            </Field>
            <Field label="Nature">
              <select
                value={draft.workKind}
                name="task-work-kind"
                onChange={(e) =>
                  setDraft({ ...draft, workKind: e.target.value as 'routine' | 'novel' })
                }
                className="field w-full bg-surface text-[13px]"
              >
                <option value="routine">Connu</option>
                <option value="novel">Nouveau</option>
              </select>
            </Field>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-line pt-5">
          <p className="text-[11px] text-fg-3">
            L’importance et le plan se déclarent à la création.
          </p>
          <button
            type="button"
            disabled={!draft.title.trim() || !draft.plan.trim()}
            onClick={submit}
            className="btn-iris pressable shrink-0"
          >
            <Plus size={15} />
            Ajouter
          </button>
        </div>
      </div>
    </Modal>

    {pendingDraft && (
      <IntelligentBlockingReviewModal
        open={true}
        title={pendingDraft.title}
        plan={pendingDraft.plan}
        kindLabel="tâche"
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
