import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { DEFAULT_THEME_MODE, resolveTheme, type Theme, type ThemeMode } from '@shared/theme'
import { useDonnees } from '@/donnees/magasin'
import { THEMES, type Jetons, type NomTheme } from './jetons'

/**
 * L'apparence, décidée par la MÊME règle que le bureau.
 *
 * `resolveTheme` vit dans `@shared/theme` : quatre modes — suivre l'appareil,
 * clair, sombre, à l'heure — et une fonction pure qui tranche. On l'importe au
 * lieu de la réécrire, sinon les deux applications finissent par ne plus
 * s'accorder sur ce que « à l'heure » veut dire.
 *
 * Le mode horaire pose UN minuteur exactement sur la bascule, au lieu de
 * réinterroger l'horloge chaque minute pour ne rien apprendre.
 *
 * Un composant ne demande jamais « la couleur claire » : il demande `surface`
 * et reçoit la bonne. Une condition sur le thème dans un écran signifie qu'un
 * jeton manque.
 */
const Contexte = createContext<{ jetons: Jetons; nom: NomTheme; mode: ThemeMode }>({
  jetons: THEMES.sombre,
  nom: 'sombre',
  mode: DEFAULT_THEME_MODE,
})

/** Du vocabulaire partagé vers le nôtre. */
const enFrancais = (t: Theme): NomTheme => (t === 'dark' ? 'sombre' : 'clair')

export function FournisseurTheme({
  children,
  force,
}: {
  children: ReactNode
  /** Pour les captures et les tests : impose un thème sans toucher l'appareil. */
  force?: NomTheme
}) {
  const apparenceSysteme = useColorScheme()
  const mode = useDonnees((d) => d.reglages.apparence)
  const clairDes = useDonnees((d) => d.reglages.clairDes)
  const sombreDes = useDonnees((d) => d.reglages.sombreDes)
  const [instant, setInstant] = useState(() => new Date())

  // Le mode horaire est le seul dont l'avis change tout seul. On réveille donc
  // le calcul à la minute — c'est assez fin pour une bascule à l'heure ronde, et
  // assez rare pour ne rien coûter.
  useEffect(() => {
    if (mode !== 'schedule') return
    const t = setInterval(() => setInstant(new Date()), 60_000)
    return () => clearInterval(t)
  }, [mode])

  const valeur = useMemo(() => {
    const decide = resolveTheme(
      {
        mode,
        systemDark: apparenceSysteme !== 'light',
        schedule: { lightAt: clairDes, darkAt: sombreDes },
      },
      instant,
    )
    const nom: NomTheme = force ?? enFrancais(decide)
    return { jetons: THEMES[nom], nom, mode }
  }, [apparenceSysteme, force, mode, instant, clairDes, sombreDes])

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useJetons(): Jetons {
  return useContext(Contexte).jetons
}

export function useNomTheme(): NomTheme {
  return useContext(Contexte).nom
}

export function useModeApparence(): ThemeMode {
  return useContext(Contexte).mode
}
