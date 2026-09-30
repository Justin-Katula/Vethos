import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { A, GEIST, SORTIE } from '@/ui/app-briques'
import { connecterApple, connecterGoogle, useSession } from './compte'
import { introVueSurAppareil, marquerIntroVue } from './espace'
import { LogoApple, LogoGoogle, useConnexion } from './CarteCompte'
import { useAbonnement } from '@/abonnement/achats'
import { EcranAbonnement } from '@/abonnement/EcranAbonnement'

/** Un bouton en pilule, comme les écrans de connexion d'iOS. */
function Pilule({ onPress, clair, children, label }: { onPress: () => void; clair?: boolean; children: React.ReactNode; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 50,
        borderRadius: 25,
        backgroundColor: clair ? A.t1 : 'rgba(242,242,242,0.09)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {children}
    </Pressable>
  )
}

/**
 * La porte. Déconnecté, on arrive ici d'abord — jamais sur l'introduction.
 * « Sign In » pour revenir sur son compte, « Sign Up » pour en créer un ;
 * l'introduction ne se joue qu'après, pour un compte qui ne l'a pas faite.
 *
 * Derrière la connexion, le mur : sans abonnement ni essai, l'app reste
 * fermée aussi (voir `EcranAbonnement`).
 *
 * Tant qu'aucun fournisseur n'est configuré (ni Apple, ni Google), la porte
 * n'existe pas : une porte sans clé enfermerait l'utilisateur dehors.
 */
export function PorteCompte() {
  const session = useSession()
  const connexion = useConnexion()
  const introFaite = useDonnees((e) => e.chargees && e.reglages.introductionFaite)
  const marges = useSafeAreaInsets()
  const apparition = useRef(new Animated.Value(0)).current

  // Un téléphone qui a déjà servi ouvre sur « Sign In » ; un téléphone neuf, sur « Sign Up ».
  const [inscription, setInscription] = useState<boolean | null>(null)
  useEffect(() => {
    void introVueSurAppareil().then((vue) => setInscription(!vue))
  }, [])
  useEffect(() => {
    if (introFaite) void marquerIntroVue()
  }, [introFaite])

  const configuree = !!connexion.dispo && (connexion.dispo.apple || connexion.dispo.google)
  const fermee = configuree && session === null && inscription !== null

  const abonnement = useAbonnement((e) => e.etat)
  const initialiser = useAbonnement((e) => e.initialiser)
  const utilisateur = session?.user.id
  useEffect(() => {
    if (utilisateur) void initialiser(utilisateur)
  }, [utilisateur, initialiser])

  useEffect(() => {
    if (fermee) Animated.timing(apparition, { toValue: 1, duration: 420, easing: SORTIE, useNativeDriver: true }).start()
    else apparition.setValue(0)
  }, [fermee, apparition])

  if (introFaite && session && abonnement === 'inactif') return <EcranAbonnement />
  // Pendant qu'on demande au Store : du noir, pas un aperçu de l'app.
  if (introFaite && session && abonnement === 'chargement') return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: 100 }]} />
  if (!fermee || !connexion.dispo) return null
  const { apple, google } = connexion.dispo
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: apparition, zIndex: 100 }]}>
      <View style={{ flex: 1, width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 20, paddingTop: marges.top + 64, paddingBottom: marges.bottom + 24 }}>
        <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 28, letterSpacing: -0.6, textAlign: 'center' }}>
          {inscription ? 'Sign Up' : 'Sign In'}
        </Text>
        <Text style={{ marginTop: 8, color: A.t3, fontFamily: GEIST.normal, fontSize: 15, textAlign: 'center' }}>
          {inscription ? 'Let’s get your time back.' : 'Sign in or create an account to continue.'}
        </Text>

        <View style={{ marginTop: 36, gap: 12 }}>
          {apple ? (
            <Pilule clair label="Continue with Apple" onPress={() => void connexion.lancer(connecterApple)}>
              <LogoApple couleur="#000" />
              <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 17 }}>Continue with Apple</Text>
            </Pilule>
          ) : null}
          {apple && google ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: A.s }} />
              <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 14 }}>or</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: A.s }} />
            </View>
          ) : null}
          {google ? (
            <Pilule clair={!apple} label="Continue with Google" onPress={() => void connexion.lancer(connecterGoogle)}>
              <LogoGoogle />
              <Text style={{ color: apple ? A.t1 : '#000', fontFamily: GEIST.demi, fontSize: 17 }}>Continue with Google</Text>
            </Pilule>
          ) : null}
        </View>

        {connexion.echec ? (
          <Text accessibilityLiveRegion="polite" style={{ marginTop: 14, textAlign: 'center', color: A.rouge, fontFamily: GEIST.moyen, fontSize: 14 }}>
            Couldn’t sign in.
          </Text>
        ) : null}

        <Pressable accessibilityRole="button" onPress={() => setInscription(!inscription)} hitSlop={12} style={({ pressed }) => ({ marginTop: 28, alignSelf: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>
            {inscription ? 'Already have an account?' : 'Don’t have an account?'}
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />
        <Image source={require('../../assets/vethos-logo.png')} accessibilityLabel="Vethos" style={{ width: 40, height: 40, alignSelf: 'center', opacity: 0.9 }} resizeMode="contain" />
      </View>
    </Animated.View>
  )
}
