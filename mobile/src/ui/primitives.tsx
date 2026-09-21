import { type ReactNode } from 'react'
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'

/**
 * Les briques, tirées du contrat de design du bureau et de rien d'autre.
 *
 * Deux familles, deux rôles : **Geist** porte l'interface, **Geist Mono** porte
 * les heures, les durées et les totaux qui se comparent en colonne. L'identité
 * de Vethos vient de la grille, du filet et du rythme des données — jamais d'un
 * contraste décoratif de polices.
 *
 * Ce qui a été retiré de la version précédente, et pourquoi :
 *
 * - **Les cartes empilées.** Le contrat le dit : « les sections sont des mises
 *   en page sans cadre ou un seul panneau bordé ; éviter les cartes dans les
 *   cartes ». Un écran fait de cartes arrondies est un écran sans hiérarchie :
 *   tout y a le même poids. Les sections se séparent désormais par un FILET.
 * - **Le petit label au-dessus du titre.** Il n'apporte rien que le titre ne
 *   porte déjà, et il vole une ligne à chaque section.
 * - **Les gros chiffres décoratifs.** Une donnée se lit dans une colonne, pas
 *   dans une vitrine.
 */

export const GEIST = {
  normal: 'Geist_400Regular',
  moyen: 'Geist_500Medium',
  demi: 'Geist_600SemiBold',
} as const

export const MONO = {
  normal: 'GeistMono_400Regular',
  demi: 'GeistMono_600SemiBold',
} as const

/** Le titre d'écran. 22 px, medium — la taille exacte du bureau. */
export function TitreEcran({ children }: { children: ReactNode }) {
  const j = useJetons()
  return (
    <Text
      style={{
        color: j.text,
        fontFamily: GEIST.moyen,
        fontSize: 22,
        lineHeight: 28,
        letterSpacing: -0.3,
      }}
    >
      {children}
    </Text>
  )
}

/**
 * Une section : un filet au-dessus, son titre, son compte à droite.
 *
 * C'est le motif qui structure tout le bureau — `border-t border-line pt-5` —
 * et c'est lui qui remplace les cartes. Le filet sépare sans encadrer : l'œil
 * suit une colonne continue au lieu de sauter de boîte en boîte.
 */
export function Section({
  titre,
  compte,
  loi,
  action,
  children,
  premiere,
}: {
  titre: string
  /** Le nombre d'éléments, en chiffres qui s'alignent. */
  compte?: number
  /** La règle qui gouverne cette section. Le bureau l'affiche, elle instruit. */
  loi?: string
  action?: ReactNode
  children: ReactNode
  /** La première section n'a pas de filet : rien ne la précède. */
  premiere?: boolean
}) {
  const j = useJetons()
  return (
    <View
      style={{
        borderTopWidth: premiere ? 0 : 1,
        borderTopColor: j.line,
        paddingTop: premiere ? 0 : PAS[5],
        marginTop: premiere ? 0 : PAS[6],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: PAS[3],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: PAS[2], flex: 1 }}>
          <Text style={{ color: j.text, fontFamily: GEIST.demi, fontSize: 17 }}>{titre}</Text>
          {compte !== undefined ? <Valeur ton="doux">{String(compte)}</Valeur> : null}
        </View>
        {action}
      </View>

      {loi ? (
        <Text
          style={{
            color: j.text3,
            fontFamily: GEIST.normal,
            fontSize: 12.5,
            lineHeight: 18,
            marginTop: PAS[2],
          }}
        >
          {loi}
        </Text>
      ) : null}

      <View style={{ marginTop: PAS[4] }}>{children}</View>
    </View>
  )
}

export function Texte({
  children,
  ton = 'normal',
  taille = 14,
}: {
  children: ReactNode
  ton?: 'normal' | 'doux' | 'eteint' | 'accent'
  taille?: number
}) {
  const j = useJetons()
  const couleur =
    ton === 'doux' ? j.text2 : ton === 'eteint' ? j.text3 : ton === 'accent' ? j.accentEncre : j.text
  return (
    <Text style={{ color: couleur, fontFamily: GEIST.normal, fontSize: taille, lineHeight: taille * 1.45 }}>
      {children}
    </Text>
  )
}

/**
 * Une VALEUR : heure, durée, total, compte.
 *
 * Toujours en Geist Mono avec chiffres tabulaires, pour que deux nombres posés
 * l'un sous l'autre s'alignent au chiffre près. C'est la différence entre une
 * colonne qui se lit et une colonne qui se déchiffre.
 */
export function Valeur({
  children,
  taille = 13,
  ton = 'normal',
}: {
  children: ReactNode
  taille?: number
  ton?: 'normal' | 'doux' | 'accent'
}) {
  const j = useJetons()
  const couleur = ton === 'doux' ? j.text3 : ton === 'accent' ? j.accentEncre : j.text
  return (
    <Text
      style={{
        color: couleur,
        fontFamily: MONO.demi,
        fontSize: taille,
        fontVariant: ['tabular-nums'],
        letterSpacing: 0,
      }}
    >
      {children}
    </Text>
  )
}

/**
 * Le bouton principal, repris du bureau à l'identique.
 *
 * Il s'inverse — encre en fond, surface en texte — et porte un **filet rouge
 * de 2 px en bas**. C'est la signature de Vethos : le seul endroit où l'accent
 * touche un élément plein. Un bouton rouge plein serait un bouton de n'importe
 * quelle application ; celui-ci n'appartient qu'à celle-ci.
 */
export function BoutonIris({
  children,
  onPress,
  desactive,
  style,
}: {
  children: ReactNode
  onPress: () => void
  desactive?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const j = useJetons()
  return (
    <Pressable
      // Le role et l'etat DECLARES, pas devines. Une `Pressable` nue n'est
      // qu'une vue qui reagit au doigt : VoiceOver ne l'annonce pas comme un
      // bouton, et ne dit pas non plus qu'elle est desactivee — on tape sur un
      // element qui ne repond pas, sans jamais savoir pourquoi.
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive }}
      onPress={onPress}
      disabled={desactive}
      style={({ pressed }) => [
        {
          minHeight: 38,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: j.text,
          borderWidth: 1,
          borderColor: j.text,
          borderBottomWidth: 2,
          borderBottomColor: j.accent,
          borderRadius: RAYON.md,
          paddingVertical: PAS[2] + 2,
          paddingHorizontal: PAS[4],
          opacity: desactive ? 0.4 : 1,
          // Le contrat : « les contrôles enfoncés descendent légèrement ».
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        style,
      ]}
    >
      <Text style={{ color: j.surface, fontFamily: GEIST.demi, fontSize: 14 }}>{children}</Text>
    </Pressable>
  )
}

/** Le bouton secondaire : un simple contour, qui ne dispute rien au principal. */
export function BoutonPlat({
  children,
  onPress,
  desactive,
  style,
}: {
  children: ReactNode
  onPress: () => void
  desactive?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const j = useJetons()
  return (
    <Pressable
      // Le role et l'etat DECLARES, pas devines. Une `Pressable` nue n'est
      // qu'une vue qui reagit au doigt : VoiceOver ne l'annonce pas comme un
      // bouton, et ne dit pas non plus qu'elle est desactivee — on tape sur un
      // element qui ne repond pas, sans jamais savoir pourquoi.
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive }}
      onPress={onPress}
      disabled={desactive}
      style={({ pressed }) => [
        {
          minHeight: 38,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: j.lineForte,
          borderRadius: RAYON.md,
          paddingVertical: PAS[2] + 2,
          paddingHorizontal: PAS[4],
          opacity: desactive ? 0.4 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        style,
      ]}
    >
      <Text style={{ color: j.text, fontFamily: GEIST.moyen, fontSize: 14 }}>{children}</Text>
    </Pressable>
  )
}

/**
 * Une ligne de données : un filet fin au-dessus, jamais une boîte.
 *
 * C'est la brique des écrans denses. Le filet ne se pose pas sur la première
 * ligne — un séparateur qui ne sépare rien est un trait de trop.
 */
export function Rangee({
  children,
  premiere,
  onPress,
}: {
  children: ReactNode
  premiere?: boolean
  onPress?: () => void
}) {
  const j = useJetons()
  const contenu = (
    <View
      style={{
        borderTopWidth: premiere ? 0 : 1,
        borderTopColor: j.line,
        paddingVertical: PAS[3],
        flexDirection: 'row',
        alignItems: 'center',
        gap: PAS[3],
      }}
    >
      {children}
    </View>
  )
  if (!onPress) return contenu
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {contenu}
    </Pressable>
  )
}

/** Le filet nu, quand il faut séparer sans titrer. */
export function Filet({ haut = 0 }: { haut?: number }) {
  const j = useJetons()
  return <View style={{ height: 1, backgroundColor: j.line, marginVertical: haut }} />
}

export function Espace({ h }: { h: keyof typeof PAS }) {
  return <View style={{ height: PAS[h] }} />
}

/**
 * Le repère de nature d'un bloc : tâche, objectif, ancre.
 *
 * Un trait vertical de 2 px, pas une pastille colorée. Le contrat interdit les
 * bordures colorées épaisses ; un filet, lui, appartient au vocabulaire.
 */
export function Marque({ couleur, eteint }: { couleur: string; eteint?: boolean }) {
  return (
    <View
      style={{
        width: 2,
        alignSelf: 'stretch',
        minHeight: 26,
        backgroundColor: couleur,
        opacity: eteint ? 0.3 : 1,
      }}
    />
  )
}
