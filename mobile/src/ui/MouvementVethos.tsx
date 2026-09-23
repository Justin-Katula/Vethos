import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { useJetons } from '@/theme/Theme'
import { THEMES } from '@/theme/jetons'
import { GEIST, MONO } from './primitives'

type TonEnergie = 'neutre' | 'tension' | 'espoir'

export type MotImpact = {
  texte: string
  accent?: boolean
  impact?: 'leger' | 'moyen' | 'succes'
}

/**
 * Une lumiere lente et bornee qui donne de la profondeur sans devenir un
 * fond video. Elle ne touche qu'a l'opacite et aux transforms, et devient
 * entierement statique quand Reduce Motion est actif.
 */
export function FondEnergie({
  ton = 'neutre',
  intensite = 1,
}: {
  ton?: TonEnergie
  intensite?: number
}) {
  const j = THEMES.sombre
  const mouvementReduit = useMouvementReduit()
  const derive = useRef(new Animated.Value(0)).current
  const souffle = useRef(new Animated.Value(0)).current
  const orbite = useRef(new Animated.Value(0)).current
  const couleur = ton === 'tension' ? j.accentEncre : ton === 'espoir' ? j.text : j.text3
  const couleurSecondaire = ton === 'tension' ? j.text3 : j.accentEncre
  const points = useRef(
    Array.from({ length: 6 }, (_, i) => ({
      angle: ((i * 60 + (Math.random() * 30 - 15) - 90) * Math.PI) / 180,
      rayon: 266 + Math.random() * 24,
      taille: 3.5 + Math.random() * 2.5,
      couleur: Math.random() < 0.25 ? j.accentEncre : j.text,
      delaiInitial: Math.random() * 3000,
    })),
  ).current

  useEffect(() => {
    if (mouvementReduit) {
      derive.setValue(0.45)
      souffle.setValue(0.55)
      orbite.setValue(0)
      return
    }
    const mouvement = Animated.loop(
      Animated.sequence([
        Animated.timing(derive, {
          toValue: 1,
          duration: 7800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(derive, {
          toValue: 0,
          duration: 9200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    const respiration = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(souffle, {
          toValue: 0,
          duration: 6400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    const rotation = Animated.loop(
      Animated.timing(orbite, {
        toValue: 1,
        duration: 90000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    mouvement.start()
    respiration.start()
    rotation.start()
    return () => {
      mouvement.stop()
      respiration.stop()
      rotation.stop()
      derive.stopAnimation()
      souffle.stopAnimation()
      orbite.stopAnimation()
    }
  }, [derive, mouvementReduit, orbite, souffle])

  return (
    <View
      accessible={false}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {/* Anneau d'orbite : présence constante liée au temps, indépendante du ton de la scène — contrairement aux deux lueurs ci-dessous. */}
      <Animated.View
        style={{
          position: 'absolute',
          width: 620,
          height: 620,
          left: '50%',
          top: '46%',
          marginLeft: -310,
          marginTop: -310,
          opacity: 0.28 * intensite,
          transform: [
            { rotate: orbite.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 620 620">
          <Circle
            cx={310}
            cy={310}
            r={278}
            stroke={j.text3}
            strokeWidth={1}
            strokeDasharray="1.5 10"
            fill="none"
          />
        </Svg>
        {points.map((point, i) => (
          <PointOrbite key={i} {...point} mouvementReduit={mouvementReduit} />
        ))}
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          top: -250,
          right: -240,
          opacity: (ton === 'tension' ? 0.86 : 0.6) * intensite,
          transform: [
            { translateX: derive.interpolate({ inputRange: [0, 1], outputRange: [-18, 28] }) },
            { translateY: derive.interpolate({ inputRange: [0, 1], outputRange: [10, -22] }) },
            { scale: souffle.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 520 520">
          <Defs>
            <RadialGradient id="energie-a" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={couleur} stopOpacity={ton === 'tension' ? 0.2 : 0.12} />
              <Stop offset="46%" stopColor={couleur} stopOpacity={0.055} />
              <Stop offset="100%" stopColor={couleur} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="260" cy="260" r="258" fill="url(#energie-a)" />
        </Svg>
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          width: 430,
          height: 430,
          left: -250,
          bottom: -180,
          opacity: 0.48 * intensite,
          transform: [
            { translateX: derive.interpolate({ inputRange: [0, 1], outputRange: [22, -14] }) },
            { translateY: souffle.interpolate({ inputRange: [0, 1], outputRange: [-12, 18] }) },
            { scale: derive.interpolate({ inputRange: [0, 1], outputRange: [1.06, 0.92] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 430 430">
          <Defs>
            <RadialGradient id="energie-b" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={couleurSecondaire} stopOpacity={0.1} />
              <Stop offset="55%" stopColor={couleurSecondaire} stopOpacity={0.035} />
              <Stop offset="100%" stopColor={couleurSecondaire} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="215" cy="215" r="213" fill="url(#energie-b)" />
        </Svg>
      </Animated.View>
    </View>
  )
}

/**
 * Un point qui arrive sur l'anneau, reste un moment, puis repart — jamais
 * deux fois au meme rythme. Chaque point relance son propre cycle avec une
 * pause aleatoire, pour que rien ne semble mecanique meme apres plusieurs
 * tours.
 */
function PointOrbite({
  angle,
  rayon,
  taille,
  couleur,
  delaiInitial,
  mouvementReduit,
}: {
  angle: number
  rayon: number
  taille: number
  couleur: string
  delaiInitial: number
  mouvementReduit: boolean
}) {
  const p = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (mouvementReduit) return
    let vivant = true
    let animation: Animated.CompositeAnimation | null = null
    const cycle = (delai: number) => {
      animation = Animated.sequence([
        Animated.delay(delai),
        Animated.timing(p, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(1500 + Math.random() * 2200),
        Animated.timing(p, {
          toValue: 0,
          duration: 850,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
      animation.start(({ finished }) => {
        if (finished && vivant) cycle(500 + Math.random() * 2000)
      })
    }
    cycle(delaiInitial)
    return () => {
      vivant = false
      animation?.stop()
      p.stopAnimation()
    }
  }, [delaiInitial, mouvementReduit, p])
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 310 + Math.cos(angle) * rayon - taille / 2,
        top: 310 + Math.sin(angle) * rayon - taille / 2,
        width: taille,
        height: taille,
        borderRadius: taille / 2,
        backgroundColor: couleur,
        opacity: p,
        transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
      }}
    />
  )
}

/**
 * Les mots importants arrivent comme des decisions, pas comme une machine a
 * ecrire. Chaque fragment a sa propre entree et seuls les mots marques
 * declenchent un impact haptique.
 */
export function PhraseImpact({
  mots,
  mouvementReduit,
  delai = 0,
  intervalle = 520,
  couleur,
  couleurAccent,
  style,
  styleConteneur,
}: {
  mots: readonly MotImpact[]
  mouvementReduit: boolean
  delai?: number
  intervalle?: number
  couleur: string
  couleurAccent: string
  style?: StyleProp<TextStyle>
  styleConteneur?: StyleProp<ViewStyle>
}) {
  const motsStables = useRef(mots).current
  const entrees = useRef(motsStables.map(() => new Animated.Value(mouvementReduit ? 1 : 0))).current
  const secousses = useRef(motsStables.map(() => new Animated.Value(0))).current

  useEffect(() => {
    const minuteurs: ReturnType<typeof setTimeout>[] = []
    entrees.forEach((entree) => entree.setValue(mouvementReduit ? 1 : 0))
    secousses.forEach((secousse) => secousse.setValue(0))
    if (mouvementReduit) return undefined

    motsStables.forEach((mot, index) => {
      const minuteur = setTimeout(
        () => {
          const entree = entrees[index]
          const secousse = secousses[index]
          if (!entree || !secousse) return
          Animated.parallel([
            Animated.timing(entree, {
              toValue: 1,
              duration: 620,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(secousse, { toValue: -2.2, duration: 48, useNativeDriver: true }),
              Animated.timing(secousse, { toValue: 2, duration: 54, useNativeDriver: true }),
              Animated.timing(secousse, { toValue: -0.8, duration: 48, useNativeDriver: true }),
              Animated.timing(secousse, { toValue: 0, duration: 70, useNativeDriver: true }),
            ]),
          ]).start()

          if (mot.impact === 'leger') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          if (mot.impact === 'moyen') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          if (mot.impact === 'succes')
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        },
        delai + index * intervalle,
      )
      minuteurs.push(minuteur)
    })

    return () => {
      minuteurs.forEach(clearTimeout)
      entrees.forEach((entree) => entree.stopAnimation())
      secousses.forEach((secousse) => secousse.stopAnimation())
    }
  }, [delai, entrees, intervalle, motsStables, mouvementReduit, secousses])

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={motsStables.map((mot) => mot.texte).join(' ')}
      style={[{ flexDirection: 'row', flexWrap: 'wrap' }, styleConteneur]}
    >
      {motsStables.map((mot, index) => {
        const entree = entrees[index]
        const secousse = secousses[index]
        if (!entree || !secousse) return null
        return (
          <Animated.Text
            accessible={false}
            key={`${mot.texte}-${index}`}
            style={[
              style,
              {
                color: mot.accent ? couleurAccent : couleur,
                marginRight: index === motsStables.length - 1 ? 0 : 7,
                opacity: entree,
                transform: [
                  { translateY: entree.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                  { translateX: secousse },
                ],
              },
            ]}
          >
            {mot.texte}
          </Animated.Text>
        )
      })}
    </View>
  )
}

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
