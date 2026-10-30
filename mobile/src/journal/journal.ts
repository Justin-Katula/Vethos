import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'

/**
 * Le journal des testeurs : ce que Vethos a demandé à iOS, et quand.
 *
 * Le blocage ne se voit que sur un vrai iPhone : sans trace, « ça n'a pas
 * bloqué » ou « ça a continué de sonner » ne se diagnostiquent pas. Chaque
 * action qui touche au bouclier ou aux rappels écrit ici une ligne horodatée.
 *
 * Seuls les comptes marqués testeurs dans Supabase (table `testeurs`) écrivent :
 * pour tous les autres, `noter` ne fait rien — rien n'est gardé, rien n'est
 * envoyé. Le journal reste sur le téléphone.
 */

export type Entree = { t: number; sujet: string; texte: string }

export const JOURNAL_MAX = 400
const CLE = 'vethos:journal:v1'
const CLE_ACTIF = 'vethos:journal:actif'

/** Ajoute une entrée, les plus anciennes tombent au-delà de `max`. Pur. */
export function ajouter(liste: readonly Entree[], e: Entree, max = JOURNAL_MAX): Entree[] {
  const out = [...liste, e]
  return out.length > max ? out.slice(out.length - max) : out
}

/** « 10:00 », « 23:59 » : une minute du jour. */
export function hhmm(minute: number): string {
  const m = Math.max(0, Math.round(minute))
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const useJournal = create<{ actif: boolean; entrees: Entree[] }>(() => ({ actif: false, entrees: [] }))

let charge: Promise<void> | null = null
let lu = false
const enAttente: Entree[] = []
/**
 * Relit le drapeau et les entrées. Au réveil en arrière-plan (bouton d'une
 * notification), Vethos écrit avant que le compte ne soit relu : le drapeau
 * gardé sur le téléphone dit déjà s'il faut noter.
 */
export function chargerJournal(): Promise<void> {
  charge ??= (async () => {
    try {
      const [actif, brut] = await Promise.all([AsyncStorage.getItem(CLE_ACTIF), AsyncStorage.getItem(CLE)])
      const lues = brut ? (JSON.parse(brut) as Entree[]) : []
      // Ce qui a été noté pendant la lecture passe après ce qui était rangé.
      useJournal.setState((s) => ({ actif: actif === '1' || s.actif, entrees: [...(Array.isArray(lues) ? lues : []), ...s.entrees].slice(-JOURNAL_MAX) }))
    } catch {
      // Un journal abîmé repart de zéro.
    }
    lu = true
    // Ce qui est arrivé avant de savoir s'il fallait noter.
    const avant = enAttente.splice(0)
    if (useJournal.getState().actif && avant.length > 0) {
      useJournal.setState((s) => ({ entrees: avant.reduce((l, e) => ajouter(l, e), s.entrees) }))
      ranger()
    }
  })()
  return charge
}

let attente: ReturnType<typeof setTimeout> | null = null
function ranger(): void {
  if (attente) clearTimeout(attente)
  attente = setTimeout(() => {
    attente = null
    void AsyncStorage.setItem(CLE, JSON.stringify(useJournal.getState().entrees)).catch(() => undefined)
  }, 400)
}

/** Une ligne au journal — rien du tout si ce compte n'est pas testeur. */
export function noter(sujet: string, texte: string): void {
  const e = { t: Date.now(), sujet, texte: texte.slice(0, 600) }
  if (!lu && !useJournal.getState().actif) {
    if (enAttente.length < 50) enAttente.push(e)
    return
  }
  if (!useJournal.getState().actif) return
  useJournal.setState((s) => ({ entrees: ajouter(s.entrees, e) }))
  ranger()
}

/** Le drapeau du compte : posé à la connexion, retiré à la déconnexion. */
export async function activerJournal(actif: boolean): Promise<void> {
  if (useJournal.getState().actif === actif) return
  useJournal.setState(actif ? { actif } : { actif, entrees: [] })
  try {
    if (actif) await AsyncStorage.setItem(CLE_ACTIF, '1')
    else await AsyncStorage.multiRemove([CLE_ACTIF, CLE])
  } catch {
    // Le drapeau sera relu à la prochaine connexion.
  }
}

export function viderJournal(): void {
  useJournal.setState({ entrees: [] })
  ranger()
}
