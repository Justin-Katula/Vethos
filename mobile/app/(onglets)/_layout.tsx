import { Tabs } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { FondLumiere } from '@/ui/FondLumiere'
import { A, FournisseurToast, GEIST, useLumiere } from '@/ui/app-briques'

/**
 * Quatre destinations, comme la maquette : Today, My time, Commitments,
 * Blocking. Le profil s'ouvre depuis l'avatar de Today ; il n'a pas d'onglet.
 * L'onglet actif porte un trait de la couleur de l'heure, qui luit un peu.
 */
const ONGLETS: { nom: string; titre: string; icone: (c: string) => React.ReactNode }[] = [
  {
    nom: 'index',
    titre: 'Today',
    icone: (c) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.75} strokeLinecap="round">
        <Circle cx={12} cy={12} r={9} />
        <Path d="M12 7v5l3 2" />
      </Svg>
    ),
  },
  {
    nom: 'temps',
    titre: 'My time',
    icone: (c) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.75} strokeLinecap="round">
        <Rect x={3.5} y={5} width={17} height={15} rx={2.5} />
        <Path d="M3.5 10h17M8 3v4M16 3v4" />
      </Svg>
    ),
  },
  {
    nom: 'engagements',
    titre: 'Commitments',
    icone: (c) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.75} strokeLinecap="round">
        <Path d="M4 7h16M4 12h11M4 17h6" />
      </Svg>
    ),
  },
  {
    nom: 'blocage',
    titre: 'Blocking',
    icone: (c) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.75} strokeLinejoin="round">
        <Path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" />
      </Svg>
    ),
  },
]

type PropsBarre = {
  state: { index: number; routes: { name: string }[] }
  navigation: { navigate: (nom: never) => void }
  teinte: string
}
function Barre({ state, navigation, teinte }: PropsBarre) {
  const marges = useSafeAreaInsets()
  const courant = state.routes[state.index]?.name
  const actif = courant === 'profil' ? 'index' : courant
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 49 + Math.max(marges.bottom, 12),
        backgroundColor: 'rgba(0,0,0,0.82)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(242,242,242,0.08)',
        flexDirection: 'row',
        paddingHorizontal: 6,
      }}
    >
      {ONGLETS.map((o) => {
        const on = actif === o.nom
        const c = on ? A.t1 : A.t3
        return (
          <Pressable
            key={o.nom}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.titre}
            onPress={() => navigation.navigate(o.nom as never)}
            style={{ flex: 1, alignItems: 'center', gap: 4, paddingTop: 10 }}
          >
            <View
              style={{
                position: 'absolute',
                top: 0,
                width: 28,
                height: 2,
                borderRadius: 1,
                backgroundColor: teinte,
                opacity: on ? 1 : 0,
                shadowColor: teinte,
                shadowOpacity: 0.9,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
            {o.icone(c)}
            <Text style={{ color: c, fontFamily: GEIST.moyen, fontSize: 10 }}>{o.titre}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function Onglets() {
  const { lueur, teinte } = useLumiere()
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FondLumiere lueur={lueur} />
      <FournisseurToast>
        <Tabs
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
          tabBar={(p) => <Barre state={p.state} navigation={p.navigation as unknown as PropsBarre['navigation']} teinte={teinte} />}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="temps" />
          <Tabs.Screen name="engagements" />
          <Tabs.Screen name="blocage" />
          <Tabs.Screen name="profil" options={{ href: null }} />
        </Tabs>
        {/* Le haut s'assombrit sous l'île, pour que rien n'y soit lu à moitié. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 60 }}>
          <Svg width="100%" height={60}>
            <Defs>
              <LinearGradient id="haut" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000" stopOpacity={0.85} />
                <Stop offset="1" stopColor="#000" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height={60} fill="url(#haut)" />
          </Svg>
        </View>
      </FournisseurToast>
    </View>
  )
}
