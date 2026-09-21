import { type ReactNode } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'

/**
 * Les briques. Tout l'écran est fait de celles-ci, et de rien d'autre.
 *
 * Une interface tient sa cohérence du fait qu'elle se répète : même palier de
 * surface, même filet, même rythme d'espacement. Dès qu'un écran invente sa
 * propre carte, l'ensemble se met à flotter.
 */

/** Un titre de section : petit, espacé, jamais criard. */
export function Sur({ children }: { children: ReactNode }) {
  const j = useJetons()
  return (
    <Text
      style={{
        color: j.text3,
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        marginBottom: PAS[3],
      }}
    >
      {children}
    </Text>
  )
}

export function Titre({ children, taille = 34 }: { children: ReactNode; taille?: number }) {
  const j = useJetons()
  return (
    <Text
      style={{
        color: j.text,
        fontSize: taille,
        fontWeight: '700',
        // Un titre large respire mieux avec un interlignage serré : au-delà,
        // les deux lignes cessent de former un seul objet.
        lineHeight: taille * 1.08,
        letterSpacing: -0.6,
      }}
    >
      {children}
    </Text>
  )
}

export function Corps({
  children,
  ton = 'normal',
}: {
  children: ReactNode
  ton?: 'normal' | 'doux' | 'accent'
}) {
  const j = useJetons()
  const couleur = ton === 'doux' ? j.text3 : ton === 'accent' ? j.accentEncre : j.text2
  return <Text style={{ color: couleur, fontSize: 14, lineHeight: 21 }}>{children}</Text>
}

/** Un panneau. Le seul conteneur de l'application. */
export function Carte({
  children,
  style,
  relief = 1,
}: {
  children: ReactNode
  style?: ViewStyle
  /** 1 = posé sur le fond, 2 = posé sur un panneau. */
  relief?: 1 | 2
}) {
  const j = useJetons()
  return (
    <View
      style={[
        {
          backgroundColor: relief === 1 ? j.surface : j.surface2,
          borderRadius: RAYON.xl,
          borderWidth: 1,
          borderColor: j.line,
          padding: PAS[5],
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function Bouton({
  children,
  onPress,
  nature = 'calme',
  desactive,
}: {
  children: ReactNode
  onPress: () => void
  nature?: 'calme' | 'accent'
  desactive?: boolean
}) {
  const j = useJetons()
  const accent = nature === 'accent'
  return (
    <Pressable
      onPress={onPress}
      disabled={desactive}
      // Le retour au doigt : l'enfoncement suffit, aucune ombre ne bouge.
      style={({ pressed }) => ({
        backgroundColor: accent ? j.accent : j.surface2,
        borderRadius: RAYON.lg,
        borderWidth: 1,
        borderColor: accent ? 'transparent' : j.line,
        paddingVertical: PAS[3] + 2,
        paddingHorizontal: PAS[5],
        alignItems: 'center',
        opacity: desactive ? 0.42 : pressed ? 0.82 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <Text
        style={{
          color: accent ? j.accentSur : j.text,
          fontSize: 15,
          fontWeight: '600',
          letterSpacing: -0.1,
        }}
      >
        {children}
      </Text>
    </Pressable>
  )
}

/** L'espace vertical, nommé plutôt que semé en marges. */
export function Espace({ h }: { h: keyof typeof PAS }) {
  return <View style={{ height: PAS[h] }} />
}

/** Un filet horizontal. */
export function Filet() {
  const j = useJetons()
  return <View style={{ height: 1, backgroundColor: j.line }} />
}

/**
 * Une pastille d'état. Trois natures seulement — c'est ce qui la rend lisible
 * d'un coup d'œil, sans légende.
 */
export function Pastille({
  children,
  nature,
}: {
  children: ReactNode
  nature: 'actif' | 'attente' | 'arrete'
}) {
  const j = useJetons()
  const fond =
    nature === 'actif' ? j.accentDoux : nature === 'attente' ? j.surface3 : 'transparent'
  const encre = nature === 'actif' ? j.accentEncre : nature === 'attente' ? j.text2 : j.text3
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: fond,
        borderRadius: RAYON.sm,
        borderWidth: nature === 'arrete' ? 1 : 0,
        borderColor: j.line,
        paddingVertical: 4,
        paddingHorizontal: PAS[2],
      }}
    >
      <Text style={{ color: encre, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
        {children}
      </Text>
    </View>
  )
}
