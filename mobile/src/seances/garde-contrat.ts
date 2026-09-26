import { effectiveContract, refusalLine, refusesChange } from '@shared/contract'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { useToast } from '@/ui/app-briques'
import { useSeances } from '@/seances/magasin-seances'
import { disciplineSuspendue } from '@shared/coach/garde-fous'
import { coach } from '@/coach/client'

/**
 * Le contrat d'Ulysse, au moment d'agir (spec moteur 2026-09-25) : pendant
 * un bloc, l'app refuse tout changement du plan — avec les mots du contrat
 * que l'utilisateur a signé. Hors bloc, ou sans contrat, rien n'est refusé.
 * Rend `true` quand l'action peut avoir lieu.
 */
let dejaReformule = ''

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
    const reste = (seanceActive?.endMinute ?? minute) - minute
    // Les mots du contrat, tout de suite ; puis, si le Coach existe, le même
    // refus dit par lui (job « refus ») — jamais une concession.
    toast(refusalLine(c.mode, c.signedAt, reste))
    // Le Coach ne reformule qu'UNE fois par bloc : un appel payant par tap,
    // c'est la journée du Coach brûlée en une séance.
    const cle = seanceActive?.blockId ?? ''
    if (coach().disponible && cle && dejaReformule !== cle) {
      dejaReformule = cle
      void coach()
        .demander({
          job: 'refus',
          mode: c.mode,
          faits: { minutes_restantes: Math.max(1, Math.round(reste)), signe_le: c.signedAt.slice(0, 10), regle: 'no changes during a block' },
        })
        .then((t) => t && toast(t))
    }
    return false
  }
}
