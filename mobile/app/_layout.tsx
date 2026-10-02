import { useEffect } from 'react'
import { AppState } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist'
import { GeistMono_400Regular, GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono'
import { FournisseurTheme, useJetons, useNomTheme } from '@/theme/Theme'
import { useBlocage } from '@/blocage/etat'
import { useDonnees } from '@/donnees/magasin'
import { FournisseurPlan } from '@/plan/Plan'
import { JeCommence } from '@/seances/JeCommence'
import { Introduction } from '@/accueil/Introduction'
import { PorteCompte } from '@/compte/PorteCompte'
import { useSession } from '@/compte/compte'
import { definirCompte, oublierTiroirCommun } from '@/compte/espace'
import { accorder } from '@/compte/nuage'
import { useSeances } from '@/seances/magasin-seances'
import { cleDate } from '@/plan/moteur'
import { ChargementVethos } from '@/ui/MouvementVethos'

// On garde l'écran de lancement jusqu'à ce que les polices soient là. Sans cela
// la première image s'affiche en police système puis saute vers Geist — et ce
// saut est la première chose que l'utilisateur voit de l'application.
void SplashScreen.preventAutoHideAsync()

function Coque() {
  const jetons = useJetons()
  const nom = useNomTheme()
  const initialiser = useBlocage((e) => e.initialiser)
  const charger = useDonnees((e) => e.charger)
  const donneesPretes = useDonnees((e) => e.chargees)

  // L'autorisation appartient à iOS, qui peut la retirer ou la rendre pendant
  // que Vethos dort : on la relit à chaque retour au premier plan.
  const relire = useBlocage((e) => e.relireAutorisation)
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void relire()
    })
    return () => abonnement.remove()
  }, [relire])

  useEffect(() => {
    void initialiser()
  }, [initialiser])

  // Les données suivent le compte : un tiroir par compte (`@/compte/espace`).
  // On attend de savoir qui est connecté, puis on ouvre SON tiroir. Changer de
  // compte referme l'un et ouvre l'autre : jamais les affaires de l'un chez
  // l'autre. Déconnecté, il n'y a pas de tiroir du tout.
  const session = useSession()
  const compte = session === undefined ? undefined : (session?.user.id ?? null)
  useEffect(() => {
    if (compte === undefined) return
    let annule = false
    void (async () => {
      // Plus rien ne s'écrit tant que le bon tiroir n'est pas ouvert.
      useDonnees.setState({ chargees: false, proprietaire: null })
      useSeances.setState({ chargees: false, proprietaire: null })
      definirCompte(null)
      await oublierTiroirCommun().catch(() => undefined)
      if (!compte) return
      // Le téléphone et la sauvegarde en ligne se mettent d'accord : sur un
      // nouvel iPhone, c'est ici que le compte retrouve ses affaires.
      await accorder(compte).catch(() => undefined)
      if (annule) return
      definirCompte(compte)
      await charger()
      await useSeances.getState().charger(cleDate(new Date()))
    })()
    return () => {
      annule = true
    }
  }, [compte, charger])

  if (compte === undefined) return <ChargementVethos pleinEcran />

  // Déconnecté : la porte, et RIEN derrière — ni introduction, ni « Je
  // commence », ni onglets. Ces écrans sont des fenêtres iOS qui passent
  // au-dessus de tout ; s'ils existaient ici, ils couvriraient la porte.
  if (compte === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar style="light" />
        <PorteCompte />
      </View>
    )
  }

  if (!donneesPretes) {
    return <ChargementVethos pleinEcran />
  }

  return (
    <View style={{ flex: 1, backgroundColor: jetons.bg }}>
      <StatusBar style={nom === 'sombre' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: jetons.bg },
          animation: 'slide_from_right',
        }}
      />
      {/* D.8 : au-dessus de TOUT, quel que soit l'onglet ouvert. Une question
          qu'on peut eviter en changeant d'onglet n'est pas une friction. */}
      <JeCommence />
      {/* Au-dessus encore : un compte neuf n'a rien derrière. */}
      <Introduction />
      {/* Puis le mur d'abonnement, une fois l'introduction faite. */}
      <PorteCompte />
    </View>
  )
}

export default function Racine() {
  const [policesPretes] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_600SemiBold,
  })

  useEffect(() => {
    if (policesPretes) void SplashScreen.hideAsync()
  }, [policesPretes])

  if (!policesPretes) return null

  return (
    <SafeAreaProvider>
      {/* Vethos est sombre : la maquette n'a qu'une apparence, et la lumière
          de l'heure n'existe que sur du noir. */}
      <FournisseurTheme force="sombre">
        <FournisseurPlan><Coque /></FournisseurPlan>
      </FournisseurTheme>
    </SafeAreaProvider>
  )
}
