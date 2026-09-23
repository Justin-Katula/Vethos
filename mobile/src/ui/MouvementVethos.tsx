import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Text,
  View,
} from 'react-native'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'

/**
 * La signature de chargement Vethos.
 *
 * Les traits ne tournent pas comme un spinner generique : ils se posent,
 * s'effacent, puis reviennent. C'est exactement ce que fait le moteur avec le
 * temps disponible — il essaie des lignes, tranche, puis verrouille un plan.
 */
export function ChargementVethos({
  pleinEcran,
  compact,
  libelle = 'Vethos is building your plan.',
}: {
  pleinEcran?: boolean
  compact?: boolean
  libelle?: string
}) {
  const j = useJetons()
  const mouvementReduit = useMouvementReduit()
  const valeurs = useRef(Array.from({ length: 8 }, () => new Animated.Value(0.14))).current
  const souffle = useRef(new Animated.Value(0.72)).current
  const taille = compact ? 52 : 104
  const centre = taille / 2
  const rayon = compact ? 20 : 40
  const largeur = compact ? 12 : 23
  const hauteur = compact ? 2 : 4

  useEffect(() => {
    if (mouvementReduit) {
      valeurs.forEach((valeur) => valeur.setValue(0.82))
      souffle.setValue(1)
      return
    }

    const animations = valeurs.map((valeur, index) =>
      Animated.sequence([
        Animated.delay(index * 75),
        Animated.loop(
          Animated.sequence([
            Animated.timing(valeur, {
              toValue: 1,
              duration: 320,
              easing: Easing.bezier(0.23, 1, 0.32, 1),
              useNativeDriver: true,
            }),
            Animated.delay(260),
            Animated.timing(valeur, {
              toValue: 0.14,
              duration: 420,
              easing: Easing.bezier(0.77, 0, 0.175, 1),
              useNativeDriver: true,
            }),
            Animated.delay(520),
          ]),
        ),
      ]),
    )
    const respiration = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, {
          toValue: 1,
          duration: 900,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
        Animated.timing(souffle, {
          toValue: 0.72,
          duration: 1100,
          easing: Easing.bezier(0.77, 0, 0.175, 1),
          useNativeDriver: true,
        }),
      ]),
    )

    animations.forEach((animation) => animation.start())
    respiration.start()
    return () => {
      animations.forEach((animation) => animation.stop())
      respiration.stop()
      valeurs.forEach((valeur) => valeur.stopAnimation())
      souffle.stopAnimation()
    }
  }, [mouvementReduit, souffle, valeurs])

  const marque = (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={libelle}
      style={{ width: taille, height: taille }}
    >
      {valeurs.map((valeur, index) => {
        const angle = -90 + index * 45
        const radians = (angle * Math.PI) / 180
        return (
          <Animated.View
            key={index}
            style={{
              position: 'absolute',
              left: centre + Math.cos(radians) * rayon - largeur / 2,
              top: centre + Math.sin(radians) * rayon - hauteur / 2,
              width: largeur,
              height: hauteur,
              borderRadius: 2,
              backgroundColor: index === 0 || index === 4 ? j.accentEncre : j.text,
              opacity: valeur,
              transform: [{ rotate: `${angle + 90}deg` }, { scaleX: valeur }],
            }}
          />
        )
      })}
      <Animated.Text
        accessible={false}
        style={{
          position: 'absolute',
          inset: 0,
          color: j.text,
          fontFamily: GEIST.demi,
          fontSize: compact ? 22 : 42,
          lineHeight: taille,
          textAlign: 'center',
          opacity: souffle,
        }}
      >
        V
      </Animated.Text>
    </View>
  )

  if (compact) return marque

  return (
    <View
      style={{
        flex: pleinEcran ? 1 : undefined,
        minHeight: pleinEcran ? undefined : 190,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        backgroundColor: pleinEcran ? j.bg : 'transparent',
      }}
    >
      {marque}
      <Text
        style={{
          color: j.text2,
          fontFamily: MONO.normal,
          fontSize: 11,
          letterSpacing: 0.35,
          textAlign: 'center',
        }}
      >
        {libelle}
      </Text>
    </View>
  )
}

function useMouvementReduit() {
  const [reduit, setReduit] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduit)
    const abonnement = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduit)
    return () => abonnement.remove()
  }, [])
  return reduit
}
