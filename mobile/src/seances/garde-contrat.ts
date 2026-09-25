import { effectiveContract, refusalLine, refusesChange } from '@shared/contract'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { useToast } from '@/ui/app-briques'

/**
 * Le contrat d'Ulysse, au moment d'agir (spec moteur 2026-09-25) : pendant
 * un bloc, l'app refuse tout changement du plan — avec les mots du contrat
 * que l'utilisateur a signé. Hors bloc, ou sans contrat, rien n'est refusé.
 * Rend `true` quand l'action peut avoir lieu.
 */
export function useGardeContrat(): () => boolean {
  const contrat = useDonnees((d) => d.reglages.contrat)
  const { seanceActive, minute, maintenant } = usePlan()
  const toast = useToast()
  return () => {
    const c = contrat ? effectiveContract(contrat, maintenant) : null
    if (!c || !refusesChange(c, !!seanceActive)) return true
    toast(refusalLine(c.mode, c.signedAt, (seanceActive?.endMinute ?? minute) - minute))
    return false
  }
}
