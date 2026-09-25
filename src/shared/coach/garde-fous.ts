// ═══ COACH — GARDE-FOUS ══════════════════════════════════════════════════
//
// Spec moteur 2026-09-25. L'IA parle, le moteur décide. Les modèles de
// langage ont tendance à donner raison à l'utilisateur : un utilisateur qui
// négocie finirait par gagner si l'IA avait le pouvoir d'accorder. Tout ce
// qui sort du modèle passe donc par ici AVANT d'être montré, sur le serveur
// comme sur l'appareil.

/**
 * Détresse ou idées noires : le Coach sort du mode discipline et oriente vers
 * une aide humaine. Un faux positif coûte une phrase de soutien de trop ; un
 * faux négatif peut coûter bien plus — la liste est volontairement large.
 */
const DETRESSE = [
  /\b(suicid\w*|kill (my|him|her)self|end (it|my life)|want to die|wanna die|don'?t want to (live|be here)|no reason to live|self[- ]?harm|cut(ting)? myself|hurt myself)\b/i,
  /\b(hopeless|worthless|can'?t go on|better off (dead|without me))\b/i,
  /(?<!\p{L})(me suicider|me tuer|en finir|mourir|plus envie de vivre|me faire du mal|me mutiler|sans espoir|je ne vaux rien|je sers à rien)(?!\p{L})/iu,
]

export function detecteDetresse(texte: string): boolean {
  return DETRESSE.some((r) => r.test(texte))
}

/** Ce que le Coach dit quand il sort du mode discipline. Jamais un reproche, jamais un bloc. */
export const MESSAGE_AIDE =
  'Let’s pause the plan — you matter more than any block. If you might be in danger, call your local emergency number now. ' +
  'In the US or Canada you can call or text 988; in France, call 3114. Talking to someone you trust helps too.'

/** Formes interdites dans tous les modes : humilier, insulter, culpabiliser, menacer, comparer. */
const INTERDITS = [
  /\b(lazy|pathetic|loser|stupid|idiot|useless|worthless|disappointing|shame on you|you always fail|you never)\b/i,
  /\b(or else|you'?ll regret|i'?ll punish|punishment)\b/i,
  /\b(everyone else|other people manage|others can)\b/i,
  /(?<!\p{L})(paresseux|nul|minable|idiot|honte|tu rates toujours)(?!\p{L})/iu,
]

/** Le Coach n'accorde rien : toute concession sort d'ici, remplacée par le renvoi au moteur. */
const CONCESSIONS = [
  /\b(i('| a)?ll (let|allow) you|you can skip|skip (it|this|today)|take the (day|rest of the day) off|i('| wi)ll (move|cancel|remove) (it|the block)|i('| ha)ve (moved|cancelled|removed))\b/i,
  /\b(granted|approved|it'?s fine to stop)\b/i,
]

export type Verdict = { texte: string; remplace: boolean }

/**
 * Filtre une réponse du modèle :
 * - détresse dans la réponse → message d'aide ;
 * - une forme interdite ou une concession → on ne montre rien de ce texte
 *   (null) : l'appelant retombe sur la phrase du moteur ;
 * - plus d'une question → coupée après la première ;
 * - bornée en longueur.
 */
export function filtrerReponse(brut: string): Verdict | null {
  const t = brut.replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (detecteDetresse(t)) return { texte: MESSAGE_AIDE, remplace: true }
  if (INTERDITS.some((r) => r.test(t)) || CONCESSIONS.some((r) => r.test(t))) return null
  const premiere = t.indexOf('?')
  const coupe = premiere >= 0 ? t.slice(0, premiere + 1) : t
  return { texte: coupe.length > 600 ? `${coupe.slice(0, 597).trimEnd()}…` : coupe, remplace: false }
}

/** La clé du journal où l'on note une détresse détectée. */
export const SUJET_DETRESSE = 'detresse'
/** Sortie du mode discipline : 24 h sans overlay, sans refus du contrat. */
export const PAUSE_DETRESSE_MS = 24 * 60 * 60 * 1000

/** Le mode discipline est-il suspendu, parce qu'une détresse a été vue il y a moins de 24 h ? */
export function disciplineSuspendue(lastSignalAt: Record<string, string>, maintenant: Date): boolean {
  const t = lastSignalAt[SUJET_DETRESSE]
  return !!t && maintenant.getTime() - new Date(t).getTime() < PAUSE_DETRESSE_MS
}
