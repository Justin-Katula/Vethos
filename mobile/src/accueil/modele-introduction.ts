import type { Ancre, Contenu, Objectif, Obligation, Tache } from '@/donnees/magasin'
import { preparerTache } from '@/donnees/creation'
import { calculerPlan, cleDate } from '@/plan/moteur'
import { lireSemaine } from '@/plan/lecture'
import { maxTaskMinutesPerDay, findAncreConflict } from '@shared/planning/placement'
import { allouerCouleurAncre, allouerCouleurObjectif, allouerCouleurTache } from '@shared/palettes'

export type NatureIntroduction = 'tache' | 'objectif' | 'ancre'

/** Ordre des écrans réels de chaque partie ; sert à calculer une seule progression continue sur les deux. */
export const ETAPES_INTRODUCTION = [
  'nom',
  'priorite',
  'frequence',
  'differe',
  'detail',
  'calcul',
  'pensee',
  'activation',
] as const
export const ETAPES_SUITE = [
  'choix',
  'parametre',
  'protection',
  'sommeil',
  'activite',
  'construction',
  'jour',
] as const
export const TOTAL_ETAPES_INTRODUCTION = ETAPES_INTRODUCTION.length + ETAPES_SUITE.length

export type BrouillonIntroduction = {
  id: string
  nature: NatureIntroduction
  nom: string
  echeance: string
  minutes: number
  heuresHebdo: number
  heureAncre: string
  joursAncre: number[]
  coucher: string
  lever: string
  /** Work et School peuvent coexister ; « none » est toujours seul. */
  activites: Activite[]
  fixes: Record<ActiviteFixe, HoraireFixe>
}

export type ActiviteFixe = 'work' | 'school'
export type Activite = ActiviteFixe | 'variable' | 'none'
export type HoraireFixe = { debut: string; fin: string; jours: number[] }

/** Cocher une activité : « Nothing fixed » exclut tout le reste, et inversement. */
export function basculerActivite(actuelles: Activite[], a: Activite): Activite[] {
  if (actuelles.includes(a)) return actuelles.filter((x) => x !== a)
  if (a === 'none') return ['none']
  return [...actuelles.filter((x) => x !== 'none'), a]
}

export type AjoutsIntroduction = Pick<
  Contenu,
  'taches' | 'objectifs' | 'ancres' | 'obligations'
> & {
  coucher: string
  lever: string
}

export function minuteValide(heure: string): number | null {
  const resultat = /^(\d{1,2}):(\d{2})$/.exec(heure.trim())
  if (!resultat) return null
  const h = Number(resultat[1])
  const m = Number(resultat[2])
  return h <= 23 && m <= 59 ? h * 60 + m : null
}

export function dateDans(jours: number, maintenant = new Date()) {
  const date = new Date(maintenant)
  date.setDate(date.getDate() + jours)
  return cleDate(date)
}

export function dateValide(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const lu = new Date(`${date}T12:00:00`)
  return !Number.isNaN(lu.getTime()) && cleDate(lu) === date
}

export function creerBrouillon(
  reglages: Contenu['reglages'],
  maintenant = new Date(),
): BrouillonIntroduction {
  return {
    id: `intro-${maintenant.getTime().toString(36)}`,
    nature: 'tache',
    nom: '',
    echeance: dateDans(3, maintenant),
    minutes: 60,
    heuresHebdo: 4,
    heureAncre: '18:00',
    joursAncre: [1, 3, 5],
    coucher: reglages.coucher,
    lever: reglages.lever,
    activites: [],
    fixes: {
      work: { debut: '09:00', fin: '17:00', jours: [1, 2, 3, 4, 5] },
      school: { debut: '08:00', fin: '15:00', jours: [1, 2, 3, 4, 5] },
    },
  }
}

/** Le brouillon passe par le même moteur et la même correction que la vraie app. */
export function preparerIntroduction(
  source: Contenu,
  b: BrouillonIntroduction,
  maintenant = new Date(),
) {
  const coucher = minuteValide(b.coucher)
  const lever = minuteValide(b.lever)
  if (coucher === null || lever === null || coucher === lever)
    throw new Error('Enter two different sleep times, like 23:00 and 07:00.')
  if (!b.nom.trim()) throw new Error('Give your commitment a name.')
  const obligations: Obligation[] = []
  for (const activite of ['work', 'school'] as const) {
    if (!b.activites.includes(activite)) continue
    const h = b.fixes[activite]
    const debut = minuteValide(h.debut)
    const fin = minuteValide(h.fin)
    if (debut === null || fin === null || debut === fin || !h.jours.length)
      throw new Error('Check your fixed hours and choose at least one day.')
    // Une activité de nuit occupe deux dates civiles, comme le sommeil.
    for (const jour of h.jours) {
      const plages =
        fin > debut
          ? [[jour, debut, fin]]
          : [
              [jour, debut, 1440],
              [(jour + 1) % 7, 0, fin],
            ]
      for (const [dayOfWeek, startMinute, endMinute] of plages) {
        if (
          startMinute === endMinute ||
          source.obligations.some(
            (o) =>
              !o.date &&
              o.dayOfWeek === dayOfWeek &&
              o.startMinute === startMinute &&
              o.endMinute === endMinute &&
              o.categoryType === activite,
          )
        )
          continue
        obligations.push({
          id: `${b.id}-${activite}-${dayOfWeek}-${startMinute}`,
          dayOfWeek: dayOfWeek!,
          startMinute: startMinute!,
          endMinute: endMinute!,
          categoryType: activite,
          label: activite === 'work' ? 'Work' : 'School',
          color: '#8d8d8d',
        })
      }
    }
  }
  const reglages = { ...source.reglages, coucher: b.coucher, lever: b.lever }
  const fixes = [...source.obligations, ...obligations]
  const base = calculerPlan({ ...source, obligations: fixes, reglages, maintenant })
  const nom = b.nom.trim()
  let taches: Tache[] = []
  const objectifs: Objectif[] = []
  const ancres: Ancre[] = []
  if (b.nature === 'tache') {
    if (!dateValide(b.echeance) || b.echeance < cleDate(maintenant))
      throw new Error('Choose a deadline today or later (YYYY-MM-DD).')
    if (!Number.isInteger(b.minutes) || b.minutes < 5 || b.minutes > 10000)
      throw new Error('Estimate between 5 and 10,000 minutes.')
    let index = 0
    taches = preparerTache(
      {
        titre: nom,
        intention: nom,
        echeance: b.echeance,
        minutesEstimees: b.minutes,
        importance: 5,
        nature: 'routine',
        couleur: allouerCouleurTache(source.taches),
      },
      {
        identifiant: () => `${b.id}-task-${index++}`,
        maintenant,
        maxParJourMinutes: maxTaskMinutesPerDay(base.capacities),
      },
    )
  } else if (b.nature === 'objectif') {
    const minutes = Math.round(b.heuresHebdo * 60)
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 6000)
      throw new Error('Choose between 0.25 and 100 hours per week.')
    objectifs.push({
      id: `${b.id}-goal`,
      nom,
      intention: nom,
      couleur: allouerCouleurObjectif(source.objectifs),
      cibleHebdoMinutes: minutes,
      creeLe: maintenant.toISOString(),
    })
  } else {
    const heure = minuteValide(b.heureAncre)
    if (
      heure === null ||
      !b.joursAncre.length ||
      !Number.isInteger(b.minutes) ||
      b.minutes < 15 ||
      b.minutes > 480 ||
      heure + b.minutes > 1440
    )
      throw new Error(
        'Check the time, duration and days of your Anchor. It must finish before midnight.',
      )
    const conflit = findAncreConflict(
      { anchorMinute: heure, normalMaxMinutes: b.minutes, daysOfWeek: b.joursAncre, trigger: nom },
      source.ancres.map((a) => ({
        id: a.id,
        name: a.nom,
        plan: a.intention,
        color: a.couleur,
        trigger: a.declencheur || a.nom,
        anchorMinute: a.minuteAncrage,
        daysOfWeek: a.jours,
        normalMaxMinutes: a.dureeMinutes,
        minimumMinutes: Math.max(20, a.dureeMinutes * 0.4),
        appsToBlock: [],
        createdAt: a.creeeLe,
      })),
    )
    if (conflit) throw new Error(`This Anchor overlaps “${conflit.name}”. Change its time or days.`)
    ancres.push({
      id: `${b.id}-anchor`,
      nom,
      intention: nom,
      declencheur: nom,
      couleur: allouerCouleurAncre(source.ancres),
      minuteAncrage: heure,
      jours: b.joursAncre,
      dureeMinutes: b.minutes,
      creeeLe: maintenant.toISOString(),
    })
  }
  const ajouts: AjoutsIntroduction = {
    taches,
    objectifs,
    ancres,
    obligations,
    coucher: b.coucher,
    lever: b.lever,
  }
  const resultat = calculerPlan({
    ...source,
    reglages,
    obligations: fixes,
    taches: [...source.taches, ...taches],
    objectifs: [...source.objectifs, ...objectifs],
    ancres: [...source.ancres, ...ancres],
    maintenant,
  })
  const ids = new Set([...taches, ...objectifs, ...ancres].map((objet) => objet.id))
  return {
    ajouts,
    resultat,
    jours: lireSemaine(resultat, fixes, reglages),
    blocs: resultat.blocks.filter((bloc) => ids.has(bloc.refId)),
    ids,
  }
}
