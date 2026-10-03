import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, View } from 'react-native'
import { useJetons } from '@/theme/Theme'

/** Le vrai logo accompagne les attentes, sans reprendre l'ancien V dessiné. */
export function ChargementVethos({
  pleinEcran,
  compact,
  libelle = 'Chargement de Vethos',
}: {
  pleinEcran?: boolean
  compact?: boolean
  libelle?: string
}) {
  const j = useJetons()
  const mouvementReduit = useMouvementReduit()
  const souffle = useRef(new Animated.Value(0)).current
  const taille = compact ? 52 : 120

  useEffect(() => {
    if (mouvementReduit) {
      souffle.stopAnimation()
      return
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, {
          toValue: 1,
          duration: 900,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
        Animated.timing(souffle, {
          toValue: 0,
          duration: 1100,
          easing: Easing.bezier(0.77, 0, 0.175, 1),
          useNativeDriver: true,
        }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [mouvementReduit, souffle])

  const marque = (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={libelle}
      style={{ width: taille, height: taille, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.Image
        source={require('../../assets/vethos-logo-argent.png')}
        resizeMode="contain"
        accessible={false}
        style={{
          width: taille,
          height: taille,
          opacity: mouvementReduit
            ? 1
            : souffle.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
          transform: mouvementReduit
            ? []
            : [
                { scale: souffle.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] }) },
                { translateY: souffle.interpolate({ inputRange: [0, 1], outputRange: [3, -3] }) },
              ],
        }}
      />
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
        backgroundColor: pleinEcran ? j.bg : 'transparent',
      }}
    >
      {marque}
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
