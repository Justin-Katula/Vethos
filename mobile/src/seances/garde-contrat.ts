import { effectiveContract, refusesChange } from '@shared/contract'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { hm, useToast } from '@/ui/app-briques'
import { useSeances } from '@/seances/magasin-seances'
import { disciplineSuspendue } from '@shared/coach/garde-fous'

/**
 * Le contrat d'Ulysse, au moment d'agir (spec moteur 2026-09-25) : pendant
 * un bloc, l'app refuse tout changement du plan, et le dit en une ligne.
 * Hors bloc, ou sans contrat, rien n'est refusé.
 * Rend `true` quand l'action peut avoir lieu.
 */
export function useGardeContrat(): () => boolean {
  const contrat = useDonnees((d) => d.reglages.contrat)
  const { seanceActive, minute, maintenant } = usePlan()
  const signaux = useSeances((e) => e.apprentissage.lastSignalAt)
  const toast = useToast()
  return () => {
    const c = contrat ? effectiveContract(contrat, maintenant) : null
    // Détresse récente : l'app arrête d'exiger — aucun refus.
    if (disciplineSuspendue(signaux, maintenant)) return true
    if (!c || !refusesChange(c, !!seanceActive)) return true
    const reste = Math.max(1, Math.round((seanceActive?.endMinute ?? minute) - minute))
    // Le fait, rien d'autre : une séance est en cours, rien ne change avant sa fin.
    toast(`Session in progress. No changes until it ends · ${hm(reste)} left.`)
    return false
  }
}
