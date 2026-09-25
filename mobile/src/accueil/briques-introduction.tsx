/**
 * Les briques de l'introduction, au pixel de la maquette : l'entrée (fondu +
 * 8 pt de montée, 420 ms), le bouton blanc à chevron, la ligne à cocher, les
 * titres, le pied qui s'assombrit sous les listes. Rien d'autre.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { GEIST, MONO } from '@/ui/primitives'

export const C = {
  bg: '#000000',
  s1: 'rgba(242,242,242,0.055)',
  s2: 'rgba(242,242,242,0.11)',
  s3: 'rgba(242,242,242,0.16)',
  t1: '#f2f2f2',
  t2: '#bebebe',
  t3: '#8d8d8d',
  t4: '#5e5e5e',
  gold: '#d69b3a',
}
export const SORTIE = Easing.bezier(0.23, 1, 0.32, 1)
export const DEPLACEMENT = Easing.bezier(0.77, 0, 0.175, 1)
export { GEIST, MONO }

export type Vibration = 'light' | 'medium' | 'heavy' | 'error' | 'warning' | 'success'
export function vibrer(v: Vibration) {
  const p =
    v === 'error'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      : v === 'warning'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : v === 'success'
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          : Haptics.impactAsync(
              v === 'heavy'
                ? Haptics.ImpactFeedbackStyle.Heavy
                : v === 'medium'
                  ? Haptics.ImpactFeedbackStyle.Medium
                  : Haptics.ImpactFeedbackStyle.Light,
            )
  void p.catch(() => undefined)
}

/** Reduce Motion, lu une fois puis suivi. */
export function useReduit() {
  const [reduit, setReduit] = useState(false)
  useEffect(() => {
    let vivant = true
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => vivant && setReduit(v))
    const s = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduit)
    return () => {
      vivant = false
      s.remove()
    }
  }, [])
  return reduit
}

/** vInO : fondu + montée de 8 pt (rien sous Reduce Motion), 420 ms, après `dl` ms. */
export function Entree({
  dl = 0,
  reduit = false,
  duree = 420,
  monte = 8,
  fondu = false,
  style,
  children,
}: {
  dl?: number
  reduit?: boolean
  duree?: number
  monte?: number
  /** vFade : fondu seul. */
  fondu?: boolean
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  const p = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.timing(p, {
      toValue: 1,
      duration: duree,
      delay: dl,
      easing: SORTIE,
      useNativeDriver: true,
    })
    a.start()
    return () => a.stop()
  }, [dl, duree, p])
  const dy = reduit || fondu ? 0 : monte
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: p,
          transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

/** Une valeur qui glisse vers sa cible (opacité d'un état qui change). */
export function useVers(valeur: number, duree = 530, easing = SORTIE, delai = 0) {
  const v = useRef(new Animated.Value(valeur)).current
  useEffect(() => {
    const a = Animated.timing(v, { toValue: valeur, duration: duree, delay: delai, easing, useNativeDriver: true })
    a.start()
    return () => a.stop()
  }, [delai, duree, easing, v, valeur])
  return v
}

export const T = StyleSheet.create({
  grand: { color: C.t1, fontFamily: GEIST.demi, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  titre: { color: C.t1, fontFamily: GEIST.demi, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  gris: { color: C.t3, fontFamily: GEIST.moyen, fontSize: 15, lineHeight: 21 },
  corps: { color: C.t2, fontFamily: GEIST.normal, fontSize: 17, lineHeight: 24 },
  petit: { color: C.t3, fontFamily: GEIST.moyen, fontSize: 13, lineHeight: 18 },
})

export function Titre({ children, grand = false, style }: { children: ReactNode; grand?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[grand ? T.grand : T.titre, style]}>
      {children}
    </Text>
  )
}

function Chevron({ couleur = '#000' }: { couleur?: string }) {
  return (
    <Svg width={8} height={12} viewBox="0 0 8 12" style={{ position: 'absolute', right: 20, top: 22 }}>
      <Path d="M2 1.5L6.5 6L2 10.5" fill="none" stroke={couleur} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/** Le bouton blanc : 56 pt, rayon 8, chevron à droite. */
export function Bouton({
  children,
  onPress,
  actif = true,
}: {
  children: ReactNode
  onPress: () => void
  actif?: boolean
}) {
  const op = useVers(actif ? 1 : 0.28, 210)
  return (
    <Animated.View style={{ opacity: op }} pointerEvents={actif ? 'auto' : 'none'}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !actif }}
        onPress={onPress}
        style={({ pressed }) => ({
          height: 56,
          borderRadius: 8,
          backgroundColor: C.t1,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.975 : 1 }],
        })}
      >
        <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 16 }}>{children}</Text>
        <Chevron />
      </Pressable>
    </Animated.View>
  )
}

/** Le second choix, en texte : jamais au même rang que le bouton blanc. */
export function BoutonTexte({ children, onPress, hauteur = 56 }: { children: ReactNode; onPress: () => void; hauteur?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ height: hauteur, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ color: C.t2, fontFamily: GEIST.moyen, fontSize: 15 }}>{children}</Text>
    </Pressable>
  )
}

function Indicateur({ forme, pris }: { forme: 'radio' | 'check'; pris: boolean }) {
  const fond = useVers(pris ? 1 : 0, 210)
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: forme === 'radio' ? 11 : 4,
        borderWidth: 1.5,
        borderColor: pris ? C.t1 : 'rgba(242,242,242,0.32)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.t1, opacity: fond }]} />
      <Animated.View style={{ opacity: fond }}>
        {forme === 'radio' ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#000' }} />
        ) : (
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path d="M2.2 6.3L4.9 9L9.8 3.2" fill="none" stroke="#000" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        )}
      </Animated.View>
    </View>
  )
}

/** Une réponse : toute la ligne se touche. Radio = un seul choix, case = plusieurs. */
export function Ligne({
  titre,
  sous,
  pris,
  forme,
  onPress,
}: {
  titre: string
  sous?: string
  pris: boolean
  forme: 'radio' | 'check'
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole={forme === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={forme === 'radio' ? { selected: pris } : { checked: pris }}
      accessibilityLabel={sous ? `${titre}. ${sous}` : titre}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: sous ? 64 : 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 16,
        paddingVertical: sous ? 10 : 0,
        borderRadius: 8,
        backgroundColor: pris ? C.s2 : C.s1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: C.t1, fontFamily: GEIST.moyen, fontSize: 17, lineHeight: 22 }}>{titre}</Text>
        {sous ? <Text style={{ color: C.t3, fontFamily: GEIST.normal, fontSize: 14, lineHeight: 19 }}>{sous}</Text> : null}
      </View>
      <Indicateur forme={forme} pris={pris} />
    </Pressable>
  )
}

/** Sept jours à cocher, lundi d'abord. */
export function Jours({
  valeurs,
  basculer,
  hauteur = 44,
  fond = C.s1,
}: {
  valeurs: number[]
  basculer: (i: number) => void
  hauteur?: number
  fond?: string
}) {
  const L = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const N = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {L.map((t, i) => {
        const on = !!valeurs[i]
        return (
          <Pressable
            key={i}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={N[i]}
            onPress={() => basculer(i)}
            style={({ pressed }) => ({
              flex: 1,
              height: hauteur,
              borderRadius: 8,
              backgroundColor: on ? C.t1 : fond,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Text style={{ color: on ? '#000' : C.t2, fontFamily: GEIST.demi, fontSize: hauteur > 40 ? 15 : 14 }}>{t}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Le pied des écrans qui défilent : le contenu passe dessous, dans un noir qui monte. */
export function PiedDegrade({ children, bas, dl = 700, reduit = false }: { children: ReactNode; bas: number; dl?: number; reduit?: boolean }) {
  return (
    <Entree dl={dl} reduit={reduit} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="pied" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.72} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="40" fill="url(#pied)" />
          <Rect x="0" y="40" width="100%" height="2000" fill="#000" fillOpacity={0.72} />
        </Svg>
      </View>
      <View style={{ paddingTop: 40, paddingHorizontal: 24, paddingBottom: bas, gap: 4 }}>{children}</View>
    </Entree>
  )
}

/** Un nombre qui monte (ou descend) de `de` à `a`, ease-out cubique. */
export function useCompte(a: number, { de = 0, duree = 1200, delai = 0, actif = true, reduit = false } = {}) {
  const [v, setV] = useState(actif ? de : a)
  useEffect(() => {
    if (!actif) return
    if (reduit) {
      const t = setTimeout(() => setV(a), delai)
      return () => clearTimeout(t)
    }
    setV(de)
    let t0 = 0
    let id: ReturnType<typeof setTimeout>
    const pas = () => {
      const p = Math.min(1, (Date.now() - t0) / duree)
      setV(Math.round(de + (a - de) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) id = setTimeout(pas, 30)
    }
    const d = setTimeout(() => {
      t0 = Date.now()
      pas()
    }, delai)
    return () => {
      clearTimeout(d)
      clearTimeout(id)
    }
  }, [a, actif, de, delai, duree, reduit])
  return v
}
