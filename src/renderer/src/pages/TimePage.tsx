import { useMemo, useState } from 'react'
import { Bed, Clock, Anchor, Target, Plus, Trash2, Copy, AlertTriangle } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { useToast } from '@/lib/use-toast'
import { cn } from '@/lib/cn'
import { evaluateRequest, type RequestVerdict } from '@/lib/planning/requests'
import { dateKey } from '@/lib/planning/dates'
import { SCHEDULE_CATEGORIES, type ScheduleCategory } from '@shared/schemas'
import type { ScheduleEntry } from '@/lib/planning/types'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const CATEGORY_META: Record<ScheduleCategory, { label: string; color: string }> = {
  sleep: { label: 'Sommeil', color: '#4C566A' },
  school: { label: 'École', color: '#5E81AC' },
  work: { label: 'Travail', color: '#B48EAD' },
  commute: { label: 'Trajet', color: '#8FBCBB' },
  commitment: { label: 'Obligation', color: '#D08770' },
  custom: { label: 'Autre', color: '#7B8794' },
}

const ANCRE_COLORS = ['#3ECF8E', '#EBCB8B', '#88C0D0', '#BF616A', '#B48EAD']

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function toMinutes(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export default function TimePage() {
  const [now] = useState(() => new Date())
  const plan = usePlanning(now)
  const { schedule, ancres, objectives, setSchedule, addAncre, deleteAncre, addObjective, deleteObjective } =
    usePlanningStore()
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const toast = useToast()

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-10 overflow-y-auto px-12 pb-20 pt-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Mon temps</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Ce que tu déclares ici est le seul socle du planning. Tout le reste — ce qu’il te reste
            vraiment, ce qui tient avant une deadline — s’en déduit.
          </p>
        </header>

        <SleepSection
          sleepStart={sleepStart}
          sleepEnd={sleepEnd}
          onChange={(patch) => void updateSettings(patch)}
        />

        <ScheduleSection entries={schedule} onChange={(entries) => void setSchedule(entries)} />

        <AncresSection
          ancres={ancres}
          onAdd={async (draft) => {
            try {
              await addAncre(draft)
            } catch (err) {
              // D.3 : la création est refusée, jamais décalée en silence.
              toast.error({
                title: 'Ancre refusée',
                description: err instanceof Error ? err.message : String(err),
              })
            }
          }}
          onDelete={(id) => void deleteAncre(id)}
        />

        <ObjectivesSection
          objectives={objectives}
          onAdd={(draft) => void addObjective(draft)}
          onDelete={(id) => void deleteObjective(id)}
        />

        <CapacityReadout plan={plan} />

        <RequestSection plan={plan} today={dateKey(now)} />
      </div>
    </PageTransition>
  )
}

// ─── E.5 — Demander du temps ──────────────────────────────────────────────

function RequestSection({ plan, today }: { plan: ReturnType<typeof usePlanning>; today: string }) {
  const tasks = usePlanningStore((s) => s.tasks)
  const [minutes, setMinutes] = useState(120)
  const [verdict, setVerdict] = useState<RequestVerdict | null>(null)

  if (!plan) return null

  const ask = () => {
    setVerdict(
      evaluateRequest({
        request: { type: 'free_time', minutes, date: today },
        tasks: tasks
          .filter((t) => t.status === 'active')
          .map((t) => ({ deadline: t.deadline, remainingMinutes: t.remainingMinutes })),
        dailyCapacity: plan.capacities.map((c) => ({ date: c.date, capacityMinutes: c.effectiveCapacityMinutes })),
        today,
      }),
    )
  }

  return (
    <Section
      icon={<Clock size={16} />}
      title="Demander du temps libre"
      hint="L'application ne t'interrompt jamais pour te demander quoi que ce soit. C'est toi qui viens demander — et elle répond avec des chiffres."
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Je veux
          <input
            type="number"
            min={15}
            max={720}
            step={15}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-24 rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
          min de libre aujourd’hui
        </label>
        <button
          type="button"
          onClick={ask}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Demander
        </button>
      </div>

      {verdict && (
        <div
          className={cn(
            'mt-4 rounded-md border px-4 py-3 text-xs',
            verdict.status === 'granted'
              ? 'border-accent/30 bg-accent/5 text-text-secondary'
              : 'border-orange-500/30 bg-orange-500/5 text-text-secondary',
          )}
        >
          <p className="font-medium text-text-primary">
            {verdict.status === 'granted'
              ? `Accordé — ${verdict.grantedMinutes} min.`
              : verdict.status === 'partial'
                ? `${verdict.grantedMinutes} min tiennent, pas ${minutes}.`
                : 'Refusé.'}
          </p>
          <p className="mt-1">{verdict.reason}</p>
        </div>
      )}
    </Section>
  )
}

// ─── Sommeil ──────────────────────────────────────────────────────────────

function SleepSection({
  sleepStart,
  sleepEnd,
  onChange,
}: {
  sleepStart: string
  sleepEnd: string
  onChange: (patch: { sleepStart?: string; sleepEnd?: string }) => void
}) {
  const start = toMinutes(sleepStart) ?? 0
  const end = toMinutes(sleepEnd) ?? 0
  const duration = start < end ? end - start : 1440 - start + end

  return (
    <Section icon={<Bed size={16} />} title="Sommeil" hint="Jamais compté comme du travail. Aucune notification n'est émise pendant ces heures.">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Coucher
          <input
            type="time"
            value={sleepStart}
            onChange={(e) => onChange({ sleepStart: e.target.value })}
            className="rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Lever
          <input
            type="time"
            value={sleepEnd}
            onChange={(e) => onChange({ sleepEnd: e.target.value })}
            className="rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <span className="ml-auto font-mono text-sm text-text-muted">{hours(duration)} par nuit</span>
      </div>
    </Section>
  )
}

// ─── Réalité fixe ─────────────────────────────────────────────────────────

function ScheduleSection({
  entries,
  onChange,
}: {
  entries: ScheduleEntry[]
  onChange: (entries: ScheduleEntry[]) => void
}) {
  const [day, setDay] = useState(0)
  const [draft, setDraft] = useState({ label: '', category: 'school' as ScheduleCategory, start: '08:00', end: '16:00' })

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
        label: draft.label.trim() || CATEGORY_META[draft.category].label,
        color: CATEGORY_META[draft.category].color,
      },
    ])
    setDraft((d) => ({ ...d, label: '' }))
  }

  const copyToWeekdays = () => {
    const source = entries.filter((e) => e.dayOfWeek === day)
    const others = entries.filter((e) => e.dayOfWeek === day || e.dayOfWeek > 4)
    const copies = [0, 1, 2, 3, 4]
      .filter((d) => d !== day)
      .flatMap((d) => source.map((e) => ({ ...e, dayOfWeek: d })))
    onChange([...others, ...copies])
  }

  const remove = (target: ScheduleEntry) => {
    onChange(entries.filter((e) => e !== target))
  }

  return (
    <Section
      icon={<Clock size={16} />}
      title="Obligations fixes"
      hint="École, travail, trajets, engagements. Non négociable : ce temps sort de la capacité avant tout le reste."
    >
      <div className="flex gap-1.5">
        {DAYS_SHORT.map((label, i) => {
          const count = entries.filter((e) => e.dayOfWeek === i).length
          return (
            <button
              key={label}
              type="button"
              onClick={() => setDay(i)}
              className={cn(
                'flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                day === i
                  ? 'border-accent/60 bg-accent/10 text-text-primary'
                  : 'border-border-subtle text-text-secondary hover:border-border-strong hover:text-text-primary',
              )}
            >
              {label}
              {count > 0 && <span className="ml-1 text-[10px] text-text-muted">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-4 space-y-2">
        {dayEntries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-subtle px-4 py-6 text-center text-xs text-text-muted">
            Rien de fixe le {DAYS[day]?.toLowerCase()}. Toute la journée compte comme disponible.
          </p>
        ) : (
          dayEntries.map((entry, i) => (
            <div
              key={`${entry.dayOfWeek}-${entry.startMinute}-${i}`}
              className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-base px-3 py-2"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-sm text-text-primary">{entry.label}</span>
              <span className="font-mono text-xs text-text-muted">
                {hhmm(entry.startMinute)} → {hhmm(entry.endMinute)}
              </span>
              <span className="ml-auto font-mono text-xs text-text-muted">
                {hours(entry.endMinute - entry.startMinute)}
              </span>
              <button
                type="button"
                onClick={() => remove(entry)}
                className="text-text-muted transition-colors hover:text-red-400"
                aria-label="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder={CATEGORY_META[draft.category].label}
          className="min-w-[10rem] flex-1 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value as ScheduleCategory })}
          className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {SCHEDULE_CATEGORIES.filter((c) => c !== 'sleep').map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={draft.start}
          onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
        <input
          type="time"
          value={draft.end}
          onChange={(e) => setDraft({ ...draft, end: e.target.value })}
          className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={15} /> Ajouter
        </button>
        {dayEntries.length > 0 && day <= 4 && (
          <button
            type="button"
            onClick={copyToWeekdays}
            className="inline-flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <Copy size={14} /> Copier sur la semaine
          </button>
        )}
      </div>
    </Section>
  )
}

// ─── Ancres ───────────────────────────────────────────────────────────────

type AncreDraft = {
  name: string
  trigger: string
  color: string
  anchorMinute: number
  daysOfWeek: number[]
  normalMaxMinutes: number
}

function AncresSection({
  ancres,
  onAdd,
  onDelete,
}: {
  ancres: ReturnType<typeof usePlanningStore.getState>['ancres']
  onAdd: (draft: AncreDraft) => void | Promise<void>
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState({ name: '', time: '18:00', minutes: 60, days: [0, 1, 2, 3, 4] as number[] })

  const toggleDay = (d: number) =>
    setDraft((s) => ({ ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort() }))

  const submit = () => {
    const minute = toMinutes(draft.time)
    if (!draft.name.trim() || minute === null || draft.days.length === 0) return
    void onAdd({
      name: draft.name.trim(),
      trigger: draft.name.trim().toLowerCase(),
      color: ANCRE_COLORS[ancres.length % ANCRE_COLORS.length]!,
      anchorMinute: minute,
      daysOfWeek: draft.days,
      normalMaxMinutes: draft.minutes,
    })
    setDraft((s) => ({ ...s, name: '' }))
  }

  return (
    <Section
      icon={<Anchor size={16} />}
      title="Ancres"
      hint="Une habitude à heure fixe. Elle ne bouge jamais d'un jour à l'autre — et deux ancres ne peuvent pas occuper le même créneau."
    >
      <div className="space-y-2">
        {ancres.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-subtle px-4 py-6 text-center text-xs text-text-muted">
            Aucune ancre. Le sport à 18 h, la lecture à 21 h — ce genre de rendez-vous avec toi-même.
          </p>
        ) : (
          ancres.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-base px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
              <span className="text-sm text-text-primary">{a.name}</span>
              <span className="font-mono text-xs text-text-muted">{hhmm(a.anchorMinute)}</span>
              <span className="text-xs text-text-muted">
                {a.daysOfWeek.map((d) => DAYS_SHORT[d]).join(' ')}
              </span>
              <span className="ml-auto font-mono text-xs text-text-muted">
                {a.normalMaxMinutes} min · min. {a.minimumMinutes}
              </span>
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                className="text-text-muted transition-colors hover:text-red-400"
                aria-label="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Sport, lecture, méditation…"
          className="min-w-[10rem] flex-1 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <input
          type="time"
          value={draft.time}
          onChange={(e) => setDraft({ ...draft, time: e.target.value })}
          className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
        <input
          type="number"
          min={15}
          max={480}
          step={5}
          value={draft.minutes}
          onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
          title="Durée normale (min)"
          className="w-20 rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
        <div className="flex gap-1">
          {DAYS_SHORT.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => toggleDay(i)}
              className={cn(
                'w-9 rounded-md border py-2 text-[11px] font-medium transition-colors',
                draft.days.includes(i)
                  ? 'border-accent/60 bg-accent/10 text-text-primary'
                  : 'border-border-subtle text-text-muted hover:text-text-secondary',
              )}
            >
              {label.slice(0, 1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={submit}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={15} /> Ancrer
        </button>
      </div>
    </Section>
  )
}

// ─── Objectifs ────────────────────────────────────────────────────────────

function ObjectivesSection({
  objectives,
  onAdd,
  onDelete,
}: {
  objectives: ReturnType<typeof usePlanningStore.getState>['objectives']
  onAdd: (draft: { name: string; color: string; weeklyTargetMinutes: number }) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState({ name: '', hoursPerWeek: 5 })

  return (
    <Section
      icon={<Target size={16} />}
      title="Objectifs"
      hint="Gouvernés par le rythme, pas par une échéance : une cible d'heures par semaine. Un objectif ne peut jamais recevoir de deadline."
    >
      <div className="space-y-2">
        {objectives.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-subtle px-4 py-6 text-center text-xs text-text-muted">
            Aucun objectif. « Guitare, 4 h par semaine » — ce qui avance sans jamais être en retard.
          </p>
        ) : (
          objectives.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-base px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: o.color }} />
              <span className="text-sm text-text-primary">{o.name}</span>
              <span className="ml-auto font-mono text-xs text-text-muted">
                {hours(o.weeklyTargetMinutes)} / semaine
              </span>
              <button
                type="button"
                onClick={() => onDelete(o.id)}
                className="text-text-muted transition-colors hover:text-red-400"
                aria-label="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Guitare, sport, lecture…"
          className="min-w-[10rem] flex-1 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input
            type="number"
            min={1}
            max={80}
            value={draft.hoursPerWeek}
            onChange={(e) => setDraft({ ...draft, hoursPerWeek: Number(e.target.value) })}
            className="w-20 rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
          h / semaine
        </label>
        <button
          type="button"
          disabled={!draft.name.trim()}
          onClick={() => {
            onAdd({
              name: draft.name.trim(),
              color: ANCRE_COLORS[objectives.length % ANCRE_COLORS.length]!,
              weeklyTargetMinutes: Math.round(draft.hoursPerWeek * 60),
            })
            setDraft((s) => ({ ...s, name: '' }))
          }}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          <Plus size={15} /> Ajouter
        </button>
      </div>
    </Section>
  )
}

// ─── Ce qu'il reste vraiment ──────────────────────────────────────────────

function CapacityReadout({ plan }: { plan: ReturnType<typeof usePlanning> }) {
  if (!plan) return null

  return (
    <Section
      icon={<Clock size={16} />}
      title="Ce qu'il te reste"
      hint="Capacité brute moins les fragments trop courts, le repos réservé et la fatigue accumulée. C'est ce chiffre — et lui seul — qui décide de ce qui tient."
    >
      <div className="overflow-hidden rounded-md border border-border-subtle">
        <table className="w-full text-sm">
          <thead className="bg-bg-base text-left text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Jour</th>
              <th className="px-3 py-2 text-right font-medium">Brute</th>
              <th className="px-3 py-2 text-right font-medium">Inutilisable</th>
              <th className="px-3 py-2 text-right font-medium">Repos</th>
              <th className="px-3 py-2 text-right font-medium">Fatigue</th>
              <th className="px-3 py-2 text-right font-medium">Respiration</th>
              <th className="px-3 py-2 text-right font-medium">Disponible</th>
            </tr>
          </thead>
          <tbody>
            {plan.capacities.map((c) => (
              <tr key={c.date} className="border-t border-border-subtle">
                <td className="px-3 py-2 text-text-secondary">
                  {DAYS_SHORT[c.dayOfWeek]} <span className="text-text-muted">{c.date.slice(5)}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">{hours(c.rawCapacityMinutes)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">−{hours(c.unusableMinutes)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">−{hours(c.restReservedMinutes)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
                  {c.fatiguePenaltyMinutes > 0 ? `−${hours(c.fatiguePenaltyMinutes)}` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
                  {c.breathingReductionMinutes > 0 ? `−${hours(c.breathingReductionMinutes)}` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-accent">
                  {hours(c.effectiveCapacityMinutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plan.breathing.adjustment !== 'none' && (
        <p className="mt-3 flex items-start gap-2 text-xs text-text-muted">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-orange-400" />
          Respiration hebdomadaire : il manque {hours(Math.abs(plan.breathing.gapMinutes))} de repos sur la
          semaine. {plan.breathing.reducedDates.join(', ')} {plan.breathing.reducedDates.length > 1 ? 'sont réduits' : 'est réduit'} à{' '}
          {plan.breathing.capPercent} % — décidé sans rien te demander.
        </p>
      )}
    </Section>
  )
}

// ─── Coque commune ────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-text-muted">{hint}</p>
      </div>
      <div className="rounded-lg border border-border-subtle bg-bg-card p-5 shadow-card">{children}</div>
    </section>
  )
}
