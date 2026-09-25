// ═══ COACH — CE QUE L'APP CALCULE ELLE-MÊME ═════════════════════════════
//
// Spec moteur 2026-09-25. Les chiffres de la revue, l'usure des messages et
// la lecture d'un texte d'arrêt sans réseau : tout ce qui n'a pas besoin du
// modèle reste sur l'appareil. Le modèle ne fait que dire.

import type { SessionEvent, StopReason } from '../schemas'
import { STOP_REASONS } from '../schemas'
import { addDays, startOfWeek } from '../planning/dates'
import { autonomie, tenue } from '../planning/habitudes'

// ─── Usure des messages ───────────────────────────────────────────────────

/** 72 h par sujet (F.2), allongées quand la personne devient autonome. */
export const DELAI_SUJET_MS = 72 * 60 * 60 * 1000

/**
 * Dans HeartSteps, l'effet des suggestions devenait nul vers le 28e jour. Les
 * messages sont rares, et de plus en plus rares à mesure que la personne
 * devient autonome : à autonomie 1, trois fois plus espacés.
 */
export function peutParler(args: { dernier: string | undefined; maintenant: Date; autonomie: number }): boolean {
  if (!args.dernier) return true
  const delai = DELAI_SUJET_MS * (1 + 2 * Math.max(0, Math.min(1, args.autonomie)))
  return args.maintenant.getTime() - new Date(args.dernier).getTime() >= delai
}

/** Varié : une formulation différente à chaque fois, sans hasard (le jour choisit). */
export function varier<T>(variantes: readonly T[], date: string): T {
  let h = 0
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return variantes[h % variantes.length]!
}

// ─── Revue du dimanche : 3 chiffres, 1 question, 1 ajustement ─────────────

export type Revue = {
  semaine: string
  /** Minutes réellement tenues cette semaine. */
  tenu: number
  /** Séances démarrées / séances prévues. */
  demarrees: number
  prevues: number
  /** Durée tenue en moyenne, et celle de la semaine d'avant. */
  moyenne: number
  moyenneAvant: number
  /** L'ajustement déjà décidé par le moteur, en une ligne. */
  ajustement: string
}

const moyenneTenue = (ev: SessionEvent[]) => {
  const t = ev.filter((e) => e.started && e.heldMinutes !== null)
  return t.length ? Math.round(t.reduce((s, e) => s + e.heldMinutes!, 0) / t.length) : 0
}

export function revueDimanche(args: {
  events: SessionEvent[]
  today: string
  doses: Record<string, { dose: number; cible: number }>
  noms: Record<string, string>
}): Revue | null {
  const semaine = startOfWeek(args.today)
  const cette = args.events.filter((e) => e.date >= semaine && e.date <= args.today)
  if (cette.length === 0) return null
  const avant = args.events.filter((e) => e.date >= addDays(semaine, -7) && e.date < semaine)
  const demarrees = cette.filter((e) => e.started).length

  // L'ajustement : ce que la rampe va faire de la dose la semaine prochaine.
  let ajustement = 'Same rhythm next week.'
  for (const [id, d] of Object.entries(args.doses)) {
    if (d.dose >= d.cible) continue
    const t = tenue(args.events, id, addDays(semaine, 7))
    const nom = args.noms[id] ?? 'Your goal'
    if (t.tauxTenue > 0.9) ajustement = `${nom} goes up next week.`
    else if (t.tauxTenue < 0.75 && t.observations > 0) ajustement = `${nom} gets lighter next week.`
    break
  }

  return {
    semaine,
    tenu: cette.reduce((s, e) => s + (e.started ? (e.heldMinutes ?? 0) : 0), 0),
    demarrees,
    prevues: cette.length,
    moyenne: moyenneTenue(cette),
    moyenneAvant: moyenneTenue(avant),
    ajustement,
  }
}

/** La revue sans le modèle : les mêmes chiffres, une question fixe. */
export function revueEnClair(r: Revue): string[] {
  const h = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`)
  const lignes = [`${h(r.tenu)} held this week.`, `${r.demarrees} of ${r.prevues} sessions started.`]
  lignes.push(
    r.moyenneAvant && r.moyenne !== r.moyenneAvant
      ? `You hold ${r.moyenne} min on average, ${r.moyenne > r.moyenneAvant ? 'up' : 'down'} from ${r.moyenneAvant}.`
      : `You hold ${r.moyenne} min on average.`,
  )
  lignes.push(r.ajustement)
  lignes.push('What made the good days good?')
  return lignes
}

/** Les faits de la revue, tels qu'ils partent au serveur. */
export function faitsRevue(r: Revue): Record<string, string | number> {
  return {
    tenu_minutes: r.tenu,
    seances_demarrees: r.demarrees,
    seances_prevues: r.prevues,
    duree_moyenne: r.moyenne,
    duree_moyenne_semaine_avant: r.moyenneAvant,
    ajustement: r.ajustement,
  }
}

// ─── Lecture d'un texte d'arrêt ───────────────────────────────────────────

/** Sans réseau : des mots-clés. Une donnée de plus, jamais un verdict. */
const mot = (alternatives: string) => new RegExp(`(?<!\\p{L})(${alternatives})`, 'iu')
const MOTS: Record<StopReason, RegExp> = {
  'too-hard': mot("hard|stuck|don'?t (get|understand)|confus|difficile|bloqu|comprends pas"),
  boring: mot('bor(ed|ing)|dull|ennui|ennuy|chiant'),
  'no-rush': mot('later|tomorrow|no rush|plenty of time|demain|plus tard|pas pressé'),
  distracted: mot('phone|instagram|tiktok|youtube|distract|scroll|téléphone|distrait'),
  tired: mot('tired|exhausted|sleepy|fatigu|crevé|épuisé|sommeil'),
  'real-event': mot('call(ed)?|emergency|family|doctor|urgent|appel|urgence|famille|médecin'),
}

export function lireTexteArret(texte: string): StopReason | null {
  for (const r of STOP_REASONS) if (MOTS[r].test(texte)) return r
  return null
}

export { autonomie }
