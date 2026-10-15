import { cancelObjectiveRemoval, effectiveContract, removalDate, requestObjectiveRemoval } from '@shared/contract'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { useToast } from '@/ui/app-briques'
import { demandesValides, type DemandeRetrait } from './retrait'

const MOIS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const jourCourt = (x: Date) =>
  `${x.getDate()} ${MOIS3[x.getMonth()]}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`

/**
 * Les demandes de retrait (`./retrait`) : les poser, les oublier, et retirer
 * pour de bon — depuis Profil seulement. Rien de tout ça pendant une séance.
 */
export function useRetrait() {
  const d = useDonnees()
  const { maintenant, seanceEnCours } = usePlan()
  const toast = useToast()
  const valides = demandesValides(d.reglages.demandesRetrait ?? [], maintenant.getTime())

  /** Une séance est en cours : on le dit, et rien ne se passe. */
  const bloquePendantSeance = () => {
    if (!seanceEnCours) return false
    toast('Session in progress. No changes until it ends.')
    return true
  }

  const demander = async (x: Omit<DemandeRetrait, 'id' | 'a'>) => {
    const a = new Date()
    const autres = valides.filter((y) => y.refId !== x.refId)
    await d.majReglages({ demandesRetrait: [...autres, { ...x, id: `${x.refId}-${a.getTime()}`, a: a.toISOString() }] })
  }

  const oublier = async (id: string) => {
    await d.majReglages({ demandesRetrait: valides.filter((y) => y.id !== id) })
  }

  /** Retirer pour de bon. Un objectif suit le contrat : effectif 48 h plus tard. */
  const retirer = async (x: DemandeRetrait) => {
    if (bloquePendantSeance()) return
    if (x.nature === 'TASK') {
      for (const p of d.taches.filter((t) => t.parentId === x.refId)) await d.supprimerTache(p.id)
      await d.supprimerTache(x.refId)
      toast(`${x.nom} removed.`)
    } else if (x.nature === 'ANCHOR') {
      await d.supprimerAncre(x.refId)
      toast(`${x.nom} removed.`)
    } else {
      const contrat = d.reglages.contrat
      if (!contrat) {
        await d.supprimerObjectif(x.refId)
        toast(`${x.nom} removed.`)
      } else {
        const r = requestObjectiveRemoval(effectiveContract(contrat, new Date()), x.refId, new Date(), false)
        if (r.ok) {
          await d.majReglages({ contrat: r.contract })
          const quand = removalDate(r.contract, x.refId)
          if (quand) toast(`${x.nom} leaves on ${jourCourt(quand)}.`)
        }
      }
    }
    await d.majReglages({ demandesRetrait: valides.filter((y) => y.id !== x.id) })
  }

  /** Un objectif déjà sur le départ (contrat) : on le garde finalement. */
  const garderObjectif = async (id: string) => {
    const contrat = d.reglages.contrat
    if (contrat) await d.majReglages({ contrat: cancelObjectiveRemoval(contrat, id) })
  }

  return { demandes: valides, demander, oublier, retirer, garderObjectif, bloquePendantSeance }
}
