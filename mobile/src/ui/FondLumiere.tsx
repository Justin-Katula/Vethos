/**
 * La lueur derrière Vethos : une lumière douce, de la couleur de l'heure, qui
 * se déplace d'un écran à l'autre. La maquette la dessinait en WebGL ; ici,
 * deux dégradés radiaux (le halo large et le cœur) calculés avec la MÊME
 * formule, posés sur du noir. Seules la position et l'intensité s'animent,
 * par le pilote natif ; un changement de forme se fait en fondu enchaîné.
 */
import { memo, useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import type { RVB } from './lumiere'

/** L'intensité est cuite dans le dégradé à ce niveau, puis réglée par l'opacité. */
const PLAFOND = 1.4
const DUREE = 1400
const DOUX = Easing.bezier(0.23, 1, 0.32, 1)

export type Lueur = {
  /** Position, 0..1 ; y vers le haut. */
  x: number
  y: number
  /** Intensité (0..~1.4). */
  i: number
  /** Étroitesse de la lueur : plus c'est grand, plus elle est serrée. */
  lt: number
  /** Teinte, 0..1. */
  tc: RVB
  /** Amplitude de la dérive lente (0 = immobile). */
  derive?: number
}

/** Rayon où le halo large devient invisible, en hauteurs d'écran. */
const portee = (lt: number) => Math.sqrt(4.6 / lt)

const Couche = memo(function Couche({ lt, tc, cote, id }: { lt: number; tc: RVB; cote: number; id: string }) {
  const R = portee(lt)
  const n = 14
  const couleur = `rgb(${tc.map((v) => Math.round(v * 255)).join(',')})`
  const stops = Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n
    const d2 = (t * R) ** 2
    const v = PLAFOND * (0.125 * Math.exp(-d2 * lt) + 0.14 * Math.exp(-d2 * lt * 9))
    return { t, o: Math.min(1, v) }
  })
  return (
    <Svg width={cote} height={cote}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          {stops.map((s) => (
            <Stop key={s.t} offset={s.t} stopColor={couleur} stopOpacity={s.o} />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={cote / 2} cy={cote / 2} r={cote / 2} fill={`url(#${id})`} />
    </Svg>
  )
})

export function FondLumiere({ lueur, reduit = false }: { lueur: Lueur; reduit?: boolean }) {
  const { width: W, height: H } = useWindowDimensions()
  const px = useRef(new Animated.Value(lueur.x * W)).current
  const py = useRef(new Animated.Value((1 - lueur.y) * H)).current
  const force = useRef(new Animated.Value(lueur.i / PLAFOND)).current
  const derive = useRef(new Animated.Value(0)).current
  // Deux couches au plus : la forme d'avant s'efface pendant que la nouvelle monte.
  const cle = `${lueur.lt.toFixed(2)}|${lueur.tc.map((v) => v.toFixed(2)).join(',')}`
  const [couches, setCouches] = useState([{ cle, lt: lueur.lt, tc: lueur.tc, o: new Animated.Value(1) }])

  useEffect(() => {
    const d = reduit ? 0 : DUREE
    Animated.parallel([
      Animated.timing(px, { toValue: lueur.x * W, duration: d, easing: DOUX, useNativeDriver: true }),
      Animated.timing(py, { toValue: (1 - lueur.y) * H, duration: d, easing: DOUX, useNativeDriver: true }),
      Animated.timing(force, { toValue: lueur.i / PLAFOND, duration: d, easing: DOUX, useNativeDriver: true }),
    ]).start()
  }, [H, W, force, lueur.i, lueur.x, lueur.y, px, py, reduit])

  useEffect(() => {
    setCouches((cs) => {
      if (cs[cs.length - 1]!.cle === cle) return cs
      const neuve = { cle, lt: lueur.lt, tc: lueur.tc, o: new Animated.Value(0) }
      const d = reduit ? 0 : DUREE
      Animated.timing(neuve.o, { toValue: 1, duration: d, easing: DOUX, useNativeDriver: true }).start()
      const ancienne = cs[cs.length - 1]!
      Animated.timing(ancienne.o, { toValue: 0, duration: d, easing: DOUX, useNativeDriver: true }).start(() =>
        setCouches((x) => x.filter((c) => c !== ancienne)),
      )
      return [ancienne, neuve]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  const amplitude = reduit ? 0 : (lueur.derive ?? 0)
  useEffect(() => {
    if (!amplitude) return
    const boucle = Animated.loop(
      Animated.timing(derive, { toValue: 1, duration: 48000, easing: Easing.linear, useNativeDriver: true }),
    )
    boucle.start()
    return () => boucle.stop()
  }, [amplitude, derive])

  const cote = 2 * portee(Math.min(...couches.map((c) => c.lt))) * H
  const dx = derive.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, amplitude * W, 0, -amplitude * W, 0],
  })
  const dy = derive.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [amplitude * H, 0, -amplitude * H, 0, amplitude * H],
  })

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', overflow: 'hidden' }]}>
      <Animated.View
        style={{
          position: 'absolute',
          left: -cote / 2,
          top: -cote / 2,
          width: cote,
          height: cote,
          opacity: force,
          transform: [{ translateX: Animated.add(px, dx) }, { translateY: Animated.add(py, dy) }],
        }}
      >
        {couches.map((c) => (
          <Animated.View
            key={c.cle}
            style={[StyleSheet.absoluteFill, { opacity: c.o, alignItems: 'center', justifyContent: 'center' }]}
          >
            <Couche lt={c.lt} tc={c.tc} cote={2 * portee(c.lt) * H} id={`l${c.cle.replace(/\D/g, '')}`} />
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  )
}
