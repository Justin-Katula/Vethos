/**
 * La projection : ce que les rythmes déclarés valent quand ils se cumulent.
 *
 * Quatre heures de piano par semaine ne veulent rien dire. Deux cent huit
 * heures sur un an, si — c'est l'équivalent d'un cursus. C'est la seule partie
 * de Vethos qui regarde loin ; tout le reste travaille sur sept jours.
 *
 * Le texte vit ici, partagé, et pas dans un écran : c'est de la substance,
 * pas de la décoration. Recopié dans la deuxième application, il aurait
 * derivé au premier mot retouché — et deux Vethos qui ne promettent pas la
 * même chose à la même heure de pratique sont deux produits.
 *
 * Aucune de ces phrases n'est un jugement (F). « Autonomie & aisance » décrit
 * ce que deux cents heures produisent chez n'importe qui ; elle ne dit rien
 * de la personne qui les fait, et surtout rien de celle qui ne les fait pas.
 */

export type Horizon = 'month' | 'year'

/** Semaines dans l'horizon. Un mois vaut quatre semaines, pas 30,4 jours. */
export const HORIZON_WEEKS: Record<Horizon, number> = { month: 4, year: 52 }

export const HORIZON_LABEL: Record<Horizon, string> = {
  month: 'over 1 month (4 weeks)',
  year: 'over 1 year (52 weeks)',
}

/**
 * « 4 h », « 4.5 h ». Une décimale au plus — deux ne se lisent pas.
 *
 * Le point, pas la virgule. C'est le séparateur décimal de la langue dans
 * laquelle l'application est écrite ; « 3,8 h » au milieu d'une phrase
 * anglaise se lit comme une coquille, exactement comme « 3.8 h » se lisait
 * ainsi en français.
 */
export function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  if (rounded === Math.floor(rounded)) return `${Math.floor(rounded)} h`
  return `${rounded} h`
}

export type Milestone = { title: string; desc: string }

/**
 * Ce qu'un volume annuel produit, par paliers.
 *
 * Les seuils sont grossiers à dessein : personne ne franchit « la barre des
 * 250 h » un mardi. Ils donnent une échelle, pas un classement.
 */
export function objectiveMilestone(yearlyHours: number): Milestone {
  if (yearlyHours < 40) {
    return {
      title: 'Getting started',
      desc: 'Enough to pick up the fundamentals and let curiosity settle in.',
    }
  }
  if (yearlyHours < 100) {
    return {
      title: 'Solid foundations',
      desc: 'Regular practice, long enough for the reflexes to become automatic.',
    }
  }
  if (yearlyHours < 250) {
    return {
      title: 'Fluency',
      desc: 'The level where you practise for pleasure without stalling on technique.',
    }
  }
  if (yearlyHours < 500) {
    return {
      title: 'Proven expertise',
      desc: 'The equivalent of several university courses, or one major project seen through.',
    }
  }
  return {
    title: 'High mastery',
    desc: 'An exceptional investment that puts your skill at the top of the field.',
  }
}

/**
 * Ce qu'une ancre devient sur un an, dans ses propres termes.
 *
 * La reconnaissance se fait sur le NOM que l'utilisateur a écrit, pas sur une
 * catégorie qu'on lui aurait fait choisir : personne ne range « Course du
 * matin » dans une liste déroulante avant de la créer. Sans correspondance, la
 * phrase générique dit la même chose en heures — jamais « catégorie inconnue ».
 */
export function anchorInsight(name: string, yearlyHours: number): string {
  const lower = sansAccents(name)

  if (lower.includes('lect') || lower.includes('livre') || lower.includes('read')) {
    const books = Math.max(1, Math.round(yearlyHours / 8))
    const s = books > 1 ? 's' : ''
    return `Around ${books} whole book${s} read over the year (on a 250-page book every 8 h).`
  }

  if (
    lower.includes('sport') ||
    lower.includes('muscu') ||
    lower.includes('gym') ||
    lower.includes('course') ||
    lower.includes('run') ||
    lower.includes('yoga') ||
    lower.includes('fitness')
  ) {
    return `A major physical and cardiovascular change, built on ${Math.round(yearlyHours)} h of steady training.`
  }

  if (lower.includes('medit') || lower.includes('zen') || lower.includes('respir')) {
    return 'Hundreds of sessions of deep calm, forging emotional steadiness and unshakeable focus.'
  }

  return `${Math.round(yearlyHours)} hours of immovable ritual: the daily discipline that turns a routine into a strength.`
}

/**
 * Minuscules, accents retirés.
 *
 * Sans ça, « Méditation » — l'orthographe française, celle que tout le monde
 * écrit — ne correspondait à aucun mot-clé : le test cherchait `medit` dans
 * `méditation`. L'ancre recevait la phrase générique, personne ne s'en
 * apercevait, et le seul cas qui ne marchait pas était le cas normal.
 *
 * La table est explicite plutôt que `normalize('NFD')` : la normalisation
 * Unicode dépend de l'ICU embarqué dans le moteur, et celui du téléphone
 * n'est pas celui de l'ordinateur. Une correspondance de mots-clés ne doit
 * pas dépendre de la plateforme.
 */
function sansAccents(texte: string): string {
  const table: Record<string, string> = {
    à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
    ç: 'c',
    è: 'e', é: 'e', ê: 'e', ë: 'e',
    ì: 'i', í: 'i', î: 'i', ï: 'i',
    ñ: 'n',
    ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
    ù: 'u', ú: 'u', û: 'u', ü: 'u',
    ý: 'y', ÿ: 'y',
    œ: 'oe', æ: 'ae',
  }
  return texte
    .toLowerCase()
    .replace(/[àâäáãåçèéêëìíîïñòóôöõùúûüýÿœæ]/g, (c) => table[c] ?? c)
}
