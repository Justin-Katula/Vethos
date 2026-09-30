import { useEffect, useRef } from 'react'
import { Animated, Image, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { A, GEIST, SORTIE } from '@/ui/app-briques'
import { useSession } from './compte'
import { BoutonsConnexion, useConnexion } from './CarteCompte'

/**
 * La porte : après l'introduction, pas de compte, pas d'app. Elle se referme
 * à la déconnexion et à la suppression du compte.
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

  const configuree = !!connexion.dispo && (connexion.dispo.apple || connexion.dispo.google)
  const fermee = introFaite && configuree && session === null

  useEffect(() => {
    if (fermee) Animated.timing(apparition, { toValue: 1, duration: 420, easing: SORTIE, useNativeDriver: true }).start()
    else apparition.setValue(0)
  }, [fermee, apparition])

  if (!fermee) return null
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: apparition, zIndex: 100 }]}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={require('../../assets/vethos-logo.png')} accessibilityLabel="Vethos" style={{ width: 120, height: 120 }} resizeMode="contain" />
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: marges.bottom + 24 }}>
        <BoutonsConnexion dispo={connexion.dispo} lancer={connexion.lancer} />
        {connexion.echec ? (
          <Text accessibilityLiveRegion="polite" style={{ marginTop: 12, textAlign: 'center', color: A.rouge, fontFamily: GEIST.moyen, fontSize: 14 }}>
            Couldn’t sign in.
          </Text>
        ) : null}
      </View>
    </Animated.View>
  )
}
