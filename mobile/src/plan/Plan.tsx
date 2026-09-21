import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { useDonnees } from '@/donnees/magasin'
import { calculerPlan, cleDate } from './moteur'
import { lireSemaine } from './lecture'

function useSourcePlan() {
  const { taches, objectifs, ancres, obligations, reglages, chargees } = useDonnees()
  const [instant, setInstant] = useState(() => Math.floor(Date.now() / 60_000) * 60_000)
  useEffect(() => {
    const actualiser = () => setInstant(Math.floor(Date.now() / 60_000) * 60_000)
    const intervalle = setInterval(actualiser, 1000)
    const retour = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') actualiser()
    })
    return () => { clearInterval(intervalle); retour.remove() }
  }, [])
  return useMemo(() => {
    const maintenant = new Date(instant)
    const resultat = calculerPlan({ taches, objectifs, ancres, obligations, reglages, maintenant })
    const jours = lireSemaine(resultat, obligations, reglages)
    return { resultat, jours, maintenant, aujourdHui: cleDate(maintenant),
      minute: maintenant.getHours() * 60 + maintenant.getMinutes(), chargees }
  }, [taches, objectifs, ancres, obligations, reglages, instant, chargees])
}

const ContextePlan = createContext<ReturnType<typeof useSourcePlan> | null>(null)
export function FournisseurPlan({ children }: { children: ReactNode }) {
  const valeur = useSourcePlan()
  return <ContextePlan.Provider value={valeur}>{children}</ContextePlan.Provider>
}
export function usePlan() {
  const valeur = useContext(ContextePlan)
  if (!valeur) throw new Error('FournisseurPlan absent')
  return valeur
}
