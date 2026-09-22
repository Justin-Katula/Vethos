import { useMemo, useState } from 'react'
import { Plus, Trash2, Copy } from 'lucide-react'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore, type Creatable } from '@/store/planning.store'
import { evaluateRequest, type RequestVerdict } from '@shared/planning/requests'
import { CATEGORY_COLOR, CATEGORY_LABEL, entryMark, nextShade } from '@/lib/palette'
import { useResolvedTheme } from '@/lib/use-theme'
import { cn } from '@/lib/cn'
import { addDays, dateKey, dayOfWeek as dayOfWeekOfDate } from '@shared/planning/dates'
import { SCHEDULE_CATEGORIES, type ScheduleCategory } from '@shared/schemas'
import type { AncreItem, ObjectiveItem, ScheduleEntry } from '@shared/planning/types'
import { IntelligentBlockingReviewModal } from '@/components/blocking/IntelligentBlockingReviewModal'

/**
 * Les editeurs partages.
 *
 * Ils vivaient dans « Mon temps » quand cette page portait tout. Depuis que la
 * declaration du temps et celle des engagements sont deux endroits distincts,
 * ils sont ici : un editeur ne doit pas savoir sur quelle page il est rendu.
 */

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
export const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/**
 * Un champ, partout le même. Le style vit dans `.field` (globals.css) : la
 * duplication d'ici redéfinissait la moitié de ses règles et loupait l'autre
 * moitié — notamment l'anneau de focus braise, qui est le seul retour visuel
 * qui dise « c'est ici que tu écris ».
 */
export const inputClass = 'field text-sm'

export function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export function toMinutes(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export function ScheduleEditor({
  entries,
  onChange,
}: {
  entries: ScheduleEntry[]
  onChange: (entries: ScheduleEntry[]) => void
}) {
  // Une pastille de 8 px doit se VOIR : c'est une marque d'identité, pas la
  // surface d'un bloc. D'où `entryMark` et non `entryFill` (cf. palette.ts).
  const theme = useResolvedTheme()
  const [day, setDay] = useState(0)
  const [draft, setDraft] = useState({
    label: '',
    category: 'school' as ScheduleCategory,
    start: '08:00',
    end: '16:00',
    /** Toutes les semaines (le défaut historique) ou une seule date précise. */
    recurrence: 'weekly' as 'weekly' | 'once',
    date: addDays(dateKey(new Date()), 7),
  })

  const dayEntries = useMemo(
    () => entries.filter((e) => e.dayOfWeek === day).sort((a, b) => a.startMinute - b.startMinute),
    [entries, day],
  )

  const add = () => {
    const start = toMinutes(draft.start)
    const end = toMinutes(draft.end)
    if (start === null || end === null || end <= start) return
    const once = draft.recurrence === 'once'
    if (once && !draft.date) return
    onChange([
      ...entries,
      {
        // Une occurrence unique porte son propre jour, dérivé de sa date —
        // pas de l'onglet actuellement ouvert, qui ne sert qu'à parcourir.
        dayOfWeek: once ? dayOfWeekOfDate(draft.date) : day,
        startMinute: start,
        endMinute: end,
        categoryType: draft.category,
        label: draft.label.trim() || CATEGORY_LABEL[draft.category],
        color: CATEGORY_COLOR[draft.category],
        ...(once ? { date: draft.date } : {}),
      },
    ])
    setDraft((d) => ({ ...d, label: '' }))
  }

  const copyToWeekdays = () => {
    // Une occurrence unique ne se duplique jamais : sa date resterait la même
    // sur des copies qui prétendraient pourtant occuper un autre jour.
    const source = entries.filter((e) => e.dayOfWeek === day && !e.date)
    const kept = entries.filter((e) => e.dayOfWeek === day || e.dayOfWeek > 4)
    const copies = [0, 1, 2, 3, 4]
      .filter((d) => d !== day)
      .flatMap((d) => source.map((e) => ({ ...e, dayOfWeek: d })))
    onChange([...kept, ...copies])
  }

  return (
    <>
      <div className="flex gap-1">
        {DAYS_SHORT.map((label, i) => {
          const count = entries.filter((e) => e.dayOfWeek === i).length
          return (
            <button
              key={label}
              type="button"
              onClick={() => setDay(i)}
              className={cn(
                'flex-1 rounded border py-2 text-xs font-medium transition-colors',
                day === i
                  ? 'border-line-strong bg-surface-2 text-fg'
                  : 'border-transparent text-fg-3 hover:text-fg-2',
              )}
            >
              {label}
              {count > 0 && <span className="ml-1 text-[10px] opacity-60">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-4 space-y-1">
        {dayEntries.length === 0 ? (
          <p className="py-4 text-center text-xs text-fg-3">
            Nothing fixed on {DAYS[day]?.toLowerCase()}. The whole day counts as available.
          </p>
        ) : (
          dayEntries.map((entry, i) => (
            <div
              key={`${entry.startMinute}-${i}`}
              className="group flex items-center gap-3 py-1 text-xs"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entryMark(entry.color, theme) }}
              />
              <span className="w-24 shrink-0 font-mono text-fg-3">
                {hhmm(entry.startMinute)} → {hhmm(entry.endMinute)}
              </span>
              <span className="truncate text-fg">{entry.label}</span>
              {entry.date && (
                <span
                  className="shrink-0 rounded-sm border border-line px-1 py-0.5 font-mono text-[9.5px] text-fg-3"
                  title="One-off, never repeated the following week"
                >
                  {entry.date.slice(5).replace('-', '.')}
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-fg-3">
                {duration(entry.endMinute - entry.startMinute)}
              </span>
              <button
                type="button"
                onClick={() => onChange(entries.filter((e) => e !== entry))}
                className="shrink-0 text-fg-3 opacity-0 transition-opacity hover:text-warn focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <div className="flex gap-0.5 rounded border border-line p-0.5">
          {(['weekly', 'once'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDraft({ ...draft, recurrence: r })}
              className={cn(
                'rounded px-2 py-1.5 text-[11px] font-medium transition-colors',
                draft.recurrence === r ? 'bg-surface-2 text-fg' : 'text-fg-3 hover:text-fg-2',
              )}
            >
              {r === 'weekly' ? 'Every week' : 'Once only'}
            </button>
          ))}
        </div>
        <input
          type="text"
          name="schedule-label"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder={CATEGORY_LABEL[draft.category]}
          className={cn(inputClass, 'min-w-[9rem] flex-1')}
        />
        <select
          name="schedule-category"
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value as ScheduleCategory })}
          className={inputClass}
        >
          {SCHEDULE_CATEGORIES.filter((c) => c !== 'sleep').map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        {draft.recurrence === 'once' && (
          <input
            type="date"
            name="schedule-date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className={inputClass}
          />
        )}
        <input
          type="time"
          name="schedule-start"
          value={draft.start}
          onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          className={inputClass}
        />
        <input
          type="time"
          name="schedule-end"
          value={draft.end}
          onChange={(e) => setDraft({ ...draft, end: e.target.value })}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2"
        >
          <Plus size={14} /> Add
        </button>
        {dayEntries.some((e) => !e.date) && day <= 4 && (
          <button
            type="button"
            onClick={copyToWeekdays}
            className="inline-flex items-center gap-1.5 text-[11px] text-fg-3 transition-colors hover:text-fg-2"
          >
            <Copy size={12} /> copy across the week
          </button>
        )}
      </div>
      {draft.recurrence === 'once' && (
        <p className="mt-2 text-[11px] text-fg-3">
          This one counts only on {draft.date.slice(5).replace('-', '.')} — never repeated the
          following week.
        </p>
      )}
    </>
  )
}

// ─── Ancres ───────────────────────────────────────────────────────────────

type AncreDraft = Creatable<AncreItem, 'id' | 'createdAt' | 'minimumMinutes'>

export function AncresEditor({
  ancres,
  onAdd,
  onDelete,
}: {
  ancres: AncreItem[]
  onAdd: (draft: AncreDraft) => void | Promise<void>
  onDelete: (id: string) => void
}) {
  const theme = useResolvedTheme()
  const [draft, setDraft] = useState({
    name: '',
    plan: '',
    time: '18:00',
    minutes: 60,
    days: [0, 1, 2, 3, 4],
  })

  const [pendingDraft, setPendingDraft] = useState<Creatable<AncreItem, 'id' | 'createdAt'> | null>(null)

  const toggleDay = (d: number) =>
    setDraft((s) => ({
      ...s,
      days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort(),
    }))

  const submit = () => {
    const minute = toMinutes(draft.time)
    if (!draft.name.trim() || !draft.plan.trim() || minute === null || draft.days.length === 0) return
    setPendingDraft({
      name: draft.name.trim(),
      plan: draft.plan.trim(),
      trigger: draft.name.trim().toLowerCase(),
      color: nextShade(ancres.length),
      anchorMinute: minute,
      daysOfWeek: draft.days,
      normalMaxMinutes: draft.minutes,
      minimumMinutes: Math.min(draft.minutes, 15),
      appsToBlock: [],
    })
  }

  return (
    <>
      <div className="space-y-1">
        {ancres.length === 0 ? (
          <p className="py-4 text-center text-xs text-fg-3">
            Sport at 6 pm, reading at 9 pm. An appointment with yourself that never moves.
          </p>
        ) : (
          ancres.map((a) => (
            <div key={a.id} className="group flex items-center gap-3 py-1 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entryMark(a.color, theme) }}
              />
              <span className="w-24 shrink-0 font-mono text-fg-3">{hhmm(a.anchorMinute)}</span>
              <span className="truncate text-fg">{a.name}</span>
              <span className="shrink-0 text-fg-3">
                {a.daysOfWeek.map((d) => DAYS_SHORT[d]?.charAt(0)).join('')}
              </span>
              <span className="ml-auto shrink-0 font-mono text-fg-3">
                {a.normalMaxMinutes} min · min. {a.minimumMinutes}
              </span>
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                className="shrink-0 text-fg-3 opacity-0 transition-opacity hover:text-warn focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-4">
        <input
          type="text"
          name="ancre-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Sport, reading, meditation…"
          className={cn(inputClass, 'w-full')}
        />
        <input
          type="text"
          name="ancre-plan"
          value={draft.plan}
          onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
          placeholder="What will this concretely involve? (e.g. tonight at the gym...)"
          className={cn(inputClass, 'w-full')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            name="ancre-time"
            value={draft.time}
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            className={inputClass}
          />
          <input
            type="number"
            name="ancre-minutes"
            min={15}
            max={480}
            step={5}
            value={draft.minutes}
            onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
            title="Normal duration, in minutes"
            className={cn(inputClass, 'w-20')}
          />
          <div className="flex gap-0.5">
            {DAYS_SHORT.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(i)}
                className={cn(
                  'w-8 rounded border py-2 text-[11px] transition-colors',
                  draft.days.includes(i)
                    ? 'border-line-strong bg-surface-2 text-fg'
                    : 'border-transparent text-fg-3 hover:text-fg-2',
                )}
                aria-pressed={draft.days.includes(i)}
                aria-label={`${draft.days.includes(i) ? 'Retirer' : 'Ajouter'} ${DAYS[i]?.toLowerCase()}`}
              >
                {label.charAt(0)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!draft.name.trim() || !draft.plan.trim()}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Plus size={14} /> Anchor it
          </button>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-fg-3">
        Two anchors can never hold the same slot: the second is refused, never moved on your
        behalf.
      </p>

      {pendingDraft && (
        <IntelligentBlockingReviewModal
          open={true}
          title={pendingDraft.name}
          plan={pendingDraft.plan}
          kindLabel="ancre"
          onConfirm={(blockedApps) => {
            void onAdd({ ...pendingDraft, appsToBlock: blockedApps })
            setPendingDraft(null)
            setDraft((s) => ({ ...s, name: '', plan: '' }))
          }}
          onCancel={() => setPendingDraft(null)}
        />
      )}
    </>
  )
}

// ─── Objectifs ────────────────────────────────────────────────────────────

export function ObjectivesEditor({
  objectives,
  onAdd,
  onDelete,
}: {
  objectives: ObjectiveItem[]
  onAdd: (draft: Creatable<ObjectiveItem, 'id' | 'createdAt'>) => void
  onDelete: (id: string) => void
}) {
  const theme = useResolvedTheme()
  const [draft, setDraft] = useState({ name: '', plan: '', hoursPerWeek: 5 })
  const [pendingDraft, setPendingDraft] = useState<Creatable<ObjectiveItem, 'id' | 'createdAt'> | null>(null)

  return (
    <>
      <div className="space-y-1">
        {objectives.length === 0 ? (
          <p className="py-4 text-center text-xs text-fg-3">
            “Guitar, 4 h a week.” What moves forward without ever being late.
          </p>
        ) : (
          objectives.map((o) => (
            <div key={o.id} className="group flex items-center gap-3 py-1 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entryMark(o.color, theme) }}
              />
              <span className="truncate text-fg">{o.name}</span>
              <span className="ml-auto shrink-0 font-mono text-fg-3">
                {duration(o.weeklyTargetMinutes)} / semaine
              </span>
              <button
                type="button"
                onClick={() => onDelete(o.id)}
                className="shrink-0 text-fg-3 opacity-0 transition-opacity hover:text-warn focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-line pt-4">
        <input
          type="text"
          name="objective-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Guitare, sport, lecture…"
          className={cn(inputClass, 'w-full')}
        />
        <input
          type="text"
          name="objective-plan"
          value={draft.plan}
          onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
          placeholder="What will this concretely involve? (e.g. every evening at the studio...)"
          className={cn(inputClass, 'w-full')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-fg-3">
            <input
              type="number"
              name="objective-hours-per-week"
              min={1}
              max={80}
              value={draft.hoursPerWeek}
              onChange={(e) => setDraft({ ...draft, hoursPerWeek: Number(e.target.value) })}
              className={cn(inputClass, 'w-20')}
            />
            h / semaine
          </label>
          <button
            type="button"
            disabled={!draft.name.trim() || !draft.plan.trim()}
            onClick={() => {
              if (!draft.name.trim() || !draft.plan.trim()) return
              setPendingDraft({
                name: draft.name.trim(),
                plan: draft.plan.trim(),
                color: nextShade(objectives.length),
                weeklyTargetMinutes: Math.round(draft.hoursPerWeek * 60),
                appsToBlock: [],
              })
            }}
            className="pressable ml-auto inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-fg-3">
        A goal can never be given a deadline. Nor does it decay as time passes.
      </p>

      {pendingDraft && (
        <IntelligentBlockingReviewModal
          open={true}
          title={pendingDraft.name}
          plan={pendingDraft.plan}
          kindLabel="objectif"
          onConfirm={(blockedApps) => {
            void onAdd({ ...pendingDraft, appsToBlock: blockedApps })
            setPendingDraft(null)
            setDraft((s) => ({ ...s, name: '', plan: '' }))
          }}
          onCancel={() => setPendingDraft(null)}
        />
      )}
    </>
  )
}

// ─── Détail par jour ──────────────────────────────────────────────────────

export function CapacityTable({ plan }: { plan: NonNullable<ReturnType<typeof usePlanning>> }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[10px] text-fg-3">
        <tr>
          <th className="pb-2 font-medium">Day</th>
          <th className="pb-2 text-right font-medium">Raw</th>
          <th className="pb-2 text-right font-medium">Unusable</th>
          <th className="pb-2 text-right font-medium">Rest</th>
          <th className="pb-2 text-right font-medium">Fatigue</th>
          <th className="pb-2 text-right font-medium">Available</th>
        </tr>
      </thead>
      <tbody className="font-mono text-fg-3">
        {plan.capacities.map((c) => (
          <tr key={c.date} className="border-t border-line">
            <td className="py-1.5 font-sans text-fg-2">
              {DAYS_SHORT[c.dayOfWeek]} <span className="text-fg-3">{c.date.slice(5)}</span>
            </td>
            <td className="py-1.5 text-right">{duration(c.rawCapacityMinutes)}</td>
            <td className="py-1.5 text-right">−{duration(c.unusableMinutes)}</td>
            <td className="py-1.5 text-right">−{duration(c.restReservedMinutes)}</td>
            <td className="py-1.5 text-right">
              {c.fatiguePenaltyMinutes + c.breathingReductionMinutes > 0
                ? `−${duration(c.fatiguePenaltyMinutes + c.breathingReductionMinutes)}`
                : '-'}
            </td>
            <td className="py-1.5 text-right font-semibold text-fg">
              {duration(c.effectiveCapacityMinutes)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── E.5 — Demander du temps ──────────────────────────────────────────────

export function RequestPanel({
  plan,
  today,
}: {
  plan: NonNullable<ReturnType<typeof usePlanning>>
  today: string
}) {
  const tasks = usePlanningStore((s) => s.tasks)
  const [minutes, setMinutes] = useState(120)
  const [verdict, setVerdict] = useState<RequestVerdict | null>(null)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-fg-2">
          I want
          <input
            type="number"
            name="free-time-request-minutes"
            min={15}
            max={720}
            step={15}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className={cn(inputClass, 'w-24')}
          />
          min free today
        </label>
        <button
          type="button"
          onClick={() =>
            setVerdict(
              evaluateRequest({
                request: { type: 'free_time', minutes, date: today },
                tasks: tasks
                  .filter((t) => t.status === 'active')
                  .map((t) => ({ deadline: t.deadline, remainingMinutes: t.remainingMinutes })),
                dailyCapacity: plan.capacities.map((c) => ({
                  date: c.date,
                  capacityMinutes: c.effectiveCapacityMinutes,
                })),
                today,
              }),
            )
          }
          className="inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2"
        >
          Ask
        </button>
      </div>

      {verdict && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-medium text-fg">
            {verdict.status === 'granted'
              ? `Granted — ${verdict.grantedMinutes} min.`
              : verdict.status === 'partial'
                ? `${verdict.grantedMinutes} min fit, not ${minutes}.`
                : 'Denied.'}
          </p>
          <p className="mt-1 text-xs text-fg-3">{verdict.reason}</p>
        </div>
      )}
    </>
  )
}
