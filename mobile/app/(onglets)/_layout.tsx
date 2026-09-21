import { Tabs } from 'expo-router'
import { Platform, View } from 'react-native'
import { useJetons } from '@/theme/Theme'
import { GEIST } from '@/ui/primitives'
import { GlypheBlocage, GlypheEngagements, GlypheJour, GlypheReglages, GlypheTemps } from '@/ui/icones'

/**
 * Quatre destinations, les mêmes que sur le bureau.
 *
 * **Engagements réunit les trois natures** — tâches, objectifs, ancres — parce
 * qu'elles répondent à la même question : qu'est-ce que je me suis promis ? Les
 * séparer en trois écrans obligeait à faire trois voyages pour voir une seule
 * chose, et masquait que leurs lois diffèrent.
 *
 * L'onglet actif porte un FILET au-dessus, immobile. Le contrat l'exige : « la
 * navigation active utilise un filet stable, pas une capsule qui se déplace ».
 * Une capsule glissante attire l'œil sur le déplacement ; un filet dit
 * simplement où l'on est.
 */
export default function Onglets() {
  const j = useJetons()

  const glyphes = {
    index: GlypheJour,
    temps: GlypheTemps,
    engagements: GlypheEngagements,
    blocage: GlypheBlocage,
    reglages: GlypheReglages,
  } as const

  const ecran = (nom: keyof typeof glyphes, titre: string) => {
    const Glyphe = glyphes[nom]
    return (
      <Tabs.Screen
        key={nom}
        name={nom}
        options={{
          title: titre,
          tabBarIcon: ({ color, focused }) => (
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  height: 2,
                  width: 22,
                  marginBottom: 7,
                  backgroundColor: focused ? j.accent : 'transparent',
                }}
              />
              <Glyphe couleur={String(color)} taille={20} />
            </View>
          ),
        }}
      />
    )
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: j.text,
        tabBarInactiveTintColor: j.text3,
        tabBarStyle: {
          backgroundColor: j.bg,
          borderTopColor: j.line,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 64,
        },
        // Cinq onglets sur 375 px : au-dela de 10 px, « Engagements » se fait
        // tronquer par des points de suspension — et un libelle coupe est un
        // libelle qu'on ne lit plus.
        tabBarLabelStyle: { fontFamily: GEIST.moyen, fontSize: 10, marginTop: 2 },
        tabBarLabelPosition: 'below-icon' as const,
        tabBarItemStyle: { paddingTop: 8 },
      }}
    >
      {ecran('index', 'Aujourd’hui')}
      {ecran('temps', 'Mon temps')}
      {ecran('engagements', 'Engagements')}
      {ecran('blocage', 'Blocage')}
      {ecran('reglages', 'Réglages')}
    </Tabs>
  )
}
