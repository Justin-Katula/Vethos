// ═══ COACH — GARDE-FOUS ══════════════════════════════════════════════════
//
// Spec moteur 2026-09-25. L'IA parle, le moteur décide. Les modèles de
// langage ont tendance à donner raison à l'utilisateur : un utilisateur qui
// négocie finirait par gagner si l'IA avait le pouvoir d'accorder. Tout ce
// qui sort du modèle passe donc par ici AVANT d'être montré, sur le serveur
// comme sur l'appareil. En anglais ET en français : le Coach répond dans la
// langue de l'utilisateur.

/** Bornes de mot qui connaissent les accents (\b ne les connaît pas). */
const mots = (alternatives: string) => new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'iu')

/**
 * Détresse ou idées noires : le Coach sort du mode discipline et oriente vers
 * une aide humaine. Un faux positif coûte une phrase de soutien de trop ; un
 * faux négatif peut coûter bien plus — la liste est volontairement large.
 */
const DETRESSE = [
  mots(
    "suicid\\p{L}*|kill (?:my|him|her)self|end (?:it all|my life)|want to die|wanna die|don'?t want to (?:live|be here)|no reason to live|self[- ]?harm|cut(?:ting)? myself|hurt myself|better off dead|better off without me|can'?t go on|hopeless|worthless",
  ),
  mots(
    'me suicider|me tuer|en finir|envie de mourir|veux mourir|plus envie de vivre|me faire du mal|me mutiler|sans espoir|je ne vaux rien|je sers à rien|je sers a rien|plus la force',
  ),
]

export function detecteDetresse(texte: string): boolean {
  return DETRESSE.some((r) => r.test(texte))
}

/** Ce que le Coach dit quand il sort du mode discipline. Jamais un reproche, jamais un bloc. */
export const MESSAGE_AIDE =
  'Let’s pause the plan — you matter more than any block. If you might be in danger, call your local emergency number now. ' +
  'In the US or Canada you can call or text 988; in France, call 3114. Talking to someone you trust helps too.'

/** Humilier, insulter, culpabiliser, menacer, comparer aux autres — dans tous les modes. */
const INTERDITS = [
  mots("lazy|pathetic|loser|stupid|idiot|useless|shame on you|you always fail|you never (?:finish|keep|stick)|disappoint(?:ed|ing)? (?:in|with) you|you should be ashamed"),
  mots("or else|you'?ll regret|i'?ll punish|punish(?:ment)?|you deserve (?:it|this)"),
  mots('everyone else (?:can|manages|does)|other people (?:manage|can|do)|others (?:can|manage) (?:it|to|do)|why can(?:no|’|\')t you|unlike (?:everyone|others)'),
  mots('paresseu(?:x|se)|minable|idiot|nul(?:le)? comme|honte à toi|tu devrais avoir honte|tu rates toujours|tu n’y arrives jamais|tu n\'y arrives jamais|tu me déçois|décevant'),
  mots('sinon tu|tu vas le regretter|tu le mérites|punition'),
  mots('les autres y arrivent|tout le monde y arrive|contrairement aux autres'),
]

/** Flatter : l'éloge vide, sans chiffre. */
const FLATTERIE = [
  mots("you'?re (?:amazing|incredible|a genius|perfect|the best)|so proud of you|you'?re unstoppable"),
  mots('tu es (?:génial|géniale|incroyable|parfait|parfaite|le meilleur|la meilleure|un génie)|je suis si fier'),
]

/** Le Coach n'accorde rien : toute concession sort d'ici, remplacée par la phrase du moteur. */
const CONCESSIONS = [
  mots("i(?:'| wi)ll (?:let|allow) you|you can skip|skip (?:it|this|today)|take the (?:day|rest of the day) off|i(?:'| wi)ll (?:move|cancel|remove|delete) (?:it|the block)|i(?:'| ha)ve (?:moved|cancelled|canceled|removed)|it'?s fine to stop|go ahead and stop|granted|approved"),
  mots("je t'?accorde|je t’accorde|tu peux (?:sauter|arrêter|annuler|laisser tomber)|saute(?:-le)? aujourd|prends ta journée|je (?:déplace|supprime|annule|retire) (?:le|ce) bloc|j'?ai (?:déplacé|supprimé|annulé)|c'est bon, arrête|accordé"),
]

export type Verdict = { texte: string; remplace: boolean }

/**
 * Filtre une réponse du modèle :
 * - détresse dans la réponse → message d'aide ;
 * - une forme interdite, une flatterie ou une concession → rien de ce texte
 *   n'est montré (null) : l'appelant retombe sur la phrase du moteur ;
 * - plus d'une question → coupé après la première, en gardant une ligne
 *   « PLAN: … » finale (le déclencheur de l'entretien WOOP) ;
 * - les retours à la ligne sont gardés (une partie par ligne, pour le découpage) ;
 * - borné en longueur.
 */
export function filtrerReponse(brut: string): Verdict | null {
  const lignes = brut
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
  const t = lignes.join('\n')
  if (!t) return null
  if (detecteDetresse(t)) return { texte: MESSAGE_AIDE, remplace: true }
  if ([...INTERDITS, ...FLATTERIE, ...CONCESSIONS].some((r) => r.test(t))) return null

  const plan = lignes.find((l) => /^PLAN:/i.test(l))
  const corps = lignes.filter((l) => l !== plan).join('\n')
  const premiere = corps.indexOf('?')
  const coupe = premiere >= 0 ? corps.slice(0, premiere + 1) : corps
  const final = plan ? `${coupe}\n${plan}`.trim() : coupe
  return { texte: final.length > 800 ? `${final.slice(0, 797).trimEnd()}…` : final, remplace: false }
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
