import type { PlacedBlock } from '@shared/planning/types'
import { dailyRhythm } from '@shared/planning/placement'
import type { Ancre, Objectif, Tache } from '@/donnees/magasin'

/**
 * De ce que l'utilisateur a écrit vers une journée placée.
 *
 * Trois règles, dans cet ordre, et l'ordre est tout :
 *
 * 1. **Les ancres d'abord.** Une ancre ne se déplace pas — c'est sa raison
 *    d'être. Le déjeuner à midi reste à midi ; ce qui ne rentre pas autour
 *    s'efface, jamais elle.
 * 2. **Les tâches ensuite**, la plus urgente en premier. L'échéance décide, et
 *    l'importance départage à échéance égale.
 * 3. **Les objectifs remplissent ce qui reste.** Ils n'ont pas de date : c'est
 *    précisément ce qui les rend souples.
 *
 * La part quotidienne d'un objectif vient du moteur partagé — `dailyRhythm`,
 * qui divise la cible hebdomadaire par sept. Le diviseur ne bouge jamais avec
 * les jours restants : une semaine commencée un jeudi donne un total plus bas
 * cette semaine-là, jamais un rattrapage écrasé sur la fin.
 *
 * Ce placeur est volontairement direct. Le moteur complet du bureau — capacité
 * effective, faisabilité, dette de retard, apprentissage — demande un historique
 * que le téléphone n'a pas encore. Il se branchera quand cet historique existera ;
 * d'ici là mieux vaut une journée honnêtement placée qu'un moteur nourri de vide.
 */

/** Marge entre deux blocs. Sans elle, la journée est un mur. */
const RESPIRATION_MINUTES = 10

/** Une séance ne dépasse pas ça d'un trait : au-delà, l'attention s'effondre. */
const SEANCE_MAX_MINUTES = 90
const SEANCE_MIN_MINUTES = 25

export function planDuJour({
  taches,
  objectifs,
  ancres,
  lever,
  coucher,
  date = aujourdhui(),
}: {
  taches: readonly Tache[]
  objectifs: readonly Objectif[]
  ancres: readonly Ancre[]
  lever: number
  coucher: number
  date?: string
}): PlacedBlock[] {
  const jourSemaine = jourDeLaSemaine(date)
  const blocs: PlacedBlock[] = []

  // --- 1. Les ancres, à leur heure, sans discussion ---------------------
  const ancresDuJour = ancres
    .filter((a) => a.jours.includes(jourSemaine))
    .sort((a, b) => a.minuteAncrage - b.minuteAncrage)

  for (const a of ancresDuJour) {
    const fin = Math.min(a.minuteAncrage + a.dureeMinutes, coucher)
    if (fin <= a.minuteAncrage) continue
    blocs.push(
      bloc({
        id: `ancre-${a.id}`,
        date,
        debut: a.minuteAncrage,
        fin,
        genre: 'ancre',
        refId: a.id,
        label: a.nom,
        couleur: a.couleur,
      }),
    )
  }

  // --- 2. Les creux qui restent -----------------------------------------
  let creux = creuxEntre(lever, coucher, blocs)

  // --- 3. Les tâches, la plus pressée en premier ------------------------
  const ouvertes = [...taches]
    .filter((t) => !t.terminee && t.minutesRestantes > 0)
    .sort((a, b) =>
      a.echeance === b.echeance
        ? b.importance - a.importance
        : a.echeance.localeCompare(b.echeance),
    )

  for (const t of ouvertes) {
    let aPlacer = t.minutesRestantes
    while (aPlacer >= SEANCE_MIN_MINUTES && creux.length > 0) {
      const place = premierCreuxUtilisable(creux)
      if (!place) break
      const duree = Math.min(aPlacer, SEANCE_MAX_MINUTES, place.fin - place.debut)
      if (duree < SEANCE_MIN_MINUTES) break
      blocs.push(
        bloc({
          id: `tache-${t.id}-${place.debut}`,
          date,
          debut: place.debut,
          fin: place.debut + duree,
          genre: 'task',
          refId: t.id,
          label: t.titre,
        }),
      )
      aPlacer -= duree
      creux = creuxEntre(lever, coucher, blocs)
    }
  }

  // --- 4. Les objectifs prennent ce qui reste ---------------------------
  // `dailyRhythm` fait exactement cela dans le moteur partagé : cible ÷ 7.
  const partDuJour = (o: Objectif) => Math.round(dailyRhythm(o.cibleHebdoMinutes))
  for (const o of objectifs) {
    let aPlacer = partDuJour(o)
    while (aPlacer >= SEANCE_MIN_MINUTES && creux.length > 0) {
      const place = premierCreuxUtilisable(creux)
      if (!place) break
      const duree = Math.min(aPlacer, SEANCE_MAX_MINUTES, place.fin - place.debut)
      if (duree < SEANCE_MIN_MINUTES) break
      blocs.push(
        bloc({
          id: `objectif-${o.id}-${place.debut}`,
          date,
          debut: place.debut,
          fin: place.debut + duree,
          genre: 'objective',
          refId: o.id,
          label: o.nom,
          couleur: o.couleur,
        }),
      )
      aPlacer -= duree
      creux = creuxEntre(lever, coucher, blocs)
    }
  }

  return blocs.sort((a, b) => a.startMinute - b.startMinute)
}

type Creux = { debut: number; fin: number }

/** Ce qui reste de libre entre le lever et le coucher, respiration comprise. */
function creuxEntre(lever: number, coucher: number, blocs: readonly PlacedBlock[]): Creux[] {
  const occupes = [...blocs]
    .map((b) => ({ debut: b.startMinute, fin: b.endMinute }))
    .sort((a, b) => a.debut - b.debut)

  const libres: Creux[] = []
  let curseur = lever

  for (const o of occupes) {
    if (o.debut - curseur >= SEANCE_MIN_MINUTES + RESPIRATION_MINUTES) {
      libres.push({ debut: curseur, fin: o.debut - RESPIRATION_MINUTES })
    }
    curseur = Math.max(curseur, o.fin + RESPIRATION_MINUTES)
  }
  if (coucher - curseur >= SEANCE_MIN_MINUTES) libres.push({ debut: curseur, fin: coucher })

  return libres
}

function premierCreuxUtilisable(creux: readonly Creux[]): Creux | null {
  return creux.find((c) => c.fin - c.debut >= SEANCE_MIN_MINUTES) ?? null
}

function bloc({
  id,
  date,
  debut,
  fin,
  genre,
  refId,
  label,
  couleur,
}: {
  id: string
  date: string
  debut: number
  fin: number
  genre: PlacedBlock['kind']
  refId: string
  label: string
  couleur?: string
}): PlacedBlock {
  const empreinte = fin - debut
  // La pause est INCLUSE dans l'empreinte, jamais ajoutée après : c'est la règle
  // du bureau, et l'enfreindre ferait déborder chaque journée.
  const pause = empreinte >= 50 ? Math.round(empreinte * 0.12) : 0
  return {
    id,
    date,
    startMinute: debut,
    endMinute: fin,
    durationMinutes: empreinte,
    breakMinutes: pause,
    workMinutes: empreinte - pause,
    kind: genre,
    refId,
    label,
    color: couleur ?? '',
    cognitiveWindow: debut < 12 * 60 ? 'PROFONDE' : debut < 17 * 60 ? 'NORMALE' : 'BASSE',
  }
}

/**
 * Le jour de la semaine d'une date `AAAA-MM-JJ`, en heure LOCALE.
 *
 * `new Date('2026-09-21')` donne minuit **UTC**, pas minuit chez l'utilisateur.
 * À l'ouest de Greenwich, ce lundi-là est encore dimanche localement — et une
 * ancre « en semaine » disparaissait du plan. On construit donc la date à partir
 * de ses composantes, ce qui la fixe dans le fuseau du téléphone.
 */
function jourDeLaSemaine(date: string): number {
  const [a, m, j] = date.split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1).getDay()
}

function aujourdhui(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
