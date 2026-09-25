/**
 * Tout ce que l'introduction sait, et tout ce qu'elle en déduit — sans une
 * ligne d'interface. Transcrit de la maquette `build/Vethos.html` : chaque
 * libellé, chaque base de calcul, chaque phrase est celle que l'auteur a
 * choisie. Rien ici ne dépend de React ; tout se teste.
 */
import type { NatureIntroduction } from './modele-introduction'

export type Nature = 'TASK' | 'GOAL' | 'ANCHOR'
export const VERS_NATURE: Record<Nature, NatureIntroduction> = {
  TASK: 'tache',
  GOAL: 'objectif',
  ANCHOR: 'ancre',
}

export const PRIOS: [string, string][] = [
  ['School', 'Make room to learn.'],
  ['Career', 'Grow where you want to go.'],
  ['A project', 'Bring an idea to life.'],
  ['Health', 'Show up for yourself.'],
  ['Discipline', 'Do what you said.'],
  ['Creativity', 'Make something of your own.'],
]

export type Frequence = { k: string; ack: string; title: string; pw: number; say: string }
export const FREQ: Frequence[] = [
  {
    k: 'Almost every evening',
    ack: 'Almost every evening. That’s a lot waiting for you.',
    title: 'So what keeps getting pushed?',
    pw: 5,
    say: 'You say it almost every evening.',
  },
  {
    k: 'A few evenings a week',
    ack: 'A few evenings a week. It adds up faster than it feels.',
    title: 'What gets pushed on those evenings?',
    pw: 3,
    say: 'You say it a few evenings a week.',
  },
  {
    k: 'About once a week',
    ack: 'About once a week. Small — until you count it.',
    title: 'What gets pushed, that one evening?',
    pw: 1,
    say: 'You say it about once a week.',
  },
  {
    k: 'Rarely',
    ack: 'Rarely. Then let’s check what “rarely” costs.',
    title: 'When it does happen, what gets pushed?',
    pw: 0.5,
    say: 'You said “rarely”.',
  },
]
export const SOUS_FREQ = [
  'The day ends, and it slides again.',
  'Some days yes, most days later.',
  'Now and then.',
  'It almost never slips.',
]

export type Choix = [string, number]
export const SINCE: Choix[] = [
  ['About a month', 4],
  ['About 3 months', 13],
  ['About 6 months', 26],
  ['A year or more', 52],
]
export const WORK: Choix[] = [
  ['About 10 hours', 10],
  ['About 30 hours', 30],
  ['About 80 hours', 80],
  ['150 hours or more', 150],
]
export const NOWO: Choix[] = [
  ['None, honestly', 0],
  ['About 1 hour', 1],
  ['About 3 hours', 3],
  ['6 hours or more', 6],
]
/** Les réponses possibles suivent ce que l'objectif demande vraiment. */
export const nowOpts = (per: number): Choix[] =>
  per >= 6
    ? [['Never', 0], ['Once or twice a week', 1.5], ['3–4 times a week', 3.5], ['Almost every day', 6]]
    : per >= 3
      ? [['Never', 0], ['Once a week', 1], ['Twice a week', 2], ['3 times or more', 3.5]]
      : [['Never', 0], ['Every other week', 0.5], ['Once a week', 1], ['Twice or more', 2.5]]

export const STOPS = [
  'My phone',
  'Too tired by evening',
  'No time left in the day',
  'I don’t know where to start',
  'I wait until I feel ready',
]
export const FIXL = ['Work', 'School', 'My days change', 'Nothing fixed'] as const
export type Fixe = (typeof FIXL)[number]

/** [libellé, séances par semaine, minutes par séance, ce qu'il faut vraiment]. */
export type But = [string, number, number, string]
export const GOALS: Record<string, But[]> = {
  exams: [
    ['Pass them', 4, 90, 'Passing takes steady review, a few times a week.'],
    ['Get top marks', 6, 90, 'Top marks come from short sessions almost every day.'],
    ['Stop cramming', 5, 60, 'A little on most days is what ends the cramming.'],
  ],
  notes: [
    ['Remember more', 3, 45, 'Remembering comes from reviewing often, a few times a week.'],
    ['Be ready for exams', 4, 60, 'Being ready takes a few reviews every week.'],
    ['Keep up in class', 3, 30, 'A few short reviews a week is enough to keep up.'],
  ],
  deep: [
    ['Ship more', 5, 90, 'Shipping more takes one focused block on most workdays.'],
    ['Grow in my career', 4, 120, 'Growth comes from a few long blocks every week.'],
    ['Get out of busywork', 5, 60, 'It starts with one protected block each workday.'],
  ],
  skill: [
    ['Change jobs', 5, 60, 'Changing jobs takes practice on most days.'],
    ['Get better at my job', 3, 60, 'Getting better takes a few practice sessions a week.'],
    ['Stay up to date', 2, 45, 'Staying current takes a couple of sessions a week.'],
  ],
  grow: [
    ['Find my first users', 4, 90, 'First users come from showing up about 4 times a week.'],
    ['Grow my audience', 3, 60, 'An audience grows from about 3 steady sessions a week.'],
    ['Make my first sales', 4, 90, 'First sales take about 4 focused sessions a week.'],
  ],
  weekly: [
    ['Make real progress', 3, 120, 'Real progress takes about 3 long sessions a week.'],
    ['Keep it moving', 2, 90, 'Twice a week is enough to keep it moving.'],
    ['Turn it into income', 4, 120, 'Making it pay takes about 4 serious sessions a week.'],
  ],
  gym: [
    ['Build muscle', 4, 120, 'Building muscle takes about 4 sessions a week, with rest days in between.'],
    ['Lose weight', 3, 60, 'Losing weight takes about 3 sessions a week. Rest days are part of it.'],
    ['Feel better in my body', 3, 60, 'Feeling better takes about 3 sessions a week, not every day.'],
  ],
  run: [
    ['Run a race', 4, 45, 'Training for a race takes about 4 runs a week.'],
    ['Get fitter', 3, 40, 'Getting fitter takes about 3 runs a week. Rest is part of the plan.'],
    ['Clear my head', 2, 30, 'Twice a week is enough to feel the difference.'],
  ],
  cook: [
    ['Eat healthier', 5, 45, 'Eating healthier starts with cooking on most evenings.'],
    ['Spend less', 4, 45, 'Cooking 4 evenings a week is what changes the budget.'],
    ['Learn to cook', 3, 60, 'Learning takes about 3 real meals a week.'],
  ],
  read: [
    ['Read more books', 7, 30, 'A book a month takes a little reading every day.'],
    ['Learn from what I read', 5, 30, 'Reading on most days is enough to keep what you read.'],
    ['Read instead of scrolling', 7, 20, 'A few pages each evening is enough to change the habit.'],
  ],
  lang: [
    ['Hold a conversation', 5, 30, 'Conversation comes from practice on most days.'],
    ['Pass a language exam', 6, 45, 'An exam takes practice almost every day.'],
    ['Keep it alive', 3, 20, 'A few short sessions a week keep it from fading.'],
  ],
  med: [
    ['Less stress', 7, 10, 'A few minutes every day does more than one long session a week.'],
    ['Sleep better', 7, 10, 'A few minutes each evening, before bed.'],
    ['Focus better', 5, 15, 'A few minutes on most days is enough to feel it.'],
  ],
  write: [
    ['Finish something', 5, 60, 'Finishing takes writing on most days.'],
    ['Write regularly', 3, 45, 'Writing regularly is about 3 sessions a week.'],
    ['Find my voice', 4, 45, 'Finding it takes about 4 sessions a week.'],
  ],
  instr: [
    ['Play songs I love', 4, 30, 'A few sessions a week is how songs come.'],
    ['Play with others', 5, 45, 'Playing with others takes practice on most days.'],
    ['Get back to it', 3, 30, 'Three short sessions a week is enough to get it back.'],
  ],
}

type Commun = {
  id: string
  prio: string
  /** Ce qu'on lit sur la ligne à cocher. */
  label: string
  /** « Since when have you been meaning to … ? » */
  since: string
  /** Le nom de l'engagement créé. */
  name: string
  fit: Nature
  per: number
  dur: number
}
export type Repete = Commun & {
  kind: 'rep'
  /** « How often do you actually … now? » */
  now: string
  noun: string
  did: string
}
export type Unique = Commun & { kind: 'once' }
export type Chose = Repete | Unique

const R = (
  id: string,
  label: string,
  since: string,
  now: string,
  name: string,
  per: number,
  dur: number,
  noun: string,
  did: string,
  fit: Nature,
): Omit<Repete, 'prio'> => ({ id, label, kind: 'rep', since, now, name, per, dur, noun, did, fit })
const O = (id: string, label: string, since: string, name: string): Omit<Unique, 'prio'> => ({
  id,
  label,
  kind: 'once',
  since,
  name,
  fit: 'TASK',
  per: 3,
  dur: 120,
})

const CAT: Record<string, Omit<Chose, 'prio'>[]> = {
  School: [
    R('exams', 'Studying for my exams', 'study for your exams', 'study for your exams', 'Study for my exams', 5, 90, 'study sessions', 'did', 'GOAL'),
    O('assign', 'An assignment I haven’t started', 'start that assignment', 'Finish my assignment'),
    R('notes', 'Reviewing my notes', 'review your notes', 'review your notes', 'Review my notes', 3, 60, 'reviews', 'did', 'ANCHOR'),
  ],
  Career: [
    O('report', 'A report I keep delaying', 'finish that report', 'Finish the report'),
    R('deep', 'Deep work on what matters', 'do deep work on what matters', 'do deep work', 'Deep work', 5, 120, 'deep work sessions', 'did', 'GOAL'),
    R('skill', 'Learning a skill for my career', 'learn that skill', 'practice that skill', 'Learn my skill', 3, 60, 'practice sessions', 'did', 'GOAL'),
  ],
  'A project': [
    R('grow', 'Growing it', 'work on growing your project', 'work on growing it', 'Grow my project', 3, 90, 'growth sessions', 'did', 'GOAL'),
    O('v1', 'Building the first version', 'build the first version', 'Build the first version'),
    R('weekly', 'Working on it every week', 'work on your project every week', 'work on your project', 'Work on my project', 3, 120, 'project sessions', 'did', 'GOAL'),
  ],
  Health: [
    R('gym', 'Going to the gym', 'go to the gym', 'go to the gym', 'Go to the gym', 4, 120, 'workouts', 'went to', 'ANCHOR'),
    R('run', 'Going for a run', 'go running', 'go for a run', 'Go for a run', 3, 45, 'runs', 'went on', 'ANCHOR'),
    R('cook', 'Cooking real meals', 'cook real meals', 'cook a real meal', 'Cook real meals', 5, 60, 'real meals', 'cooked', 'ANCHOR'),
  ],
  Discipline: [
    R('read', 'Reading every day', 'read every day', 'read', 'Read every day', 7, 30, 'reading sessions', 'did', 'ANCHOR'),
    R('lang', 'Learning a language', 'learn a language', 'practice the language', 'Learn a language', 5, 30, 'lessons', 'did', 'ANCHOR'),
    R('med', 'Meditating', 'meditate', 'meditate', 'Meditate', 7, 15, 'meditations', 'did', 'ANCHOR'),
  ],
  Creativity: [
    R('write', 'Writing', 'write', 'write', 'Write', 4, 60, 'writing sessions', 'did', 'GOAL'),
    R('instr', 'Practicing my instrument', 'practice your instrument', 'practice your instrument', 'Practice my instrument', 5, 45, 'practice sessions', 'did', 'ANCHOR'),
    O('piece', 'Finishing a piece I started', 'finish that piece', 'Finish my piece'),
  ],
}

export const ITEM: Record<string, Chose> = {}
export const ORDER: string[] = []
for (const p of Object.keys(CAT))
  for (const it of CAT[p]!) {
    ITEM[it.id] = { ...it, prio: p } as Chose
    ORDER.push(it.id)
  }
export const chosesDe = (prio: string) => (CAT[prio] ?? []).map((it) => ITEM[it.id]!)

// ——— Le temps ———

export const MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MOIS_LONGS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const JOURS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Lundi d'abord, comme partout dans Vethos. */
export const WL = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
export const JOURS_LONGS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const JOUR = 864e5
export const midi = (d: Date) => {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  return x
}
export const ajouter = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  x.setHours(12, 0, 0, 0)
  return x
}
const numero = (d: Date) => Math.floor(d.getTime() / JOUR)
const deux = (n: number) => String(n).padStart(2, '0')
export const fmt = (m: number) => {
  const v = ((Math.round(m) % 1440) + 1440) % 1440
  return `${deux(Math.floor(v / 60))}:${deux(v % 60)}`
}
/** Lundi de référence : les soirs repoussés tombent chaque semaine au même hasard. */
const LUNDI0 = new Date(2026, 0, 5, 12)

function hasard(graine: number) {
  let a = graine
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ce soir-là a-t-il été repoussé ? `pw` soirs par semaine, jamais les mêmes d'une semaine à l'autre. */
export function repousse(d: Date, pw: number): boolean {
  const jours = Math.round((d.getTime() - LUNDI0.getTime()) / JOUR)
  const sem = Math.floor(jours / 7)
  const dow = ((jours % 7) + 7) % 7
  const k = pw >= 1 ? pw : ((sem % 2) + 2) % 2 === 0 ? 1 : 0
  const r = hasard(sem * 7919 + 104729)
  const o = [0, 1, 2, 3, 4, 5, 6]
  for (let i = 6; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[o[i], o[j]] = [o[j]!, o[i]!]
  }
  return o.slice(0, k).includes(dow)
}

// ——— Les réponses, et ce qu'elles coûtent ———

export type Details = { since?: number; work?: number; goal?: number; now?: number }

export function besoin(id: string, d: Details) {
  const it = ITEM[id]!
  if (it.kind === 'once') return { per: 3, dur: 90 }
  const g = GOALS[id]?.[d.goal ?? 0]
  return g ? { per: g[1], dur: g[2] } : { per: it.per, dur: it.dur }
}

export type Mesure = {
  id: string
  weeks: number
  start: Date
  lost: number
  lostR: number
  l1: string
  l2: string
  finish: Date | null
  rem: number
  miss: number
  big: number
  unit: string
  sub: string
}

export function mesurer(id: string, d: Details, aujourdHui: Date): Mesure {
  const it = ITEM[id]!
  const today = midi(aujourdHui)
  const weeks = SINCE[d.since ?? 0]![1]
  const start = ajouter(today, -weeks * 7)
  const hz = ajouter(today, weeks * 7)
  const sM = MOIS_LONGS[start.getMonth()]! + (weeks >= 52 ? ` ${start.getFullYear()}` : '')
  const hM = MOIS_LONGS[hz.getMonth()]!
  if (it.kind === 'once') {
    const W = WORK[d.work ?? 0]![1]
    const a = NOWO[d.now ?? 0]![1]
    const meant = Math.min(W, weeks * 6)
    const put = Math.min(meant, Math.round(weeks * a))
    const lost = meant - put
    const rem = Math.max(0, W - weeks * a)
    const finish = a > 0 && rem > 0 ? ajouter(today, Math.ceil((rem / a) * 7)) : null
    const l1 = `Since ${sM}, you meant to put in ${meant} hours. ` + (put === 0 ? 'You put in none.' : `You put in ${put}.`)
    const l2 =
      a === 0
        ? `If nothing changes, it’s still not done by ${hM}.`
        : finish
          ? `At this pace, it’s only done in ${MOIS_LONGS[finish.getMonth()]}${finish.getFullYear() !== today.getFullYear() ? ` ${finish.getFullYear()}` : ''}.`
          : 'At this pace, it’s done.'
    return {
      id, weeks, start, lost, lostR: Math.round(lost), l1, l2, finish, rem, miss: 0,
      big: Math.round(lost), unit: 'hours', sub: 'already lost since you first decided.',
    }
  }
  const nd = besoin(id, d)
  const a = nowOpts(nd.per)[d.now ?? 0]![1]
  const meant = nd.per * weeks
  const went = Math.min(meant, Math.round(a * weeks))
  const lost = ((meant - went) * nd.dur) / 60
  const fut = Math.round(Math.max(0, nd.per - a) * weeks)
  const l1 = `Since ${sM}, you meant ${meant} ${it.noun}. ` + (went === 0 ? 'You did none of them.' : `You ${it.did} ${went}.`)
  const l2 = fut > 0 ? `If nothing changes, another ${fut} ${it.noun} are gone by ${hM}.` : 'If nothing changes, nothing more is lost.'
  const miss = meant - went
  const useS = lost < 40 && miss > 0
  return {
    id, weeks, start, lost, lostR: Math.round(lost), l1, l2, finish: null, rem: 0, miss,
    big: useS ? miss : Math.round(lost),
    unit: useS ? it.noun : 'hours',
    sub: useS ? 'skipped since you first decided.' : 'already lost since you first decided.',
  }
}

export function equivalence(t: number) {
  if (t >= 80) return `That’s ${Math.round(t / 40)} full work weeks of your life.`
  if (t >= 16) return `That’s ${Math.round(t / 8)} full working days of your life.`
  return `That’s ${Math.max(1, Math.round(t / 2))} whole evenings of your life.`
}

export function resume(ms: Mesure[]) {
  const h = Math.round(ms.reduce((a, m) => a + m.lost, 0))
  const t = ms.reduce((a, m) => a + (m.miss || 0), 0)
  const w = Math.max(...ms.map((m) => m.weeks))
  return h >= 40 || !t
    ? { v: h, label: 'hours you’ll never get back.', eq: equivalence(h) }
    : { v: t, label: 'times you let it slide.', eq: `That’s ${Math.max(1, Math.round(t / w))} times a week, every week.` }
}

// ——— Les calendriers ———

export type Point = { rouge: boolean; futur: boolean; today: boolean; ring: boolean; dl: number }
export type Rang = { label: string; dl: number; dots: Point[] }

/**
 * Du mois où il a décidé jusqu'à trois mois après aujourd'hui : surtout le
 * passé. Chaque soir repoussé est un point ; aujourd'hui est blanc.
 */
export function calendrier(start: Date, finish: Date | null, pw: number, aujourdHui: Date) {
  const today = midi(aujourdHui)
  const end = new Date(today.getFullYear(), today.getMonth() + 3, 1, 12)
  const td = numero(today)
  const sd = numero(start)
  const fd = finish ? numero(finish) : null
  let m = new Date(start.getFullYear(), start.getMonth(), 1, 12)
  const rows: Rang[] = []
  let ri = 0
  while (m <= end) {
    const n = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
    const dots: Point[] = []
    for (let d = 1; d <= n; d++) {
      const dt = new Date(m.getFullYear(), m.getMonth(), d, 12)
      const x = numero(dt)
      const today2 = x === td
      const rouge = !today2 && x >= sd && repousse(dt, pw)
      dots.push({ rouge, futur: rouge && x > td, today: today2, ring: fd === x && !today2, dl: ri * 120 + d * 8 })
    }
    rows.push({ label: MOIS[m.getMonth()]!, dots, dl: ri * 120 })
    ri++
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1, 12)
  }
  return rows
}

/** Les 365 prochains jours : un sur dix des soirs repoussés reste rouge, même avec Vethos. */
export function annee(pw: number, aujourdHui: Date) {
  const today = midi(aujourdHui)
  let red = 0
  const cells: { p: boolean; keep: boolean; today: boolean }[] = []
  for (let i = 0; i < 365; i++) {
    const p = repousse(ajouter(today, i), pw)
    let keep = false
    if (p) {
      red++
      keep = red % 10 === 0
    }
    cells.push({ p, keep, today: i === 0 })
  }
  return { cells, M: red, K: cells.filter((c) => c.keep).length }
}
