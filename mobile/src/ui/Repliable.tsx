import { useState, type ReactNode } from 'react'
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from 'react-native'
import { useJetons } from '@/theme/Theme'
import { MOUVEMENT, PAS, RAYON } from '@/theme/jetons'
import { Chevron } from './icones'
import { GEIST, MONO } from './primitives'

/**
 * Une section repliée par défaut.
 *
 * L'en-tête porte déjà la réponse — « 6 h 40 disponibles », « 4 créneaux sur
 * la semaine ». On ne l'ouvre que si on veut le détail. Tout afficher d'un
 * coup, ce n'est pas informer : c'est se décharger sur le lecteur.
 *
 * Sur un téléphone l'argument est plus fort encore — ce qui n'est pas replié
 * repousse tout le reste hors de l'écran.
 */

// Sans cet appel, l'animation de dépliage n'existe simplement pas sur Android :
// la vue saute d'une hauteur à l'autre, et un saut se lit comme un défaut.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export function Repliable({
  titre,
  resume,
  ouvertParDefaut = false,
  children,
}: {
  titre: string
  /** La réponse courte, lisible sans ouvrir. En chiffres alignés. */
  resume?: string
  ouvertParDefaut?: boolean
  children: ReactNode
}) {
  const j = useJetons()
  const [ouvert, setOuvert] = useState(ouvertParDefaut)

  const basculer = () => {
    LayoutAnimation.configureNext({
      duration: MOUVEMENT.normal,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    })
    setOuvert((v) => !v)
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: j.line,
        borderRadius: RAYON.lg,
        backgroundColor: j.surface,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: ouvert }}
        accessibilityLabel={resume ? `${titre}, ${resume}` : titre}
        onPress={basculer}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: PAS[3],
          paddingHorizontal: PAS[4],
          minHeight: 52,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ transform: [{ rotate: ouvert ? '90deg' : '0deg' }] }}>
          <Chevron couleur={j.text3} taille={14} />
        </View>
        <Text style={{ flex: 1, fontFamily: GEIST.moyen, fontSize: 14.5, color: j.text }}>{titre}</Text>
        {resume ? (
          <Text
            numberOfLines={1}
            style={{ fontFamily: MONO.normal, fontSize: 11.5, color: j.text3, fontVariant: ['tabular-nums'] }}
          >
            {resume}
          </Text>
        ) : null}
      </Pressable>

      {ouvert ? (
        <View style={{ borderTopWidth: 1, borderTopColor: j.line, padding: PAS[4] }}>{children}</View>
      ) : null}
    </View>
  )
}
