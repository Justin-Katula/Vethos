import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Moon, Briefcase, GraduationCap, Clock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useScheduleStore } from '@/store/schedule.store'
import { useSettingsStore } from '@/store/settings.store'
import type { ScheduleEntry, TimeRule } from '@shared/schemas'

type Props = {
  onTemplateApplied: (ruleIds: string[]) => void
}

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

type ProfileType = 'student' | 'worker' | 'both' | 'other'
type DaySchedule = { start: string; end: string; enabled: boolean }

const DEFAULT_SCHOOL: DaySchedule = { start: '08:00', end: '16:00', enabled: true }
const DEFAULT_WORK: DaySchedule = { start: '09:00', end: '17:00', enabled: true }
const DEFAULT_SCHOOL_WEEK: DaySchedule[] = [
  { ...DEFAULT_SCHOOL }, { ...DEFAULT_SCHOOL }, { ...DEFAULT_SCHOOL },
  { ...DEFAULT_SCHOOL }, { ...DEFAULT_SCHOOL },
  { start: '08:00', end: '16:00', enabled: false },
  { start: '08:00', end: '16:00', enabled: false },
]
const DEFAULT_WORK_WEEK: DaySchedule[] = [
  { ...DEFAULT_WORK }, { ...DEFAULT_WORK }, { ...DEFAULT_WORK },
  { ...DEFAULT_WORK }, { ...DEFAULT_WORK },
  { start: '09:00', end: '17:00', enabled: false },
  { start: '09:00', end: '17:00', enabled: false },
]

// Couleurs fixes par catégorie (prompt)
const COLORS = {
  sleep: '#1E3A5F',     // Bleu foncé
  school: '#FFFFFF',    // Blanc
  work: '#3BA3FF',      // Bleu clair
  free: '#FFD54F',      // Jaune
  health: '#FF8A00',    // Orange
}

function timeToMinute(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function ScheduleStep({ onTemplateApplied }: Props): JSX.Element {
  const replaceAll = useScheduleStore((s) => s.replaceAll)
  const loaded = useScheduleStore((s) => s.loaded)
  const load = useScheduleStore((s) => s.load)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const [profileType, setProfileType] = useState<ProfileType>('student')
  const [sleepStart, setSleepStart] = useState('23:00')
  const [sleepEnd, setSleepEnd] = useState('07:00')
  const [schoolDays, setSchoolDays] = useState<DaySchedule[]>([...DEFAULT_SCHOOL_WEEK])
  const [workDays, setWorkDays] = useState<DaySchedule[]>([...DEFAULT_WORK_WEEK])
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const showSchool = profileType === 'student' || profileType === 'both'
  const showWork = profileType === 'worker' || profileType === 'both'

  const updateDay = (
    setter: React.Dispatch<React.SetStateAction<DaySchedule[]>>,
    idx: number,
    patch: Partial<DaySchedule>,
  ) => {
    setter((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)))
  }

  // Calcul du temps libre par jour
  const freeTimeByDay = useMemo(() => {
    return DAYS_FR.map((_, i) => {
      let usedMinutes = 0
      // Sommeil
      const sleepS = timeToMinute(sleepStart)
      const sleepE = timeToMinute(sleepEnd)
      if (sleepS > sleepE) {
        usedMinutes += (1440 - sleepS) + sleepE
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
      return Math.max(0, 1440 - usedMinutes)
    })
  }, [sleepStart, sleepEnd, schoolDays, workDays, showSchool, showWork])

  const totalWeekFree = freeTimeByDay.reduce((s, m) => s + m, 0)

  const handleApply = async () => {
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

    await replaceAll(rules, entries)
    await updateSettings({
      userProfile: profileType,
      sleepStart,
      sleepEnd,
    })
    onTemplateApplied(rules.filter((r) => r.categoryType === 'custom').map((r) => r.id))
    setApplied(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Calendar size={22} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Ton emploi du temps</h1>
        <p className="max-w-xl text-sm text-text-secondary">
          {"Dis-moi tes horaires fixes. Nexus calculera automatiquement ton temps libre et te dira quoi en faire."}
        </p>
      </header>

      {/* Profil */}
      <div>
        <label className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-text-muted">
          Ton profil
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            { id: 'student' as const, label: 'Étudiant', icon: GraduationCap },
            { id: 'worker' as const, label: 'Travailleur', icon: Briefcase },
            { id: 'both' as const, label: 'Les deux', icon: Clock },
            { id: 'other' as const, label: 'Autre', icon: Calendar },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setProfileType(id)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors',
                profileType === id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-subtle bg-bg-elevated text-text-secondary hover:border-border-strong',
              )}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sommeil */}
      <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
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
                {Math.floor(freeTimeByDay[i]! / 60)}h{String(freeTimeByDay[i]! % 60).padStart(2, '0')}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-accent/20 pt-3 text-center text-sm text-text-secondary">
          Total semaine : <strong className="text-accent">{Math.floor(totalWeekFree / 60)}h{String(totalWeekFree % 60).padStart(2, '0')}</strong> de temps libre
        </div>
      </div>

      {/* Bouton appliquer */}
      <div className="flex justify-end">
        <motion.button
          type="button"
          onClick={() => void handleApply()}
          whileHover={{ y: -1 }}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
            applied
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-accent text-white hover:bg-accent-hover',
          )}
        >
          {applied ? '✓ Emploi du temps enregistré' : 'Appliquer'}
        </motion.button>
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
    <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-widest text-text-muted">
          {label}
        </span>
        <div className="ml-auto h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <div className="space-y-2">
        {DAYS_FR.map((day, i) => (
          <div key={i} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onUpdate(i, { enabled: !days[i]?.enabled })}
              className={cn(
                'w-20 shrink-0 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                days[i]?.enabled
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-border-subtle bg-bg-base text-text-muted',
              )}
            >
              {day}
            </button>
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
