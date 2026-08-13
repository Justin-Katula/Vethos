import { useMemo, useState } from 'react'
import { Plus, Trash2, Copy } from 'lucide-react'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { evaluateRequest, type RequestVerdict } from '@/lib/planning/requests'
import { CATEGORY_COLOR, CATEGORY_LABEL, nextShade } from '@/lib/palette'
import { cn } from '@/lib/cn'
import { SCHEDULE_CATEGORIES, type ScheduleCategory } from '@shared/schemas'
import type { AncreItem, ObjectiveItem, ScheduleEntry } from '@/lib/planning/types'

/**
 * Les editeurs partages.
 *
 * Ils vivaient dans « Mon temps » quand cette page portait tout. Depuis que la
 * declaration du temps et celle des engagements sont deux endroits distincts,
 * ils sont ici : un editeur ne doit pas savoir sur quelle page il est rendu.
 */

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
export const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export const inputClass =
  'rounded border border-line bg-base px-3 py-2 text-sm text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-line-strong'

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
  const [day, setDay] = useState(0)
  const [draft, setDraft] = useState({
    label: '',
    category: 'school' as ScheduleCategory,
    start: '08:00',
    end: '16:00',
  })

  const dayEntries = useMemo(
    () => entries.filter((e) => e.dayOfWeek === day).sort((a, b) => a.startMinute - b.startMinute),
    [entries, day],
  )

  const add = () => {
    const start = toMinutes(draft.start)
    const end = toMinutes(draft.end)
    if (start === null || end === null || end <= start) return
    onChange([
      ...entries,
      {
        dayOfWeek: day,
        startMinute: start,
        endMinute: end,
        categoryType: draft.category,
        label: draft.label.trim() || CATEGORY_LABEL[draft.category],
        color: CATEGORY_COLOR[draft.category],
      },
    ])
    setDraft((d) => ({ ...d, label: '' }))
  }

  const copyToWeekdays = () => {
    const source = entries.filter((e) => e.dayOfWeek === day)
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
            Rien de fixe le {DAYS[day]?.toLowerCase()}. La journée entière compte comme disponible.
          </p>
        ) : (
          dayEntries.map((entry, i) => (
            <div
              key={`${entry.startMinute}-${i}`}
              className="group flex items-center gap-3 py-1 text-xs"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="w-24 shrink-0 font-mono text-fg-3">
                {hhmm(entry.startMinute)} → {hhmm(entry.endMinute)}
              </span>
              <span className="truncate text-fg">{entry.label}</span>
              <span className="ml-auto shrink-0 font-mono text-fg-3">
                {duration(entry.endMinute - entry.startMinute)}
              </span>
              <button
                type="button"
                onClick={() => onChange(entries.filter((e) => e !== entry))}
                className="shrink-0 text-fg-3 opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                aria-label="Supprimer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <input
          type="text"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder={CATEGORY_LABEL[draft.category]}
          className={cn(inputClass, 'min-w-[9rem] flex-1')}
        />
        <select
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
        <input
          type="time"
          value={draft.start}
          onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          className={inputClass}
        />
        <input
          type="time"
          value={draft.end}
          onChange={(e) => setDraft({ ...draft, end: e.target.value })}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2"
        >
          <Plus size={14} /> Ajouter
        </button>
        {dayEntries.length > 0 && day <= 4 && (
          <button
            type="button"
            onClick={copyToWeekdays}
            className="inline-flex items-center gap-1.5 text-[11px] text-fg-3 transition-colors hover:text-fg-2"
          >
            <Copy size={12} /> copier sur la semaine
          </button>
        )}
      </div>
    </>
  )
}

// ─── Ancres ───────────────────────────────────────────────────────────────

type AncreDraft = Omit<AncreItem, 'id' | 'createdAt' | 'minimumMinutes'>

export function AncresEditor({
  ancres,
  onAdd,
  onDelete,
}: {
  ancres: AncreItem[]
  onAdd: (draft: AncreDraft) => void | Promise<void>
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState({
    name: '',
    time: '18:00',
    minutes: 60,
    days: [0, 1, 2, 3, 4],
  })

  const toggleDay = (d: number) =>
    setDraft((s) => ({
      ...s,
      days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort(),
    }))

  const submit = () => {
    const minute = toMinutes(draft.time)
    if (!draft.name.trim() || minute === null || draft.days.length === 0) return
    void onAdd({
      name: draft.name.trim(),
      trigger: draft.name.trim().toLowerCase(),
      color: nextShade(ancres.length),
      anchorMinute: minute,
      daysOfWeek: draft.days,
      normalMaxMinutes: draft.minutes,
    })
    setDraft((s) => ({ ...s, name: '' }))
  }

  return (
    <>
      <div className="space-y-1">
        {ancres.length === 0 ? (
          <p className="py-4 text-center text-xs text-fg-3">
            Le sport à 18 h, la lecture à 21 h. Un rendez-vous avec toi-même qui ne bouge jamais.
          </p>
        ) : (
          ancres.map((a) => (
            <div key={a.id} className="group flex items-center gap-3 py-1 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: a.color }}
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
                className="shrink-0 text-fg-3 opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                aria-label="Supprimer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Sport, lecture, méditation…"
          className={cn(inputClass, 'min-w-[9rem] flex-1')}
        />
        <input
          type="time"
          value={draft.time}
          onChange={(e) => setDraft({ ...draft, time: e.target.value })}
          className={inputClass}
        />
        <input
          type="number"
          min={15}
          max={480}
          step={5}
          value={draft.minutes}
          onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
          title="Durée normale, en minutes"
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
            >
              {label.charAt(0)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={submit}
          className="inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2"
        >
          <Plus size={14} /> Ancrer
        </button>
      </div>
      <p className="mt-3 text-[11px] text-fg-3">
        Deux ancres ne peuvent jamais occuper le même créneau : la seconde est refusée, jamais
        décalée à ta place.
      </p>
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
  onAdd: (draft: Omit<ObjectiveItem, 'id' | 'createdAt'>) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState({ name: '', hoursPerWeek: 5 })

  return (
    <>
      <div className="space-y-1">
        {objectives.length === 0 ? (
          <p className="py-4 text-center text-xs text-fg-3">
            « Guitare, 4 h par semaine ». Ce qui avance sans jamais être en retard.
          </p>
        ) : (
          objectives.map((o) => (
            <div key={o.id} className="group flex items-center gap-3 py-1 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: o.color }}
              />
              <span className="truncate text-fg">{o.name}</span>
              <span className="ml-auto shrink-0 font-mono text-fg-3">
                {duration(o.weeklyTargetMinutes)} / semaine
              </span>
              <button
                type="button"
                onClick={() => onDelete(o.id)}
                className="shrink-0 text-fg-3 opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                aria-label="Supprimer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Guitare, sport, lecture…"
          className={cn(inputClass, 'min-w-[9rem] flex-1')}
        />
        <label className="flex items-center gap-2 text-xs text-fg-3">
          <input
            type="number"
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
          disabled={!draft.name.trim()}
          onClick={() => {
            onAdd({
              name: draft.name.trim(),
              color: nextShade(objectives.length),
              weeklyTargetMinutes: Math.round(draft.hoursPerWeek * 60),
            })
            setDraft((s) => ({ ...s, name: '' }))
          }}
          className="inline-flex items-center gap-1.5 rounded border border-line-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
        >
          <Plus size={14} /> Ajouter
        </button>
      </div>
      <p className="mt-3 text-[11px] text-fg-3">
        Un objectif ne peut jamais recevoir de deadline. Il ne se dégrade pas non plus avec le temps
        qui passe.
      </p>
    </>
  )
}

// ─── Détail par jour ──────────────────────────────────────────────────────

export function CapacityTable({ plan }: { plan: NonNullable<ReturnType<typeof usePlanning>> }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[10px] uppercase tracking-wider text-fg-3">
        <tr>
          <th className="pb-2 font-medium">Jour</th>
          <th className="pb-2 text-right font-medium">Brute</th>
          <th className="pb-2 text-right font-medium">Inutilisable</th>
          <th className="pb-2 text-right font-medium">Repos</th>
          <th className="pb-2 text-right font-medium">Fatigue</th>
          <th className="pb-2 text-right font-medium">Disponible</th>
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
          Je veux
          <input
            type="number"
            min={15}
            max={720}
            step={15}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className={cn(inputClass, 'w-24')}
          />
          min de libre aujourd’hui
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
          Demander
        </button>
      </div>

      {verdict && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-medium text-fg">
            {verdict.status === 'granted'
              ? `Accordé, ${verdict.grantedMinutes} min.`
              : verdict.status === 'partial'
                ? `${verdict.grantedMinutes} min tiennent, pas ${minutes}.`
                : 'Refusé.'}
          </p>
          <p className="mt-1 text-xs text-fg-3">{verdict.reason}</p>
        </div>
      )}
    </>
  )
}
