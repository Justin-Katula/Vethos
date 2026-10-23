import { useEffect } from 'react'
import { cancelObjectiveRemoval } from '@shared/contract'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { useToast } from '@/ui/app-briques'
import { aEteindre, dernierCoup, noterAuCarnet, type DernierCoup, type EntreeCarnet, type NatureRetrait } from './retrait'

/**
 * Retirer (`./retrait`) : le dernier coup se pose depuis Commitments, au même
 * endroit que « Remove », puis l'engagement s'éteint tout seul. Rien de tout
 * ça pendant une séance.
 */
export function useRetrait() {
  const d = useDonnees()
  const { seanceEnCours, jours } = usePlan()
  const toast = useToast()
  const coups = d.reglages.derniersCoups ?? []

  /** Une séance est en cours : on le dit, et rien ne se passe. */
  const bloquePendantSeance = () => {
    if (!seanceEnCours) return false
    toast('Session in progress. No changes until it ends.')
    return true
  }

  const carnet = d.reglages.carnetRetraits ?? []
  const noter = (e: EntreeCarnet) => d.majReglages({ carnetRetraits: noterAuCarnet(useDonnees.getState().reglages.carnetRetraits ?? [], e) })

  /** « Remove anyway » accepté : la prochaine séance sera la dernière. */
  const lancerDernierCoup = async (c: { refId: string; nature: NatureRetrait; nom: string; ids: string[] }, e: EntreeCarnet) => {
    const coup = dernierCoup({ ...c, jours, maintenantMs: Date.now() })
    const frais = useDonnees.getState().reglages
    await d.majReglages({
      derniersCoups: [...(frais.derniersCoups ?? []).filter((x) => x.refId !== c.refId), coup],
      carnetRetraits: noterAuCarnet(frais.carnetRetraits ?? [], e),
    })
    return coup
  }

  /** On le garde finalement : le dernier coup est annulé. */
  const garder = async (refId: string) => {
    const frais = useDonnees.getState().reglages
    await d.majReglages({
      derniersCoups: (frais.derniersCoups ?? []).filter((x) => x.refId !== refId),
      carnetRetraits: (frais.carnetRetraits ?? []).map((x, i, l) => (x.refId === refId && l.findIndex((y) => y.refId === refId) === i ? { ...x, issue: 'garde' as const } : x)),
    })
  }

  /** Un objectif déjà sur le départ (contrat) : on le garde finalement. */
  const garderObjectif = async (id: string) => {
    const contrat = d.reglages.contrat
    if (contrat) await d.majReglages({ contrat: cancelObjectiveRemoval(contrat, id) })
  }

  return {
    coups,
    carnet,
    enDernierCoup: (refId: string) => coups.find((x) => x.refId === refId) ?? null,
    lancerDernierCoup,
    noter,
    garder,
    garderObjectif,
    bloquePendantSeance,
  }
}

/** Retire pour de bon un engagement dont le dernier coup est passé. */
async function eteindre(c: DernierCoup) {
  const s = useDonnees.getState()
  if (c.nature === 'TASK') {
    for (const p of s.taches.filter((t) => t.parentId === c.refId)) await s.supprimerTache(p.id)
    if (s.taches.some((t) => t.id === c.refId)) await s.supprimerTache(c.refId)
  } else if (c.nature === 'ANCHOR') {
    if (s.ancres.some((a) => a.id === c.refId)) await s.supprimerAncre(c.refId)
  } else if (s.objectifs.some((o) => o.id === c.refId)) {
    await s.supprimerObjectif(c.refId)
    const contrat = useDonnees.getState().reglages.contrat
    if (contrat) await s.majReglages({ contrat: cancelObjectiveRemoval(contrat, c.refId) })
  }
  const frais = useDonnees.getState().reglages
  await s.majReglages({ derniersCoups: (frais.derniersCoups ?? []).filter((x) => x.refId !== c.refId) })
}

/**
 * Le gardien : chaque minute, il éteint ce dont le dernier coup est passé —
 * jamais pendant sa propre séance. Monté une fois, sous le plan.
 */
export function useExtinctions() {
  const { minute, seanceActive } = usePlan()
  const coups = useDonnees((e) => e.reglages.derniersCoups)
  const chargees = useDonnees((e) => e.chargees)
  const toast = useToast()
  useEffect(() => {
    if (!chargees || !coups?.length) return
    const partis = aEteindre(coups, Date.now(), seanceActive?.refId ?? null)
    if (!partis.length) return
    void (async () => {
      for (const c of partis) await eteindre(c)
      toast(partis.length === 1 ? `${partis[0]!.nom} is gone.` : `${partis.length} commitments are gone.`)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, coups, chargees, seanceActive?.refId])
}
