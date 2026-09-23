/**
 * Le récit se construit avec les réponses de l'utilisateur, jamais avec des
 * chiffres inventés : il touche les soirs de SA semaine, et ce qu'on lui
 * montre ensuite est cette semaine-là, prolongée.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Image, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { GEIST } from '@/ui/primitives'
import { DUREE, encre, LENTEUR, SORTIE, toucher } from './experience-introduction'

const lent = (ms: number) => Math.round(ms * LENTEUR)
const lourd = () =>
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined)

/** Une phrase qui arrive mot par mot, lentement, pour qu'on la lise en entier. */
export function MotParMot({
  texte,
  reduit,
  taille = 40,
  delai = 200,
  cadence = 240,
  surFin,
}: {
  texte: string
  reduit: boolean
  taille?: number
  delai?: number
  cadence?: number
  surFin?: () => void
}) {
  const mots = useMemo(() => texte.split(' '), [texte])
  const p = useRef(mots.map(() => new Animated.Value(reduit ? 1 : 0))).current
  const fin = useRef(surFin)
  fin.current = surFin
  useEffect(() => {
    if (reduit) {
      p.forEach((v) => v.setValue(1))
      fin.current?.()
      return
    }
    const a = Animated.stagger(
      lent(cadence),
      p.map((v) =>
        Animated.timing(v, { toValue: 1, duration: lent(420), easing: SORTIE, useNativeDriver: true }),
      ),
    )
    const t = setTimeout(() => a.start(({ finished }) => finished && fin.current?.()), delai)
    return () => {
      clearTimeout(t)
      a.stop()
    }
  }, [cadence, delai, p, reduit])
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={texte}
      style={{ flexDirection: 'row', flexWrap: 'wrap' }}
    >
      {mots.map((mot, i) => (
        <Animated.Text
          key={`${mot}-${i}`}
          accessible={false}
          style={{
            color: encre.text,
            fontFamily: GEIST.demi,
            fontSize: taille,
            lineHeight: taille * 1.13,
            letterSpacing: -taille * 0.03,
            marginRight: taille * 0.24,
            opacity: p[i],
            transform: [
              { translateY: p[i]!.interpolate({ inputRange: [0, 1], outputRange: [reduit ? 0 : 10, 0] }) },
            ],
          }}
        >
          {mot}
        </Animated.Text>
      ))}
    </View>
  )
}

/**
 * La frappe : chaque mot tombe avec une vibration lourde, puis tout l'écran
 * tremble une fois. C'est la seule secousse de l'introduction.
 */
export function Frappe({
  texte,
  reduit,
  taille = 54,
  surFin,
}: {
  texte: string
  reduit: boolean
  taille?: number
  surFin?: () => void
}) {
  const mots = useMemo(() => texte.split(' '), [texte])
  const p = useRef(mots.map(() => new Animated.Value(0))).current
  const secousse = useRef(new Animated.Value(0)).current
  const fin = useRef(surFin)
  fin.current = surFin
  useEffect(() => {
    const minuteurs: ReturnType<typeof setTimeout>[] = []
    const pas = reduit ? 260 : lent(520)
    mots.forEach((_, i) => {
      minuteurs.push(
        setTimeout(() => {
          lourd()
          Animated.timing(p[i]!, {
            toValue: 1,
            duration: reduit ? DUREE.reduit : 260,
            easing: Easing.bezier(0.2, 1.4, 0.4, 1),
            useNativeDriver: true,
          }).start()
        }, 300 + i * pas),
      )
    })
    minuteurs.push(
      setTimeout(
        () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined)
          if (!reduit)
            Animated.sequence(
              [-10, 10, -7, 7, -3, 0].map((x) =>
                Animated.timing(secousse, { toValue: x, duration: 55, useNativeDriver: true }),
              ),
            ).start()
          fin.current?.()
        },
        300 + mots.length * pas + 180,
      ),
    )
    return () => minuteurs.forEach(clearTimeout)
  }, [mots, p, reduit, secousse])
  return (
    <Animated.View
      accessible
      accessibilityRole="header"
      accessibilityLabel={texte}
      style={{ flexDirection: 'row', flexWrap: 'wrap', transform: [{ translateX: secousse }] }}
    >
      {mots.map((mot, i) => (
        <Animated.Text
          key={`${mot}-${i}`}
          accessible={false}
          style={{
            color: encre.text,
            fontFamily: GEIST.demi,
            fontSize: taille,
            lineHeight: taille * 1.1,
            letterSpacing: -taille * 0.035,
            marginRight: taille * 0.24,
            opacity: p[i],
            transform: [
              { scale: p[i]!.interpolate({ inputRange: [0, 1], outputRange: [reduit ? 1 : 1.6, 1] }) },
            ],
          }}
        >
          {mot}
        </Animated.Text>
      ))}
    </Animated.View>
  )
}

/** Un nombre qui monte, pour qu'on sente qu'il s'accumule. */
export function Compteur({
  cible,
  reduit,
  prefixe = '',
  style,
}: {
  cible: number
  reduit: boolean
  prefixe?: string
  style?: object
}) {
  const [valeur, setValeur] = useState(reduit ? cible : 0)
  useEffect(() => {
    if (reduit) {
      setValeur(cible)
      return
    }
    setValeur(0)
    const v = new Animated.Value(0)
    const id = v.addListener(({ value }) => setValeur(Math.round(value)))
    const a = Animated.timing(v, {
      toValue: cible,
      duration: lent(1500),
      delay: lent(250),
      easing: Easing.bezier(0.33, 0, 0.2, 1),
      useNativeDriver: false,
    })
    a.start()
    return () => {
      a.stop()
      v.removeListener(id)
    }
  }, [cible, reduit])
  return (
    <Text accessibilityLabel={`${prefixe}${cible}`} style={style}>
      {prefixe}
      {valeur}
    </Text>
  )
}

/** Le logo de Vethos, qui arrive — lentement, avec son poids. */
export function LogoVethos({
  taille,
  reduit,
  surArrivee,
}: {
  taille: number
  reduit: boolean
  surArrivee?: () => void
}) {
  const p = useRef(new Animated.Value(0)).current
  const fin = useRef(surArrivee)
  fin.current = surArrivee
  useEffect(() => {
    const a = Animated.timing(p, {
      toValue: 1,
      duration: reduit ? 240 : lent(780),
      delay: reduit ? 0 : lent(200),
      easing: SORTIE,
      useNativeDriver: true,
    })
    a.start(({ finished }) => {
      if (!finished) return
      toucher('verrou')
      fin.current?.()
    })
    return () => a.stop()
  }, [p, reduit])
  return (
    <Animated.View
      style={{
        alignSelf: 'center',
        opacity: p,
        transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [reduit ? 1 : 0.9, 1] }) }],
      }}
    >
      <Image
        source={require('../../assets/vethos-logo.png')}
        accessible
        accessibilityLabel="Vethos"
        resizeMode="contain"
        style={{ width: taille, height: taille }}
      />
    </Animated.View>
  )
}

/**
 * Le constat en deux temps : la reconnaissance arrive mot par mot, monte,
 * s'efface à moitié — puis « Then » la complète par la vraie question.
 */
export function ConstatEnDeux({
  reduit,
  surFin,
  taille = 40,
}: {
  reduit: boolean
  surFin: () => void
  taille?: number
}) {
  const [deuxieme, setDeuxieme] = useState(reduit)
  const monte = useRef(new Animated.Value(reduit ? 1 : 0)).current
  const fin = useRef(surFin)
  fin.current = surFin
  return (
    <View style={{ gap: 28 }}>
      <Animated.View
        style={{
          opacity: monte.interpolate({ inputRange: [0, 1], outputRange: [1, 0.38] }),
          transform: [
            { translateY: monte.interpolate({ inputRange: [0, 1], outputRange: [reduit ? 0 : 70, 0] }) },
            { scale: monte.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
          ],
          transformOrigin: 'left top',
        }}
      >
        <MotParMot
          texte="You already know what matters to you."
          reduit={reduit}
          taille={taille}
          surFin={() => {
            if (reduit) return
            setTimeout(() => {
              Animated.timing(monte, {
                toValue: 1,
                duration: lent(600),
                easing: SORTIE,
                useNativeDriver: true,
              }).start(() => setDeuxieme(true))
            }, lent(450))
          }}
        />
      </Animated.View>
      <View style={{ minHeight: taille * 2.4 }}>
        {deuxieme ? (
          <MotParMot
            texte="Then why do you keep pushing it?"
            reduit={reduit}
            taille={taille}
            delai={reduit ? 0 : 150}
            cadence={300}
            surFin={() => setTimeout(() => fin.current(), reduit ? 0 : lent(400))}
          />
        ) : null}
      </View>
    </View>
  )
}
