/**
 * Les briques des pages de l'app, telles que la maquette les dessine : la
 * lumière de l'heure, le toast, la feuille qui monte, la carte arrondie.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { accentApp, heureDecimale, lumiere, teinteApp } from './lumiere'
import type { Lueur } from './FondLumiere'
import { GEIST, MONO } from './primitives'

export const A = {
  t1: '#f2f2f2',
  t2: '#bebebe',
  t3: '#8d8d8d',
  t4: '#5e5e5e',
  s: 'rgba(242,242,242,0.08)',
  s1: 'rgba(242,242,242,0.055)',
  ligne: 'rgba(242,242,242,0.07)',
  rouge: '#f0525f',
}
export { GEIST, MONO }
export const SORTIE = Easing.bezier(0.23, 1, 0.32, 1)
/** Les couleurs des natures, partout dans l'app. */
export const TYPEC = { TASK: '#505359', GOAL: '#e03131', ANCHOR: '#2c3a56' } as const
/** Sur un trait fin, les natures remontent d'un ton. */
export const TRAIT = { TASK: '#8d8d8d', GOAL: '#e03131', ANCHOR: '#4b6190' } as const
export type NatureApp = keyof typeof TYPEC
export const natureDe = (kind: string): NatureApp | null =>
  kind === 'task' ? 'TASK' : kind === 'objective' ? 'GOAL' : kind === 'ancre' || kind === 'anchor' ? 'ANCHOR' : null

/** La lumière de l'heure, rafraîchie chaque minute. */
export function useLumiere() {
  const [H, setH] = useState(heureDecimale())
  useEffect(() => {
    const t = setInterval(() => setH(heureDecimale()), 60000)
    return () => clearInterval(t)
  }, [])
  const L = lumiere(H)
  const lueur: Lueur = { x: L.lp[0], y: L.lp[1], i: L.li, lt: L.lt, tc: L.tc }
  return { H, acc: accentApp(H), teinte: teinteApp(H), lueur }
}

// ——— Le toast ———

const Toaster = createContext<(t: string) => void>(() => undefined)
export const useToast = () => useContext(Toaster)

export function FournisseurToast({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ t: string; k: number } | null>(null)
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null)
  const p = useRef(new Animated.Value(0)).current
  const dire = (texte: string) => {
    if (minuterie.current) clearTimeout(minuterie.current)
    setT({ t: texte, k: Date.now() })
    p.setValue(0)
    Animated.timing(p, { toValue: 1, duration: 260, easing: SORTIE, useNativeDriver: true }).start()
    minuterie.current = setTimeout(() => setT(null), 2400)
  }
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current) }, [])
  return (
    <Toaster.Provider value={dire}>
      {children}
      {t ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: 100,
            alignItems: 'center',
            zIndex: 70,
            opacity: p,
            transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
          }}
        >
          <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: 'rgba(242,242,242,0.1)' }}>
            <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 13, lineHeight: 18 }}>{t.t}</Text>
          </View>
        </Animated.View>
      ) : null}
    </Toaster.Provider>
  )
}

// ——— La carte et la feuille ———

export function Carte({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          borderRadius: 28,
          backgroundColor: 'rgba(242,242,242,0.03)',
          borderWidth: 1,
          borderColor: 'rgba(242,242,242,0.05)',
          borderTopColor: 'rgba(242,242,242,0.1)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** Une feuille qui monte du bas, arrondie à 40, sur un voile. */
export function Feuille({
  ouverte,
  fermer,
  children,
  voile = true,
  style,
}: {
  ouverte: boolean
  fermer: () => void
  children: ReactNode
  voile?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const marges = useSafeAreaInsets()
  const p = useRef(new Animated.Value(0)).current
  const [monte, setMonte] = useState(ouverte)
  useEffect(() => {
    if (ouverte) setMonte(true)
    Animated.timing(p, { toValue: ouverte ? 1 : 0, duration: 440, easing: SORTIE, useNativeDriver: true }).start(() => {
      if (!ouverte) setMonte(false)
    })
  }, [ouverte, p])
  if (!monte) return null
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={fermer}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={StyleSheet.absoluteFill} pointerEvents={ouverte ? 'auto' : 'none'}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: voile ? 'rgba(0,0,0,0.45)' : 'transparent', opacity: p }]}>
            <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={fermer} />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={[
              {
                position: 'absolute',
                left: 8,
                right: 8,
                bottom: Math.max(8, marges.bottom - 26),
                borderRadius: 40,
                backgroundColor: 'rgba(22,22,22,0.97)',
                borderTopWidth: 1,
                borderTopColor: 'rgba(242,242,242,0.08)',
                paddingTop: 14,
                maxHeight: '92%',
                transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [900, 0] }) }],
              },
              style,
            ]}
          >
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(242,242,242,0.2)', alignSelf: 'center', marginBottom: 16 }} />
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export function BoutonFermer({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      hitSlop={8}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: A.s, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={10} height={10} viewBox="0 0 10 10">
        <Path d="M1 1l8 8M9 1L1 9" stroke={A.t2} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    </Pressable>
  )
}

export function Plus({ taille = 12, couleur = A.t1 }: { taille?: number; couleur?: string }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 14 14">
      <Path d="M7 1v12M1 7h12" stroke={couleur} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}
export function Chevron({ couleur = A.t2, sens = 'droite', taille = 12 }: { couleur?: string; sens?: 'droite' | 'gauche' | 'bas'; taille?: number }) {
  if (sens === 'bas')
    return (
      <Svg width={taille} height={taille * 0.67} viewBox="0 0 12 8">
        <Path d="M1.5 2L6 6.5L10.5 2" fill="none" stroke={couleur} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  return (
    <Svg width={taille * 0.6} height={taille} viewBox="0 0 8 14">
      <Path
        d={sens === 'gauche' ? 'M6.5 1.5L1.5 7l5 5.5' : 'M1.5 1.5L6.5 7l-5 5.5'}
        fill="none"
        stroke={couleur}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
export function Cadenas({ taille = 12, couleur = A.t2, epais = 2.2 }: { taille?: number; couleur?: string; epais?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={epais} strokeLinecap="round">
      <Path d="M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  )
}
export function Lune({ taille = 12, couleur = A.t2 }: { taille?: number; couleur?: string }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={2} strokeLinejoin="round">
      <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Svg>
  )
}

/** Le titre d'une page : 32 pt. */
export function TitrePage({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 32, lineHeight: 38, letterSpacing: -0.8 }}>
      {children}
    </Text>
  )
}

export function BoutonBlanc({ children, onPress, actif = true, hauteur = 52 }: { children: ReactNode; onPress: () => void; actif?: boolean; hauteur?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !actif }}
      disabled={!actif}
      onPress={onPress}
      style={({ pressed }) => ({
        height: hauteur,
        borderRadius: 8,
        backgroundColor: A.t1,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: actif ? 1 : 0.4,
        transform: [{ scale: pressed ? 0.975 : 1 }],
      })}
    >
      <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 16 }}>{children}</Text>
    </Pressable>
  )
}

export const hm = (m: number) => {
  const v = Math.max(0, Math.round(m))
  if (v < 60) return `${v} min`
  return `${Math.floor(v / 60)} h${v % 60 ? ` ${String(v % 60).padStart(2, '0')}` : ''}`
}
export const fmt = (m: number) => {
  const v = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}
