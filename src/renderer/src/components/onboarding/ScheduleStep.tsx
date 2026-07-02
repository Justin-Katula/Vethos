import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Moon, Briefcase, GraduationCap, Clock, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { useScheduleStore } from '@/store/schedule.store'
import { useSettingsStore } from '@/store/settings.store'
import type { ScheduleEntry, TimeRule } from '@shared/schemas'

type Props = {
  onTemplateApplied: (ruleIds: string[]) => void
  registerCommit?: (commit: () => Promise<boolean>) => void
}

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

type ProfileType = 'student' | 'worker' | 'both' | 'other'
type DaySchedule = { start: string; end: string; enabled: boolean }
type CommitmentDraft = {
  id: string
  name: string
  dayOfWeek: number
  start: string
  end: string
}

const DEFAULT_SCHOOL: DaySchedule = { start: '08:00', end: '16:00', enabled: true }
const DEFAULT_WORK: DaySchedule = { start: '09:00', end: '17:00', enabled: true }
const DEFAULT_SCHOOL_WEEK: DaySchedule[] = [
  { ...DEFAULT_SCHOOL },
  { ...DEFAULT_SCHOOL },
  { ...DEFAULT_SCHOOL },
  { ...DEFAULT_SCHOOL },
  { ...DEFAULT_SCHOOL },
  { start: '08:00', end: '16:00', enabled: false },
  { start: '08:00', end: '16:00', enabled: false },
]
const DEFAULT_WORK_WEEK: DaySchedule[] = [
  { ...DEFAULT_WORK },
  { ...DEFAULT_WORK },
  { ...DEFAULT_WORK },
  { ...DEFAULT_WORK },
  { ...DEFAULT_WORK },
  { start: '09:00', end: '17:00', enabled: false },
  { start: '09:00', end: '17:00', enabled: false },
]

// Couleurs fixes par catégorie, alignées avec le fond noir/gris.
const COLORS = {
  sleep: '#111113',
  school: '#E2E2E2',
  work: '#A8A8AC',
  free: '#C4C4C4',
  health: '#8E8E93',
}

const COMMITMENT_COLORS = ['#D8D8D8', '#B8B8B8', '#8E8E93', '#5A5A5F']

function timeToMinute(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function ScheduleStep({ onTemplateApplied, registerCommit }: Props): JSX.Element {
  const replaceAll = useScheduleStore((s) => s.replaceAll)
  const loaded = useScheduleStore((s) => s.loaded)
  const scheduleUserId = useScheduleStore((s) => s.userId)
  const load = useScheduleStore((s) => s.load)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const [profileType, setProfileType] = useState<ProfileType>('student')
  const [sleepStart, setSleepStart] = useState('23:00')
  const [sleepEnd, setSleepEnd] = useState('07:00')
  const [schoolDays, setSchoolDays] = useState<DaySchedule[]>([...DEFAULT_SCHOOL_WEEK])
  const [workDays, setWorkDays] = useState<DaySchedule[]>([...DEFAULT_WORK_WEEK])
  const [commitments, setCommitments] = useState<CommitmentDraft[]>([])
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!scheduleUserId) return
    if (!loaded) void load(scheduleUserId)
  }, [loaded, load, scheduleUserId])

  const showSchool = profileType === 'student' || profileType === 'both'
  const showWork = profileType === 'worker' || profileType === 'both'

  const updateDay = (
    setter: React.Dispatch<React.SetStateAction<DaySchedule[]>>,
    idx: number,
    patch: Partial<DaySchedule>,
  ) => {
    setter((prev) => {
      const current = prev[idx]
      return prev.map((d, i) => {
        if (i === idx) return { ...d, ...patch }
        let next = d
        if (current && patch.start !== undefined && d.enabled && d.start === current.start) {
          next = { ...next, start: patch.start }
        }
        if (current && patch.end !== undefined && d.enabled && d.end === current.end) {
          next = { ...next, end: patch.end }
        }
        return next
      })
    })
  }

  const addCommitment = () => {
    setCommitments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: '',
        dayOfWeek: 0,
        start: '18:00',
        end: '19:00',
      },
    ])
  }

  const updateCommitment = (id: string, patch: Partial<CommitmentDraft>) => {
    setCommitments((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const removeCommitment = (id: string) => {
    setCommitments((prev) => prev.filter((item) => item.id !== id))
  }

  // Calcul du temps libre par jour
  const freeTimeByDay = useMemo(() => {
    return DAYS_FR.map((_, i) => {
      let usedMinutes = 0
      // Sommeil
      const sleepS = timeToMinute(sleepStart)
      const sleepE = timeToMinute(sleepEnd)
      if (sleepS > sleepE) {
        usedMinutes += 1440 - sleepS + sleepE
      } else {
        usedMinutes += sleepE - sleepS
      }
      // École
      if (showSchool && schoolDays[i]?.enabled) {
        const s = schoolDays[i]!
        usedMinutes += timeToMinute(s.end) - timeToMinute(s.start)
      }
      // Travail
      if (showWork && workDays[i]?.enabled) {
        const w = workDays[i]!
        usedMinutes += timeToMinute(w.end) - timeToMinute(w.start)
      }
      for (const commitment of commitments) {
        if (commitment.dayOfWeek !== i) continue
        const start = timeToMinute(commitment.start)
        const end = timeToMinute(commitment.end)
        if (end > start) usedMinutes += end - start
      }
      return Math.max(0, 1440 - usedMinutes)
    })
  }, [sleepStart, sleepEnd, schoolDays, workDays, showSchool, showWork, commitments])

  const totalWeekFree = freeTimeByDay.reduce((s, m) => s + m, 0)

  const handleApply = useCallback(async (): Promise<boolean> => {
    const rules: TimeRule[] = []
    const entries: ScheduleEntry[] = []
    const now = new Date().toISOString()

    // Règle sommeil
    const sleepRule: TimeRule = {
      id: crypto.randomUUID(),
      name: 'Sommeil',
      color: COLORS.sleep,
      icon: 'Moon',
      categoryType: 'sleep',
      linkedProfileId: null,
      createdAt: now,
    }
    rules.push(sleepRule)

    // Règle école
    let schoolRule: TimeRule | null = null
    if (showSchool) {
      schoolRule = {
        id: crypto.randomUUID(),
        name: 'École',
        color: COLORS.school,
        icon: 'GraduationCap',
        categoryType: 'school',
        linkedProfileId: null,
        createdAt: now,
      }
      rules.push(schoolRule)
    }

    // Règle travail
    let workRule: TimeRule | null = null
    if (showWork) {
      workRule = {
        id: crypto.randomUUID(),
        name: 'Travail',
        color: COLORS.work,
        icon: 'Briefcase',
        categoryType: 'work',
        linkedProfileId: null,
        createdAt: now,
      }
      rules.push(workRule)
    }

    // Entrées sommeil (chaque jour)
    const sleepS = timeToMinute(sleepStart)
    const sleepE = timeToMinute(sleepEnd)
    for (let day = 0; day < 7; day++) {
      if (sleepS > sleepE) {
        // Sommeil passe minuit : bloc soirée + bloc matin
        entries.push({
          id: crypto.randomUUID(),
          ruleId: sleepRule.id,
          dayOfWeek: day,
          startMinute: sleepS,
          endMinute: 1440,
          createdAt: now,
        })
        entries.push({
          id: crypto.randomUUID(),
          ruleId: sleepRule.id,
          dayOfWeek: (day + 1) % 7,
          startMinute: 0,
          endMinute: sleepE,
          createdAt: now,
        })
      } else {
        entries.push({
          id: crypto.randomUUID(),
          ruleId: sleepRule.id,
          dayOfWeek: day,
          startMinute: sleepS,
          endMinute: sleepE,
          createdAt: now,
        })
      }
    }

    // Entrées école
    if (schoolRule) {
      for (let day = 0; day < 7; day++) {
        const d = schoolDays[day]
        if (d?.enabled) {
          entries.push({
            id: crypto.randomUUID(),
            ruleId: schoolRule.id,
            dayOfWeek: day,
            startMinute: timeToMinute(d.start),
            endMinute: timeToMinute(d.end),
            createdAt: now,
          })
        }
      }
    }

    // Entrées travail
    if (workRule) {
      for (let day = 0; day < 7; day++) {
        const d = workDays[day]
        if (d?.enabled) {
          entries.push({
            id: crypto.randomUUID(),
            ruleId: workRule.id,
            dayOfWeek: day,
            startMinute: timeToMinute(d.start),
            endMinute: timeToMinute(d.end),
            createdAt: now,
          })
        }
      }
    }

    // Entrées engagements protégés
    commitments.forEach((commitment, index) => {
      const name = commitment.name.trim()
      const start = timeToMinute(commitment.start)
      const end = timeToMinute(commitment.end)
      if (!name || end <= start) return
      const rule: TimeRule = {
        id: crypto.randomUUID(),
        name,
        color: COMMITMENT_COLORS[index % COMMITMENT_COLORS.length]!,
        icon: 'ShieldCheck',
        categoryType: 'commitment',
        linkedProfileId: null,
        createdAt: now,
      }
      rules.push(rule)
      entries.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        dayOfWeek: commitment.dayOfWeek,
        startMinute: start,
        endMinute: end,
        createdAt: now,
      })
    })

    await replaceAll(rules, entries)
    await updateSettings({
      userProfile: profileType,
      sleepStart,
      sleepEnd,
    })
    onTemplateApplied(
      rules
        .filter((r) => r.categoryType === 'work' || r.categoryType === 'school')
        .map((r) => r.id),
    )
    setApplied(true)
    return true
  }, [
    commitments,
    onTemplateApplied,
    profileType,
    replaceAll,
    schoolDays,
    showSchool,
    showWork,
    sleepEnd,
    sleepStart,
    updateSettings,
    workDays,
  ])

  useEffect(() => {
    registerCommit?.(handleApply)
  }, [handleApply, registerCommit])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Calendar size={22} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Ton emploi du temps</h1>
        <p className="max-w-xl text-sm text-text-secondary">
          {
            'Dis-moi tes horaires fixes. Vethos calculera automatiquement ton temps libre et te dira quoi en faire.'
          }
        </p>
      </header>

      {/* Profil */}
      <div>
        <label className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-text-muted">
          Ton profil
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { id: 'student' as const, label: 'Étudiant', icon: GraduationCap },
            { id: 'worker' as const, label: 'Travailleur', icon: Briefcase },
            { id: 'both' as const, label: 'Les deux', icon: Clock },
            { id: 'other' as const, label: 'Autre', icon: Calendar },
          ].map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              variant={profileType === id ? 'solid' : 'default'}
              onClick={() => setProfileType(id)}
              className={cn(
                'rounded-xl p-4 text-sm',
                profileType === id
                  ? 'border-accent/60 bg-accent/15 text-accent hover:bg-accent/20'
                  : 'bg-bg-elevated text-text-secondary',
              )}
              contentClassName="flex-col gap-2"
            >
              <Icon size={20} />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Sommeil */}
      <div className="info-panel rounded-xl bg-bg-elevated p-4">
        <div className="mb-3 flex items-center gap-2">
          <Moon size={16} className="text-text-muted" />
          <span className="text-xs font-medium uppercase tracking-widest text-text-muted">
            Heures de sommeil
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[10px] text-text-muted">Coucher</label>
            <input
              type="time"
              value={sleepStart}
              onChange={(e) => setSleepStart(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
          <span className="mt-5 text-text-muted">→</span>
          <div>
            <label className="text-[10px] text-text-muted">Réveil</label>
            <input
              type="time"
              value={sleepEnd}
              onChange={(e) => setSleepEnd(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* École */}
      {showSchool && (
        <DayGrid
          label="Heures d'école"
          icon={<GraduationCap size={16} className="text-text-muted" />}
          color={COLORS.school}
          days={schoolDays}
          onUpdate={(i, p) => updateDay(setSchoolDays, i, p)}
        />
      )}

      {/* Travail */}
      {showWork && (
        <DayGrid
          label="Heures de travail"
          icon={<Briefcase size={16} className="text-text-muted" />}
          color={COLORS.work}
          days={workDays}
          onUpdate={(i, p) => updateDay(setWorkDays, i, p)}
        />
      )}

      <div className="info-panel rounded-xl bg-bg-elevated p-4">
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={16} className="text-text-muted" />
          <span className="text-xs font-medium uppercase tracking-widest text-text-muted">
            Engagements non-négociables
          </span>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-text-secondary">
          Y a-t-il des activités de ta routine que tu veux préserver ?
        </p>
        <div className="space-y-2">
          {commitments.map((commitment) => (
            <div
              key={commitment.id}
              className="grid grid-cols-[minmax(0,1fr)_120px_92px_92px_32px] items-center gap-2"
            >
              <input
                type="text"
                value={commitment.name}
                onChange={(e) => updateCommitment(commitment.id, { name: e.target.value })}
                placeholder="Sport, musique, famille..."
                maxLength={40}
                className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              />
              <select
                value={commitment.dayOfWeek}
                onChange={(e) =>
                  updateCommitment(commitment.id, { dayOfWeek: Number(e.target.value) })
                }
                className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-xs text-text-primary outline-none focus:border-accent"
              >
                {DAYS_FR.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={commitment.start}
                onChange={(e) => updateCommitment(commitment.id, { start: e.target.value })}
                className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-xs text-text-primary outline-none focus:border-accent"
              />
              <input
                type="time"
                value={commitment.end}
                onChange={(e) => updateCommitment(commitment.id, { end: e.target.value })}
                className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-xs text-text-primary outline-none focus:border-accent"
              />
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => removeCommitment(commitment.id)}
                aria-label="Retirer cet engagement"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="default" size="sm" onClick={addCommitment} className="mt-3">
          <Plus size={13} />
          Ajouter un engagement
        </Button>
      </div>

      {/* Aperçu temps libre */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
        <div className="mb-3 text-xs font-medium uppercase tracking-widest text-accent">
          Temps libre calculé
        </div>
        <div className="grid grid-cols-7 gap-2">
          {DAYS_SHORT.map((d, i) => (
            <div key={i} className="text-center">
              <div className="text-[10px] text-text-muted">{d}</div>
              <div className="mt-1 text-sm font-bold text-text-primary">
                {Math.floor(freeTimeByDay[i]! / 60)}h
                {String(freeTimeByDay[i]! % 60).padStart(2, '0')}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-accent/20 pt-3 text-center text-sm text-text-secondary">
          Total semaine :{' '}
          <strong className="text-accent">
            {Math.floor(totalWeekFree / 60)}h{String(totalWeekFree % 60).padStart(2, '0')}
          </strong>{' '}
          de temps libre
        </div>
      </div>

      {/* Bouton appliquer */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="solid"
          onClick={() => void handleApply()}
          className={applied ? 'bg-emerald-500/15 text-emerald-300' : undefined}
        >
          {applied ? '✓ Emploi du temps enregistré' : 'Appliquer'}
        </Button>
      </div>
    </div>
  )
}

function DayGrid({
  label,
  icon,
  color,
  days,
  onUpdate,
}: {
  label: string
  icon: React.ReactNode
  color: string
  days: DaySchedule[]
  onUpdate: (i: number, p: Partial<DaySchedule>) => void
}) {
  return (
    <div className="info-panel rounded-xl bg-bg-elevated p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-widest text-text-muted">
          {label}
        </span>
        <div className="ml-auto h-3 w-3 rounded-2xl" style={{ backgroundColor: color }} />
      </div>
      <div className="space-y-2">
        {DAYS_FR.map((day, i) => (
          <div key={i} className="flex items-center gap-3">
            <Button
              type="button"
              variant={days[i]?.enabled ? 'solid' : 'default'}
              size="sm"
              onClick={() => onUpdate(i, { enabled: !days[i]?.enabled })}
              className={cn(
                'w-20 shrink-0 rounded-md px-2 py-1.5',
                days[i]?.enabled
                  ? 'border-accent/50 bg-accent/15 text-accent hover:bg-accent/20'
                  : 'bg-bg-base text-text-muted',
              )}
            >
              {day}
            </Button>
            {days[i]?.enabled ? (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={days[i]?.start ?? '08:00'}
                  onChange={(e) => onUpdate(i, { start: e.target.value })}
                  className="rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                />
                <span className="text-text-muted text-xs">→</span>
                <input
                  type="time"
                  value={days[i]?.end ?? '16:00'}
                  onChange={(e) => onUpdate(i, { end: e.target.value })}
                  className="rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
                />
              </div>
            ) : (
              <span className="text-xs text-text-muted italic">Jour libre</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
