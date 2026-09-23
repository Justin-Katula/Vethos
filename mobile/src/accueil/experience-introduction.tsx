/**
 * Le vocabulaire partagé de l'introduction : trois niveaux de mouvement, un
 * seul système visuel qui évolue (point rouge → anneau → rail → grille).
 *
 * Règle : rien ne bouge « pour faire premium ». Une micro-réaction répond au
 * doigt, une transformation montre d'où vient la scène suivante, et les trois
 * seuls moments cinématiques (silence, anneau, placement) gardent leur poids
 * parce qu'ils sont seuls.
 */
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { THEMES } from '@/theme/jetons'
import { GEIST, MONO } from '@/ui/primitives'
import { Chevron } from '@/ui/icones'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export const encre = { ...THEMES.sombre, bg: '#000000', calme: '#0a0a0a', nuit: '#050505' }

/** Les trois niveaux, et rien entre eux. Ralentis de 40 % à la demande de l'auteur. */
export const LENTEUR = 1.4
export const DUREE = {
  micro: Math.round(150 * LENTEUR),
  ui: Math.round(380 * LENTEUR),
  entree: Math.round(300 * LENTEUR),
  cinema: Math.round(820 * LENTEUR),
  reduit: 120,
} as const
/** Entrée : démarre vite, se pose sans rebond. */
export const SORTIE = Easing.bezier(0.23, 1, 0.32, 1)
/** Déplacement fonctionnel à l'écran : accélère puis décélère. */
export const DEPLACEMENT = Easing.bezier(0.77, 0, 0.175, 1)

export function toucher(force: 'choix' | 'leger' | 'verrou' = 'choix') {
  const promesse =
    force === 'choix'
      ? Haptics.selectionAsync()
      : Haptics.impactAsync(
          force === 'verrou'
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        )
  void promesse.catch(() => undefined)
}

export function useAccessibiliteIntro() {
  const [reduit, setReduit] = useState(false)
  const [lecteur, setLecteur] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduit)
    void AccessibilityInfo.isScreenReaderEnabled().then(setLecteur)
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduit)
    const voix = AccessibilityInfo.addEventListener('screenReaderChanged', setLecteur)
    return () => {
      motion.remove()
      voix.remove()
    }
  }, [])
  return { reduit, lecteur }
}

/** Une transformation de mise en page (carte qui s'étend, rail qui devient grille). */
export function morpher(reduit: boolean) {
  if (Platform.OS === 'web') return
  LayoutAnimation.configureNext(
    reduit
      ? {
          duration: DUREE.reduit,
          create: { type: 'easeOut', property: 'opacity' },
          delete: { type: 'easeOut', property: 'opacity' },
        }
      : {
          duration: DUREE.ui,
          update: { type: 'spring', springDamping: 1 },
          create: { type: 'easeOut', property: 'opacity', duration: 240 },
          delete: { type: 'easeOut', property: 'opacity', duration: DUREE.micro },
        },
  )
}

/**
 * Un fondu court. Déplacement de 6 au plus : assez pour dire « ça arrive »,
 * jamais assez pour faire une glissade. Sous Reduce Motion, opacité seule.
 */
export function Apparaitre({
  children,
  reduit,
  delai = 0,
  duree = DUREE.entree,
  decalage = 6,
  style,
}: {
  children: ReactNode
  reduit: boolean
  delai?: number
  duree?: number
  decalage?: number
  style?: StyleProp<ViewStyle>
}) {
  const p = useRef(new Animated.Value(0)).current
  useEffect(() => {
    p.setValue(0)
    const animation = Animated.timing(p, {
      toValue: 1,
      duration: reduit ? DUREE.reduit : duree,
      delay: delai,
      easing: SORTIE,
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [delai, duree, p, reduit])
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: p,
          transform: [
            {
              translateY: p.interpolate({
                inputRange: [0, 1],
                outputRange: [reduit ? 0 : decalage, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

export function PageIntro({
  children,
  footer,
  centre = false,
  haut = 22,
  defiler = true,
}: {
  children: ReactNode
  footer?: ReactNode
  centre?: boolean
  haut?: number
  defiler?: boolean
}) {
  const contenu = { flexGrow: 1, justifyContent: centre ? 'center' : 'flex-start', gap: 26 } as const
  return (
    <View style={{ flex: 1 }}>
      {defiler ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            ...contenu,
            paddingHorizontal: 26,
            paddingTop: haut,
            paddingBottom: 24,
          }}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ ...contenu, flex: 1, paddingHorizontal: 26, paddingTop: haut }}>
          {children}
        </View>
      )}
      {footer ? <View style={{ paddingHorizontal: 26, paddingTop: 10, gap: 6 }}>{footer}</View> : null}
    </View>
  )
}

export function TitreIntro({
  children,
  grand = false,
  centre = false,
}: {
  children: ReactNode
  grand?: boolean
  centre?: boolean
}) {
  return (
    <Text
      accessibilityRole="header"
      style={[
        styles.titre,
        {
          fontSize: grand ? 40 : 31,
          lineHeight: grand ? 45 : 37,
          letterSpacing: grand ? -1.2 : -0.9,
          textAlign: centre ? 'center' : 'left',
        },
      ]}
    >
      {children}
    </Text>
  )
}
export function CorpsIntro({ children, centre = false }: { children: ReactNode; centre?: boolean }) {
  return <Text style={[styles.corps, { textAlign: centre ? 'center' : 'left' }]}>{children}</Text>
}

export function ActionIntro({
  children,
  onPress,
  disabled = false,
  secondaire = false,
}: {
  children: string
  onPress: () => void
  disabled?: boolean
  secondaire?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        toucher()
        onPress()
      }}
      style={({ pressed }) => [
        secondaire ? styles.actionSecondaire : styles.action,
        {
          backgroundColor: secondaire ? 'transparent' : encre.text,
          opacity: disabled ? 0.28 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.975 : 1 }],
        },
      ]}
    >
      <Text
        style={{
          flex: secondaire ? undefined : 1,
          textAlign: secondaire ? 'center' : 'left',
          color: secondaire ? encre.text2 : encre.bg,
          fontFamily: secondaire ? GEIST.moyen : GEIST.demi,
          fontSize: secondaire ? 15 : 16,
        }}
      >
        {children}
      </Text>
      {!secondaire ? <Chevron taille={18} couleur={encre.bg} /> : null}
    </Pressable>
  )
}

/**
 * Le seul trait permanent : une progression. Une ligne a le droit d'exister
 * parce qu'elle mesure quelque chose. Elle disparaît pendant les silences.
 */
export function BarreIntro({
  etapeActuelle,
  total,
  retour,
  quitter,
  visible = true,
  reduit,
}: {
  etapeActuelle: number
  total: number
  retour?: () => void
  quitter?: () => void
  visible?: boolean
  reduit: boolean
}) {
  const avance = useRef(new Animated.Value((etapeActuelle + 1) / total)).current
  const presence = useRef(new Animated.Value(visible ? 1 : 0)).current
  useEffect(() => {
    const a = Animated.parallel([
      Animated.timing(avance, {
        toValue: (etapeActuelle + 1) / total,
        duration: reduit ? 0 : DUREE.ui,
        easing: SORTIE,
        useNativeDriver: true,
      }),
      Animated.timing(presence, {
        toValue: visible ? 1 : 0,
        duration: reduit ? DUREE.reduit : 260,
        easing: SORTIE,
        useNativeDriver: true,
      }),
    ])
    a.start()
    return () => a.stop()
  }, [avance, etapeActuelle, presence, reduit, total, visible])
  const [largeur, setLargeur] = useState(0)
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        opacity: presence,
        paddingHorizontal: 26,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      {retour ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => {
            toucher()
            retour()
          }}
          style={{ width: 36, height: 44, justifyContent: 'center' }}
        >
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <Chevron couleur={encre.text2} taille={17} />
          </View>
        </Pressable>
      ) : (
        <Image
          source={require('../../assets/vethos-logo.png')}
          accessible
          accessibilityLabel="Vethos"
          resizeMode="contain"
          style={{ width: 28, height: 28 }}
        />
      )}
      <View
        accessible
        accessibilityLabel={`Step ${etapeActuelle + 1} of ${total}`}
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: encre.surface2, overflow: 'hidden' }}
      >
        <Animated.View
          style={{
            width: largeur,
            height: 2,
            backgroundColor: encre.text,
            transform: [
              { translateX: avance.interpolate({ inputRange: [0, 1], outputRange: [-largeur, 0] }) },
            ],
          }}
        />
      </View>
      {quitter ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close introduction replay"
          onPress={quitter}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}
        >
          <Text style={{ color: encre.text2, fontFamily: GEIST.normal, fontSize: 13 }}>Close</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  )
}

/**
 * Un choix. La sélection répond en 150 ms : fond relevé, bord net, et les
 * autres s'effacent si le parent le demande (`attenue`).
 */
export function ChoixIntro({
  titre,
  detail,
  selected,
  attenue = false,
  onPress,
  style,
  compact = false,
  role = 'radio',
}: {
  titre: string
  detail?: string
  selected: boolean
  attenue?: boolean
  onPress: () => void
  style?: StyleProp<ViewStyle>
  compact?: boolean
  role?: 'radio' | 'checkbox'
}) {
  const s = useRef(new Animated.Value(selected ? 1 : 0)).current
  const a = useRef(new Animated.Value(attenue ? 1 : 0)).current
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(s, { toValue: selected ? 1 : 0, duration: DUREE.micro, easing: SORTIE, useNativeDriver: true }),
      Animated.timing(a, { toValue: attenue ? 1 : 0, duration: 180, easing: SORTIE, useNativeDriver: true }),
    ])
    anim.start()
    return () => anim.stop()
  }, [a, attenue, s, selected])
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.34] }),
          transform: [{ scale: s.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] }) }],
        },
      ]}
    >
      <Pressable
        accessibilityRole={role}
        accessibilityLabel={detail ? `${titre}. ${detail}` : titre}
        accessibilityState={{ checked: selected }}
        onPress={() => {
          toucher()
          onPress()
        }}
        style={({ pressed }) => ({
          flex: 1,
          justifyContent: 'center',
          gap: 5,
          paddingHorizontal: 18,
          paddingVertical: compact ? 14 : 17,
          minHeight: compact ? 54 : 64,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: selected ? encre.text : 'rgba(242, 242, 242, 0.09)',
          backgroundColor: selected ? encre.surface2 : pressed ? encre.surface : encre.calme,
          transform: [{ scale: pressed ? 0.975 : 1 }],
        })}
      >
        <Text style={{ fontFamily: selected ? GEIST.demi : GEIST.moyen, fontSize: 16, color: encre.text }}>
          {titre}
        </Text>
        {detail ? (
          <Text style={{ fontFamily: GEIST.normal, color: encre.text3, fontSize: 13, lineHeight: 18 }}>
            {detail}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

export const ChampIntro = forwardRef<
  TextInput,
  {
    label: string
    valeur: string
    changer: (v: string) => void
    placeholder?: string
    maxLength?: number
    nombre?: boolean
    grand?: boolean
    labelVisible?: boolean
    autoFocus?: boolean
    onSubmit?: () => void
  }
>(function ChampIntro(
  {
    label,
    valeur,
    changer,
    placeholder,
    maxLength = 60,
    nombre = false,
    grand = false,
    labelVisible = true,
    autoFocus = false,
    onSubmit,
  },
  ref,
) {
  const [focus, setFocus] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      {labelVisible ? (
        <Text style={{ color: encre.text3, fontFamily: GEIST.normal, fontSize: 13 }}>{label}</Text>
      ) : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        value={valeur}
        onChangeText={changer}
        placeholder={placeholder}
        placeholderTextColor="#5c5c5c"
        selectionColor={encre.accentEncre}
        cursorColor={encre.accentEncre}
        autoCorrect={false}
        autoComplete="off"
        autoFocus={autoFocus}
        textContentType="none"
        importantForAutofill="no"
        keyboardAppearance="dark"
        maxLength={maxLength}
        keyboardType={nombre ? 'numbers-and-punctuation' : 'default'}
        returnKeyType={onSubmit ? 'next' : 'done'}
        onSubmitEditing={onSubmit}
        submitBehavior={onSubmit ? 'submit' : 'blurAndSubmit'}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          minHeight: grand ? 64 : 50,
          borderBottomWidth: 1,
          borderBottomColor: focus ? encre.text2 : encre.lineForte,
          paddingVertical: 8,
          color: encre.text,
          fontFamily: grand ? GEIST.moyen : MONO.normal,
          fontSize: grand ? 32 : 22,
          letterSpacing: grand ? -0.8 : 0,
        }}
      />
    </View>
  )
})

const NOMS_JOURS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export function JoursIntro({ jours, changer }: { jours: number[]; changer: (j: number[]) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {[1, 2, 3, 4, 5, 6, 0].map((jour) => {
        const pris = jours.includes(jour)
        return (
          <Pressable
            key={jour}
            accessibilityRole="checkbox"
            accessibilityLabel={NOMS_JOURS[jour]}
            accessibilityState={{ checked: pris }}
            onPress={() => {
              toucher()
              changer(pris ? jours.filter((j) => j !== jour) : [...jours, jour].sort())
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: pris ? encre.text : encre.surface2,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            <Text style={{ fontFamily: GEIST.moyen, fontSize: 13, color: pris ? encre.bg : encre.text3 }}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][jour]}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Petites pastilles de valeurs rapides : 30 min, 1 h… */
export function Pastilles<T extends number | string>({
  options,
  valeur,
  changer,
  libelle,
  accessibilite,
}: {
  options: readonly T[]
  valeur: T
  changer: (v: T) => void
  libelle: (v: T) => string
  accessibilite?: (v: T) => string
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => {
        const pris = o === valeur
        return (
          <Pressable
            key={String(o)}
            accessibilityRole="radio"
            accessibilityLabel={accessibilite ? accessibilite(o) : libelle(o)}
            accessibilityState={{ checked: pris }}
            onPress={() => {
              toucher()
              changer(o)
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pris ? encre.text : encre.surface2,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: pris ? encre.bg : encre.text2 }}>
              {libelle(o)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export const styles = StyleSheet.create({
  titre: { color: encre.text, fontFamily: GEIST.demi },
  corps: { color: encre.text2, fontFamily: GEIST.normal, fontSize: 16, lineHeight: 23 },
  action: {
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSecondaire: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  aide: { color: encre.text3, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 17 },
  etiquette: { color: encre.text3, fontFamily: MONO.normal, fontSize: 11, letterSpacing: 1.2 },
  etiquetteChamp: { color: encre.text3, fontFamily: GEIST.normal, fontSize: 13 },
  aideCentree: { color: encre.text3, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
