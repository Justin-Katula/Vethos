import { useEffect } from 'react'
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

  useEffect(() => {
    // Les données d'abord : l'écran d'accueil les lit dès son premier rendu.
    void charger()
    void initialiser()
  }, [charger, initialiser])

  if (!donneesPretes) {
    return <ChargementVethos pleinEcran libelle="Vethos is reading your time." />
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
      {/* Au-dessus encore : au premier lancement, il n'y a rien derriere. */}
      <Introduction />
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
      {/* Aucun `force` ici : le thème suit le réglage de l’utilisateur, et à
          défaut son appareil. `force` ne sert qu’aux captures et aux tests. */}
      <FournisseurTheme>
        <FournisseurPlan><Coque /></FournisseurPlan>
      </FournisseurTheme>
    </SafeAreaProvider>
  )
}
