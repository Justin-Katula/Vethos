import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

/**
 * La sauvegarde en ligne : chaque magasin du compte (engagements, séances) a
 * une copie dans Supabase, table `donnees_compte`, que seul ce compte peut
 * lire (RLS). Le téléphone reste la source du quotidien — l'app marche hors
 * ligne — et le nuage suit.
 *
 * Règle simple, sans fusion : la version la plus récente gagne, magasin par
 * magasin. L'heure de chaque version est celle de l'appareil qui l'a écrite.
 */

export type Magasin = 'vethos:donnees:v1' | 'vethos:seances:v1'
export const MAGASINS: readonly Magasin[] = ['vethos:donnees:v1', 'vethos:seances:v1']

const cleLocale = (m: Magasin, compte: string) => `${m}:u:${compte}`
const cleHeure = (m: Magasin, compte: string) => `vethos:maj:${m}:u:${compte}`

/**
 * Ce que la comparaison décide, pour un magasin. Pur : testé sans réseau.
 *
 * Les séances font exception : elles sont la mesure de CE téléphone (la
 * pendule y tourne, « Je commence » s'y appuie). Remplacer en bloc la copie
 * locale par une version plus récente venue d'ailleurs effaçait une séance
 * déjà commencée — et l'overlay la redemandait. Le nuage ne sert donc les
 * séances qu'à un téléphone qui n'en a pas (nouvel iPhone).
 */
export function arbitrer(
  local: { heure: string | null; present: boolean },
  distant: { heure: string } | null,
  m: Magasin = 'vethos:donnees:v1',
): 'garder' | 'prendre' | 'envoyer' {
  if (!distant) return local.present ? 'envoyer' : 'garder'
  if (!local.present || !local.heure) return 'prendre'
  if (m === 'vethos:seances:v1') return local.heure === distant.heure ? 'garder' : 'envoyer'
  const l = Date.parse(local.heure)
  const d = Date.parse(distant.heure)
  if (d > l) return 'prendre'
  if (l > d) return 'envoyer'
  return 'garder'
}

/**
 * À l'ouverture du tiroir d'un compte : met le téléphone et le nuage
 * d'accord, avant que l'app ne lise quoi que ce soit. Hors ligne ou trop lent,
 * on n'attend pas : le téléphone fait foi, et la prochaine écriture repartira.
 */
export async function accorder(compte: string, delaiMs = 5000): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const travail = (async () => {
    const { data, error } = await sb.from('donnees_compte').select('magasin, contenu, maj').eq('user_id', compte)
    if (error) return
    for (const m of MAGASINS) {
      const distant = (data ?? []).find((r) => r.magasin === m) as { contenu: unknown; maj: string } | undefined
      const brut = await AsyncStorage.getItem(cleLocale(m, compte))
      const heure = await AsyncStorage.getItem(cleHeure(m, compte))
      const choix = arbitrer({ heure, present: !!brut }, distant ? { heure: distant.maj } : null, m)
      if (choix === 'prendre' && distant) {
        await AsyncStorage.setItem(cleLocale(m, compte), JSON.stringify(distant.contenu))
        await AsyncStorage.setItem(cleHeure(m, compte), distant.maj)
      } else if (choix === 'envoyer' && brut) {
        await envoyer(compte, m, brut, heure ?? new Date().toISOString())
      }
    }
  })()
  await Promise.race([travail.catch(() => undefined), new Promise((ok) => setTimeout(ok, delaiMs))])
}

async function envoyer(compte: string, m: Magasin, brut: string, heure: string): Promise<void> {
  const sb = supabase()
  if (!sb) return
  const { data } = await sb.auth.getSession()
  // Seulement le compte de la session : RLS refuserait de toute façon le reste.
  if (data.session?.user.id !== compte) return
  await sb.from('donnees_compte').upsert({ user_id: compte, magasin: m, contenu: JSON.parse(brut), maj: heure })
}

const enAttente = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Chaque écriture locale d'un compte : on note son heure, et on l'envoie peu
 * après — une seconde pour les engagements, 30 s pour les séances que la
 * pendule réécrit chaque minute. Les rafales n'en font qu'une ; un envoi perdu
 * (hors ligne, app fermée) repart à la prochaine ouverture, puisque le
 * téléphone est alors plus récent que le nuage.
 */
export async function noterEcriture(compte: string, m: Magasin, brut: string): Promise<void> {
  const heure = new Date().toISOString()
  await AsyncStorage.setItem(cleHeure(m, compte), heure)
  const k = `${compte}|${m}`
  const avant = enAttente.get(k)
  if (avant) clearTimeout(avant)
  enAttente.set(
    k,
    setTimeout(() => {
      enAttente.delete(k)
      void envoyer(compte, m, brut, heure).catch(() => undefined)
    }, m === 'vethos:seances:v1' ? 30_000 : 1000),
  )
}

/** Le compte est supprimé : son tiroir quitte aussi ce téléphone. */
export async function oublierLocalement(compte: string): Promise<void> {
  for (const m of MAGASINS) {
    await AsyncStorage.removeItem(cleLocale(m, compte))
    await AsyncStorage.removeItem(cleHeure(m, compte))
  }
}
