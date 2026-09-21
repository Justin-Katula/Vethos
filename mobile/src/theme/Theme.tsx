import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { THEMES, type Jetons, type NomTheme } from './jetons'

/**
 * Le thème, distribué à toute l'application.
 *
 * Comme sur le bureau, un composant ne demande jamais « la couleur claire » : il
 * demande `surface` et reçoit la bonne. Aucune condition sur le thème ne doit
 * apparaître dans un écran — si vous en écrivez une, c'est qu'un jeton manque.
 *
 * Par défaut on suit l'appareil. C'est le choix honnête : une installation qui
 * n'a jamais rien demandé ne décide pas à la place de son propriétaire.
 */
const Contexte = createContext<{ jetons: Jetons; nom: NomTheme }>({
  jetons: THEMES.sombre,
  nom: 'sombre',
})

export function FournisseurTheme({
  children,
  force,
}: {
  children: ReactNode
  /** Pour les captures et les tests : impose un thème sans toucher l'appareil. */
  force?: NomTheme
}) {
  const apparenceSysteme = useColorScheme()
  const valeur = useMemo(() => {
    const nom: NomTheme = force ?? (apparenceSysteme === 'light' ? 'clair' : 'sombre')
    return { jetons: THEMES[nom], nom }
  }, [apparenceSysteme, force])

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

export function useJetons(): Jetons {
  return useContext(Contexte).jetons
}

export function useNomTheme(): NomTheme {
  return useContext(Contexte).nom
}
