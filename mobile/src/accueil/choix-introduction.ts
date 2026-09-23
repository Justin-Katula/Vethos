/**
 * Ce que l'utilisateur peut dire qu'il repousse — et tout ce que le récit en
 * déduit. Rien n'est saisi au clavier : chaque choix porte sa grammaire, sa
 * nature (Task / Goal / Anchor) et SA façon réelle d'être perdue.
 *
 * Deux familles, parce qu'on ne perd pas la même chose :
 * - `unique` : une chose qui se fait une fois (lancer, finir). On compte les
 *   soirs repoussés, chacun d'une vraie durée de séance.
 * - `repetee` : une chose qui revient (sport, lecture). On compte l'écart
 *   entre ce qu'elle demande vraiment et ce qu'il fait.
 *
 * Les bases (4 séances de salle par semaine, 2 h avec le trajet…) sont
 * volontairement du côté haut du réaliste — assez pour frapper, jamais assez
 * pour qu'il refasse le calcul et le trouve faux. Elles sont écrites en clair
 * à l'écran, dans le calcul.
 */
import type { NatureIntroduction } from './modele-introduction'

export type Priorite = 'School' | 'Work' | 'A project' | 'Health' | 'Discipline' | 'Creativity'

export const PRIORITES: { nom: Priorite; detail: string }[] = [
  { nom: 'School', detail: 'Make room to learn.' },
  { nom: 'Work', detail: 'Finish what matters.' },
  { nom: 'A project', detail: 'Bring an idea to life.' },
  { nom: 'Health', detail: 'Show up for yourself.' },
  { nom: 'Discipline', detail: 'Do what you said.' },
  { nom: 'Creativity', detail: 'Make something of your own.' },
]

type Commun = {
  id: string
  priorite: Priorite
  /** Ce qu'on lit sur le bouton. */
  bouton: string
  /** « Since when have you been meaning to … ? » */
  verbe: string
  /** Le nom de l'engagement créé dans l'app. */
  engagement: string
  nature: NatureIntroduction
  /** Durée réelle d'une séance, en minutes (trajet, préparation compris). */
  seance: number
}
export type ChoseUnique = Commun & {
  famille: 'unique'
  /** « … already 7.5 h into their launch. » */
  objet: string
}
export type ChoseRepetee = Commun & {
  famille: 'repetee'
  /** Ce qu'elle demande vraiment, par semaine. */
  cible: number
  /** Le nom d'une séance au pluriel (« workouts »). */
  seances: string
  /** La base, dite en clair dans le calcul. */
  realite: string
  /** Ce que la perte représente, pour CETTE chose. */
  equivalence: (heures: number, seancesManquees: number) => string
}
export type ChoseRepoussee = ChoseUnique | ChoseRepetee

const arrondi = (n: number) => Math.max(1, Math.round(n))

export const CHOSES: ChoseRepoussee[] = [
  // School
  {
    id: 'examens', priorite: 'School', bouton: 'Studying for my exams', verbe: 'study for your exams',
    engagement: 'Study for my exams', nature: 'objectif', famille: 'repetee', seance: 120, cible: 5,
    seances: 'study sessions', realite: 'Exams ask for about 5 real study blocks a week, 2 h each.',
    equivalence: (h) => `That’s ${arrondi(h / 8)} full days of revision you’ll try to fit into the last week.`,
  },
  {
    id: 'devoir', priorite: 'School', bouton: 'An assignment I haven’t started', verbe: 'start that assignment',
    engagement: 'Finish my assignment', nature: 'tache', famille: 'unique', seance: 120,
    objet: 'into the same assignment',
  },
  {
    id: 'notes', priorite: 'School', bouton: 'Reviewing my notes', verbe: 'review your notes',
    engagement: 'Review my notes', nature: 'ancre', famille: 'repetee', seance: 40, cible: 5,
    seances: 'reviews', realite: 'Classes stick with about 5 short reviews a week, 40 min each.',
    equivalence: (h, m) => `${m} classes you’ll have to relearn from zero.`,
  },
  // Work
  {
    id: 'rapport', priorite: 'Work', bouton: 'A report I keep delaying', verbe: 'finish that report',
    engagement: 'Finish the report', nature: 'tache', famille: 'unique', seance: 120,
    objet: 'into the same report',
  },
  {
    id: 'fond', priorite: 'Work', bouton: 'Deep work on what matters', verbe: 'do real deep work',
    engagement: 'Deep work', nature: 'objectif', famille: 'repetee', seance: 120, cible: 5,
    seances: 'deep-work blocks', realite: 'Real progress takes about 5 focused blocks a week, 2 h each.',
    equivalence: (h) => `That’s ${arrondi(h / 40)} full work weeks of focus, spent on everything else.`,
  },
  {
    id: 'competence', priorite: 'Work', bouton: 'Learning a skill for my career', verbe: 'learn that skill',
    engagement: 'Learn a new skill', nature: 'objectif', famille: 'repetee', seance: 90, cible: 3,
    seances: 'lessons', realite: 'A new skill takes about 3 sessions a week, 1 h 30 each.',
    equivalence: (h) => `Enough for ${arrondi(h / 25)} complete online courses.`,
  },
  // A project
  {
    id: 'lancer', priorite: 'A project', bouton: 'Launching it', verbe: 'launch your project',
    engagement: 'Launch my project', nature: 'tache', famille: 'unique', seance: 150,
    objet: 'into their launch',
  },
  {
    id: 'version', priorite: 'A project', bouton: 'Building the first version', verbe: 'build the first version',
    engagement: 'Build the first version', nature: 'tache', famille: 'unique', seance: 150,
    objet: 'into their first version',
  },
  {
    id: 'avancer', priorite: 'A project', bouton: 'Working on it every week', verbe: 'work on your project',
    engagement: 'Work on my project', nature: 'objectif', famille: 'repetee', seance: 120, cible: 4,
    seances: 'work sessions', realite: 'A project moves with about 4 evenings a week, 2 h each.',
    equivalence: (h) => `That’s ${arrondi(h / 8)} full days of building, never built.`,
  },
  // Health
  {
    id: 'salle', priorite: 'Health', bouton: 'Going to the gym', verbe: 'go to the gym',
    engagement: 'Go to the gym', nature: 'ancre', famille: 'repetee', seance: 120, cible: 4,
    seances: 'workouts',
    realite: 'Real training is about 4 sessions a week — 2 h each, with getting there and changing.',
    equivalence: (h, m) => `${m} workouts. That’s ${arrondi(h / 24)} full days of training, gone.`,
  },
  {
    id: 'course', priorite: 'Health', bouton: 'Going for a run', verbe: 'start running',
    engagement: 'Go for a run', nature: 'ancre', famille: 'repetee', seance: 60, cible: 3,
    seances: 'runs', realite: 'A runner goes out about 3 times a week, 1 h with the warm-up and shower.',
    // ~7 km par sortie de 45 min courues.
    equivalence: (h, m) => `About ${arrondi(m * 7)} km you never ran.`,
  },
  {
    id: 'cuisine', priorite: 'Health', bouton: 'Cooking real meals', verbe: 'cook real meals',
    engagement: 'Cook a real meal', nature: 'ancre', famille: 'repetee', seance: 75, cible: 5,
    seances: 'real meals', realite: 'Eating well is about 5 home-cooked dinners a week, 1 h 15 with shopping.',
    equivalence: (h, m) => `${m} dinners that came out of a box instead.`,
  },
  // Discipline
  {
    id: 'lecture', priorite: 'Discipline', bouton: 'Reading every day', verbe: 'read every day',
    engagement: 'Read', nature: 'ancre', famille: 'repetee', seance: 30, cible: 7,
    seances: 'reading sessions', realite: 'Reading every day means 7 sessions a week, 30 min each.',
    // ~8 h de lecture pour un livre.
    equivalence: (h) => `About ${arrondi(h / 8)} books you never opened.`,
  },
  {
    id: 'langue', priorite: 'Discipline', bouton: 'Learning a language', verbe: 'learn that language',
    engagement: 'Learn a language', nature: 'objectif', famille: 'repetee', seance: 45, cible: 5,
    seances: 'lessons', realite: 'A language grows with about 5 lessons a week, 45 min each.',
    equivalence: (h) => `${arrondi(h)} hours of a language you still can’t speak.`,
  },
  {
    id: 'mediter', priorite: 'Discipline', bouton: 'Meditating', verbe: 'meditate',
    engagement: 'Meditate', nature: 'ancre', famille: 'repetee', seance: 20, cible: 7,
    seances: 'moments of calm', realite: 'A calm mind asks for 20 min, every day.',
    equivalence: (h, m) => `${m} quiet mornings you never gave yourself.`,
  },
  // Creativity
  {
    id: 'ecrire', priorite: 'Creativity', bouton: 'Writing', verbe: 'write',
    engagement: 'Write', nature: 'objectif', famille: 'repetee', seance: 60, cible: 5,
    seances: 'writing sessions', realite: 'Writers write about 5 times a week, 1 h each.',
    // ~500 mots par heure d'écriture.
    equivalence: (h) => `About ${arrondi((h * 500) / 1000)} thousand words — a short book — never written.`,
  },
  {
    id: 'instrument', priorite: 'Creativity', bouton: 'Practicing my instrument', verbe: 'practice your instrument',
    engagement: 'Practice my instrument', nature: 'ancre', famille: 'repetee', seance: 45, cible: 5,
    seances: 'practice sessions', realite: 'An instrument asks for about 5 sessions a week, 45 min each.',
    equivalence: (h) => `${arrondi(h)} hours your hands never learned.`,
  },
  {
    id: 'creation', priorite: 'Creativity', bouton: 'Finishing a piece I started', verbe: 'finish that piece',
    engagement: 'Finish my piece', nature: 'tache', famille: 'unique', seance: 120,
    objet: 'into the same piece',
  },
]

export const chosesPour = (priorites: Priorite[]) => CHOSES.filter((c) => priorites.includes(c.priorite))

export const formatHeures = (h: number) => {
  if (h < 1) return `${Math.round(h * 60)} min`
  const entier = Math.floor(h)
  const min = Math.round((h - entier) * 60)
  return min ? `${entier} h ${String(min).padStart(2, '0')}` : `${entier} h`
}

// ——— Les questions ———

export type Option = { libelle: string; valeur: number }

/** Combien de soirs par semaine il se dit « demain ». */
export const FREQUENCES: Option[] = [
  { libelle: 'Almost every evening', valeur: 5 },
  { libelle: 'A few evenings a week', valeur: 3 },
  { libelle: 'About once a week', valeur: 1 },
  { libelle: 'Rarely', valeur: 0.5 },
]
export const phraseFrequence = (f: number) =>
  f >= 5 ? 'almost every evening' : f >= 3 ? 'a few evenings a week' : f >= 1 ? 'about once a week' : 'rarely'

/**
 * Ce que sa réponse change, tout de suite : la façon dont l'écran suivant lui
 * parle. Il doit sentir qu'on a entendu.
 */
export function echoFrequence(f: number) {
  if (f >= 5)
    return {
      accuse: 'Almost every evening. That’s a lot waiting for you.',
      titre: 'So what keeps getting pushed?',
      detail: (verbe: string) => `Almost every evening, this is what waits. Since when have you been meaning to ${verbe}?`,
      frappe: 'You say it almost every evening.',
    }
  if (f >= 3)
    return {
      accuse: 'A few evenings a week. It adds up faster than it feels.',
      titre: 'What gets pushed on those evenings?',
      detail: (verbe: string) => `Since when have you been meaning to ${verbe}?`,
      frappe: 'You say it a few evenings a week.',
    }
  if (f >= 1)
    return {
      accuse: 'About once a week. Small — until you count it.',
      titre: 'What gets pushed, that one evening?',
      detail: (verbe: string) => `Since when have you been meaning to ${verbe}?`,
      frappe: 'You say it about once a week.',
    }
  return {
    accuse: 'Rarely. Then let’s check what “rarely” costs.',
    titre: 'When it does happen, what gets pushed?',
    detail: (verbe: string) => `Since when have you been meaning to ${verbe}?`,
    frappe: 'You said “rarely”.',
  }
}

/** Depuis combien de semaines il se le dit. */
export const DEPUIS: Option[] = [
  { libelle: 'About a month', valeur: 4 },
  { libelle: 'About 3 months', valeur: 13 },
  { libelle: 'About 6 months', valeur: 26 },
  { libelle: 'A year or more', valeur: 52 },
]
/** Une chose unique : combien d'heures de travail elle demande vraiment. */
export const TRAVAIL: Option[] = [
  { libelle: 'About 10 hours', valeur: 10 },
  { libelle: 'About 30 hours', valeur: 30 },
  { libelle: 'About 80 hours', valeur: 80 },
  { libelle: '150 hours or more', valeur: 150 },
]
/** Une chose unique : combien d'heures par semaine il y met VRAIMENT. */
export const RYTHME_UNIQUE: Option[] = [
  { libelle: 'None, honestly', valeur: 0 },
  { libelle: 'About 1 hour', valeur: 1 },
  { libelle: 'About 3 hours', valeur: 3 },
  { libelle: '6 hours or more', valeur: 6 },
]
/** Une chose répétée : combien de fois par semaine il la fait VRAIMENT. */
export const RYTHME_REPETE: Option[] = [
  { libelle: 'Never', valeur: 0 },
  { libelle: 'Once a week', valeur: 1 },
  { libelle: '2–3 times a week', valeur: 2.5 },
  { libelle: 'Almost every day', valeur: 6 },
]
const phraseRythme = (a: number) =>
  a <= 0 ? 'never' : a < 2 ? 'about once a week' : a < 4 ? '2 or 3 times a week' : 'almost every day'

export type Reponses = { depuis?: number; travail?: number; rythme?: number }

export const reponsesCompletes = (c: ChoseRepoussee, r: Reponses | undefined) =>
  !!r && r.depuis !== undefined && r.rythme !== undefined && (c.famille === 'repetee' || r.travail !== undefined)

// ——— Le calcul ———

const jourLisible = (d: Date) =>
  d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
const plusSemaines = (depuis: Date, semaines: number) => {
  const d = new Date(depuis)
  d.setDate(d.getDate() + Math.round(semaines * 7))
  return d
}
const nombre = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export type Bilan = {
  chose: ChoseRepoussee
  /** Les étapes du calcul, dans l'ordre où l'écran les pose. */
  lignes: string[]
  heuresPerdues: number
  /** Ce qui aurait déjà dû arriver. */
  passe: string
  /** Où son rythme actuel le mène. */
  futur: string
  /** Combien de fois il s'est dit « demain » pour cette chose. */
  demains: number
  /** Soirs perdus par semaine, au rythme actuel : ce que le calendrier allume. */
  parSemaine: number
  /** Chose unique : le jour où elle sera finie à son rythme (null = jamais). */
  fin: Date | null
}

/**
 * Le piège. On ne lui dit pas « tu procrastines » : on pose SES réponses
 * côte à côte, étape par étape, et on le laisse lire.
 */
export function bilan(c: ChoseRepoussee, frequence: number, r: Reponses, maintenant = new Date()): Bilan {
  const S = r.depuis ?? 4
  const seanceH = c.seance / 60
  const A = r.rythme ?? 0
  if (c.famille === 'unique') {
    const F = Math.max(0.5, frequence)
    const parSemaine = F * seanceH
    const heuresPerdues = Math.round(parSemaine * S)
    const H = r.travail ?? 30
    const finPossible = plusSemaines(plusSemaines(maintenant, -S), H / parSemaine)
    const fois = Math.floor(heuresPerdues / H)
    const soirs =
      F < 1 ? 'about one evening every two weeks' : F === 1 ? 'one evening a week' : `about ${F} evenings a week`
    const lignes = [
      `You push it ${phraseFrequence(frequence)} — ${soirs}.`,
      `One real evening on it is about ${formatHeures(seanceH)}.`,
      `That’s ${formatHeures(parSemaine)} a week that never went to it.`,
      `× ${S} weeks since you decided = ${heuresPerdues} h.`,
      `It needs about ${H} h.`,
    ]
    const passe =
      finPossible <= maintenant
        ? fois >= 2
          ? `It could have been done by ${jourLisible(finPossible)}. ${fois} times over.`
          : `It could have been done by ${jourLisible(finPossible)}.`
        : `With just those evenings, it would be done by ${jourLisible(finPossible)}.`
    const reste = Math.max(H * 0.25, H - A * S)
    const fin = A <= 0 ? null : plusSemaines(maintenant, reste / A)
    const futur = fin ? `At your current pace: ${jourLisible(fin)}.` : 'At your current pace: never.'
    return { chose: c, lignes, heuresPerdues, passe, futur, demains: Math.round(F * S), parSemaine: F, fin }
  }
  const manqueesSemaine = Math.max(0, c.cible - A)
  const manquees = Math.round(manqueesSemaine * S)
  const heuresPerdues = Math.round(manquees * seanceH)
  const lignes = [
    c.realite,
    A <= 0 ? 'You never do it.' : `You do it ${phraseRythme(A)}.`,
    `${nombre(manqueesSemaine)} missed a week × ${S} weeks = ${manquees} ${c.seances}.`,
    `× ${formatHeures(seanceH)} = ${heuresPerdues} h.`,
  ]
  // Il a dit « rarement » ; sa propre réponse dit le contraire. On le lui montre.
  if (frequence <= 1 && manqueesSemaine >= 2)
    lignes.push(`You said you ${frequence < 1 ? 'rarely' : 'only sometimes'} push things. This one says otherwise.`)
  const passe = c.equivalence(heuresPerdues, manquees)
  const futur =
    manqueesSemaine <= 0
      ? 'You’re already doing what it asks. Vethos will keep it that way.'
      : `At your current pace: ${Math.round(A * 52)} this year, instead of ${c.cible * 52}.`
  return { chose: c, lignes, heuresPerdues, passe, futur, demains: manquees, parSemaine: manqueesSemaine, fin: null }
}

/** Ce que toutes ses heures perdues, ensemble, représentent. */
export function equivalenceTotale(heures: number) {
  const jours = heures / 24
  if (jours >= 14)
    return `That’s ${Math.round(jours)} full days of your life — ${Math.round(jours / 7)} weeks, awake and asleep.`
  if (jours >= 1) return `That’s ${Math.round(jours * 10) / 10} full days of your life.`
  return `That’s ${Math.round((heures / 8) * 10) / 10} full working days.`
}
