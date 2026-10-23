import { tiroirDejaOuvert } from '@/compte/rechargement'
import { useCallback, useEffect } from 'react'
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
import { ZoomSeance } from '@/seances/ZoomSeance'
import { ecouterReponses } from '@/seances/rappels'
import { Introduction } from '@/accueil/Introduction'
import { PorteCompte } from '@/compte/PorteCompte'
import { useSession } from '@/compte/compte'
import { definirCompte, ecranDeDepart, lireIntroEnAttente, marquerIntroVue, oublierTiroirCommun, useAppareil } from '@/compte/espace'
import { accorder } from '@/compte/nuage'
import { useSeances } from '@/seances/magasin-seances'
import { cleDate } from '@/plan/moteur'
import { ChargementVethos } from '@/ui/MouvementVethos'

// On garde l'écran natif jusqu'au premier rendu React. Notre logo animé prend
// alors le relais pendant le chargement des polices et des données.
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
  // Ce que l'appareil sait avant tout compte : l'introduction déjà vue ici ?
  const introVue = useAppareil((e) => e.introVue)
  const enAttente = useAppareil((e) => e.enAttente)
  useEffect(() => {
    void useAppareil.getState().charger()
  }, [])
  useEffect(() => {
    if (compte === undefined) return
    let annule = false
    // Le même compte est déjà ouvert et lu : rien à refaire. Cet effet se
    // rejoue au moindre rechargement à chaud ou changement d'identité de
    // `charger` ; remettre `chargees` à faux faisait alors disparaître tout le
    // plan, puis le faisait revenir quelques instants plus tard. Un tiroir
    // déjà lu pour CE compte reste affiché tel quel.
    if (tiroirDejaOuvert(compte, useDonnees.getState(), useSeances.getState())) return
    void (async () => {
      // Déjà déconnecté et l'état vide déjà ouvert (l'introduction d'un
      // téléchargement neuf tourne dessus) : ne pas le refermer. Le refermer
      // démontait l'introduction pendant ses premières images.
      const d0 = useDonnees.getState()
      if (!compte && d0.chargees && d0.proprietaire === null && !d0.reglages.introductionFaite) {
        definirCompte(null)
        return
      }
      // Plus rien ne s'écrit tant que le bon tiroir n'est pas ouvert.
      useDonnees.setState({ chargees: false, proprietaire: null })
      useSeances.setState({ chargees: false, proprietaire: null })
      definirCompte(null)
      await oublierTiroirCommun().catch(() => undefined)
      // Déconnecté : un état vide, en mémoire. L'introduction d'un téléchargement
      // neuf l'attend ; sans lui, elle restait sur le logo pour toujours (son
      // propre `ouvrirSansCompte` passait AVANT la fermeture ci-dessus).
      if (!compte) {
        if (!annule) useDonnees.getState().ouvrirSansCompte()
        return
      }
      // Le téléphone et la sauvegarde en ligne se mettent d'accord : sur un
      // nouvel iPhone, c'est ici que le compte retrouve ses affaires.
      await accorder(compte).catch(() => undefined)
      if (annule) return
      definirCompte(compte)
      await charger()
      await useSeances.getState().charger(cleDate(new Date()))
      // L'introduction faite avant la connexion (téléchargement neuf) : un compte
      // neuf la reçoit ; un compte qui a déjà la sienne la garde, et celle-ci s'oublie.
      const attente = await lireIntroEnAttente()
      if (attente && !annule) {
        const d = useDonnees.getState()
        if (!d.reglages.introductionFaite) {
          await d.finaliserIntroduction(attente.ajouts as never, attente.prenom, attente.age as never, attente.contrat as never)
        }
        await useAppareil.getState().liberer()
      }
      if (useDonnees.getState().reglages.introductionFaite) void marquerIntroVue()
    })()
    return () => {
      annule = true
    }
  }, [compte, charger])

  const depart = ecranDeDepart(compte, introVue)
  if (depart === 'chargement') return <ChargementVethos pleinEcran />

  // Téléchargement neuf : l'introduction d'abord, avant tout compte. Puis la
  // porte (« Sign Up »). Ses réponses attendent la connexion.
  if (depart === 'introduction') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar style="light" />
        <IntroductionSansCompte />
      </View>
    )
  }

  // Déconnecté (l'appareil a déjà vu l'introduction) : la porte, et RIEN
  // derrière — ni introduction, ni « Je commence », ni onglets. Ces écrans sont
  // des fenêtres iOS qui passent au-dessus de tout ; ils couvriraient la porte.
  if (depart === 'porte') {
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
      {/* Revenu d'un bouclier pendant une séance : le cadran zoome sur elle. */}
      <ZoomSeance />
      {/* Au-dessus encore : un compte neuf n'a rien derrière — sauf si son
          introduction, faite avant la connexion, est en train de lui être remise. */}
      {enAttente ? null : <Introduction />}
      {/* Puis le mur d'abonnement, une fois l'introduction faite. */}
      <PorteCompte />
    </View>
  )
}

/** L'introduction d'un téléchargement neuf : un état vide, en mémoire, sans compte. */
function IntroductionSansCompte() {
  const pret = useDonnees((e) => e.chargees && e.proprietaire === null)
  // Rouvert à chaque fois qu'un changement de compte l'a refermé.
  useEffect(() => {
    if (!pret) useDonnees.getState().ouvrirSansCompte()
  }, [pret])
  return pret ? <Introduction /> : <ChargementVethos pleinEcran />
}

// Dès le premier instant : un « I'm starting » touché sur une notification peut
// avoir réveillé Vethos en arrière-plan — la réponse ne doit pas se perdre.
ecouterReponses()

export default function Racine() {
  const [policesPretes, erreurPolices] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_600SemiBold,
  })

  const cacherEcranNatif = useCallback(() => {
    void SplashScreen.hideAsync()
  }, [])

  return (
    <SafeAreaProvider>
      {/* Vethos est sombre : la maquette n'a qu'une apparence, et la lumière
          de l'heure n'existe que sur du noir. */}
      <FournisseurTheme force="sombre">
        <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={cacherEcranNatif}>
          {policesPretes || erreurPolices
            ? <FournisseurPlan><Coque /></FournisseurPlan>
            : <ChargementVethos pleinEcran />}
        </View>
      </FournisseurTheme>
    </SafeAreaProvider>
  )
}
