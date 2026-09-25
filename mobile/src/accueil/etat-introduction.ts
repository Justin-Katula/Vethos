/**
 * L'état de l'introduction et son parcours. Le chemin se recalcule à partir
 * des réponses : trois questions par chose repoussée, un réglage de plus pour
 * une tâche ou une ancre. Pur, testable.
 */
import type { Activite, BrouillonIntroduction, EngagementIntroduction } from './modele-introduction'
import {
  besoin,
  FREQ,
  VERS_NATURE,
  ITEM,
  mesurer,
  ORDER,
  PRIOS,
  type Details,
  type Fixe,
  type Nature,
} from './catalogue-introduction'

export type Etape = { k: string; t?: number }

export type EtatIntro = {
  name: string
  prios: string[]
  freq: number | null
  /** Le « Rarely » vérifié : 'y' = rarement, 'n' = en fait quelques soirs. */
  chk3: false | 'y' | 'n'
  things: string[]
  det: Record<string, Details>
  stops: number[]
  /** Ce que Vethos prend en charge (écran 11) ; null = tout. */
  picks: string[] | null
  chosen: string | null
  type: Record<string, Nature>
  /** Réglages, en minutes ou en « HH:MM ». */
  w: {
    due: string
    taskMin: number
    goalMin: number
    anAt: string
    anDur: number
    bed: string
    wake: string
    wkFrom: string
    wkTo: string
    scFrom: string
    scTo: string
  }
  /** Lundi d'abord : 1 = coché. */
  days: { an: number[]; wk: number[]; sc: number[] }
  fixed: Fixe[]
  locked: boolean
}

export function etatInitial(prenom: string, dans14: string): EtatIntro {
  return {
    name: prenom,
    prios: [],
    freq: null,
    chk3: false,
    things: [],
    det: {},
    stops: [],
    picks: null,
    chosen: null,
    type: {},
    w: {
      due: dans14,
      taskMin: 30 * 60,
      goalMin: 8 * 60,
      anAt: '18:30',
      anDur: 120,
      bed: '23:30',
      wake: '07:30',
      wkFrom: '09:00',
      wkTo: '17:30',
      scFrom: '09:00',
      scTo: '17:30',
    },
    days: { an: [1, 1, 0, 1, 0, 1, 0], wk: [1, 1, 1, 1, 1, 0, 0], sc: [1, 1, 1, 1, 1, 0, 0] },
    fixed: [],
    locked: false,
  }
}

export const frequence = (e: EtatIntro) => FREQ[e.freq ?? 0]!
/** Les choses retenues, dans l'ordre du catalogue. */
export const choses = (e: EtatIntro) => ORDER.filter((x) => e.things.includes(x))
export const priorites = (e: EtatIntro) => PRIOS.map((x) => x[0]).filter((x) => e.prios.includes(x))
export const mesures = (e: EtatIntro, maintenant: Date) =>
  choses(e).map((id) => mesurer(id, e.det[id] ?? {}, maintenant))

export function plusLourde(e: EtatIntro, maintenant: Date) {
  const ms = mesures(e, maintenant)
  let b = ms[0]?.id ?? ''
  let bl = -1
  for (const m of ms)
    if (m.lost > bl) {
      bl = m.lost
      b = m.id
    }
  return b
}
export const retenues = (e: EtatIntro) => {
  const ids = choses(e)
  return e.picks ? ids.filter((x) => e.picks!.includes(x)) : ids
}
/** Celle qui passe par les réglages : la choisie, sinon la plus lourde. */
export function choisie(e: EtatIntro, maintenant: Date) {
  const ids = choses(e)
  const c = e.chosen
  if (c && ids.includes(c) && (!e.picks || e.picks.includes(c))) return c
  const q = retenues(e)
  if (e.picks && q.length) return q[0]!
  return plusLourde(e, maintenant)
}
export const natureDe = (e: EtatIntro, id: string): Nature => e.type[id] ?? ITEM[id]!.fit

export function parcours(e: EtatIntro, maintenant: Date): Etape[] {
  const f: Etape[] = [{ k: '1' }, { k: '1b' }, { k: '2' }, { k: '3' }, { k: '4' }]
  choses(e).forEach((id, t) => {
    f.push({ k: '5a', t })
    f.push({ k: ITEM[id]!.kind === 'once' ? '5b' : '5g', t })
    f.push({ k: '5c', t })
  })
  f.push({ k: '6' }, { k: '7' }, { k: '8' }, { k: '9' }, { k: '10' }, { k: '11' }, { k: '12a' })
  if (e.things.length && natureDe(e, choisie(e, maintenant)) !== 'GOAL') f.push({ k: '12b' })
  f.push({ k: '13' }, { k: '14' }, { k: '15' }, { k: '16' }, { k: '17' })
  return f
}
export const indexDe = (f: Etape[], st: Etape) => f.findIndex((x) => x.k === st.k && (x.t ?? 0) === (st.t ?? 0))

const enMinutes = (h: string) => {
  const [a, b] = h.split(':').map(Number)
  return (a ?? 0) * 60 + (b ?? 0)
}
export { enMinutes }
export const nuitMinutes = (e: EtatIntro) => (((enMinutes(e.w.wake) - enMinutes(e.w.bed)) % 1440) + 1440) % 1440
export const nuitValide = (e: EtatIntro) => {
  const n = nuitMinutes(e)
  return n >= 360 && n <= 600
}

/** Les réglages par défaut de la choisie, tirés de ce qu'elle demande vraiment (écran 11 → 12). */
export function reglagesPour(e: EtatIntro, id: string, maintenant: Date): Pick<EtatIntro, 'w' | 'days'> {
  const it = ITEM[id]!
  const m = mesurer(id, e.det[id] ?? {}, maintenant)
  const nd = besoin(id, e.det[id] ?? {})
  const tot = nd.per * nd.dur
  const w = { ...e.w }
  w.goalMin = Math.min(100 * 60, Math.round(tot / 15) * 15)
  w.anDur = Math.min(8 * 60, Math.round(nd.dur / 15) * 15)
  if (it.kind === 'once') w.taskMin = Math.min(150, Math.max(1, Math.round(m.rem || 0))) * 60
  const an = [0, 0, 0, 0, 0, 0, 0]
  ;[0, 1, 3, 5, 2, 4, 6].slice(0, Math.min(7, nd.per)).forEach((d) => (an[d] = 1))
  return { w, days: { ...e.days, an } }
}

/** Ce que chaque écran reçoit. */
export type Ctx = {
  e: EtatIntro
  maj: (f: (e: EtatIntro) => Partial<EtatIntro>) => void
  suivant: () => void
  aller: (st: Etape) => void
  etape: Etape
  reduit: boolean
  /** Haut du contenu (sous la barre de progression) et marge basse des boutons. */
  haut: number
  bas: number
  /** L'accent de l'heure, et sa version texte. */
  acc: string
  ink: string
  maintenant: Date
}

// ——— Vers le vrai moteur ———

const versGetDay = (lundiDabord: number[]) =>
  lundiDabord.map((on, i) => (on ? (i + 1) % 7 : -1)).filter((d) => d >= 0)

/**
 * Les réponses deviennent de vrais engagements : la choisie avec ses réglages,
 * les autres retenues avec leur meilleure nature et ce qu'elles demandent.
 */
export function brouillonsDepuis(
  e: EtatIntro,
  maintenant: Date,
  dateDans: (jours: number) => string,
): { b: BrouillonIntroduction; autres: EngagementIntroduction[] } {
  const ch = choisie(e, maintenant)
  const nature = natureDe(e, ch)
  const base = `intro-${maintenant.getTime().toString(36)}`
  const activites: Activite[] = e.fixed.includes('Nothing fixed')
    ? ['none']
    : [
        ...(e.fixed.includes('Work') ? (['work'] as const) : []),
        ...(e.fixed.includes('School') ? (['school'] as const) : []),
        ...(e.fixed.includes('My days change') ? (['variable'] as const) : []),
      ]
  const b: BrouillonIntroduction = {
    id: `${base}-${ch}`,
    nature: VERS_NATURE[nature],
    nom: ITEM[ch]!.name,
    echeance: e.w.due,
    minutes: nature === 'TASK' ? e.w.taskMin : nature === 'ANCHOR' ? e.w.anDur : 60,
    heuresHebdo: e.w.goalMin / 60,
    heureAncre: e.w.anAt,
    joursAncre: versGetDay(e.days.an),
    coucher: e.w.bed,
    lever: e.w.wake,
    activites,
    fixes: {
      work: { debut: e.w.wkFrom, fin: e.w.wkTo, jours: versGetDay(e.days.wk) },
      school: { debut: e.w.scFrom, fin: e.w.scTo, jours: versGetDay(e.days.sc) },
    },
  }
  // L'heure « naturelle » d'une ancre placée par Vethos : après la fin des heures
  // fixes, plus tôt s'il a dit être trop fatigué le soir.
  const fatigue = e.stops.includes(1)
  const finFixe = Math.max(
    0,
    ...(activites.includes('work') ? [enMinutes(e.w.wkTo)] : []),
    ...(activites.includes('school') ? [enMinutes(e.w.scTo)] : []),
  )
  const depart = Math.ceil((finFixe ? finFixe + (fatigue ? 60 : 120) : fatigue ? 17 * 60 : 18 * 60 + 30) / 15) * 15
  const hh = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const autres: EngagementIntroduction[] = retenues(e)
    .filter((id) => id !== ch)
    .map((id) => {
      const it = ITEM[id]!
      const n = natureDe(e, id)
      const nd = besoin(id, e.det[id] ?? {})
      const m = mesurer(id, e.det[id] ?? {}, maintenant)
      const du = Math.max(15, Math.round(Math.min(nd.dur, 180) / 15) * 15)
      const jours = [0, 2, 4, 1, 3, 5, 6].slice(0, Math.min(7, nd.per))
      return {
        id: `${base}-${id}`,
        nature: VERS_NATURE[n],
        nom: it.name,
        echeance: dateDans(28),
        minutes:
          n === 'TASK'
            ? Math.min(150 * 60, Math.max(60, Math.round((m.rem || 10) * 60)))
            : du,
        heuresHebdo: Math.max(0.25, (nd.per * nd.dur) / 60),
        heureAncre: hh(Math.min(depart, 1440 - du)),
        joursAncre: jours.map((d) => (d + 1) % 7),
      }
    })
  return { b, autres }
}
