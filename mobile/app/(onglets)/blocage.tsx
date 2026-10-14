/**
 * Blocking, à la Opal : trois listes, chacune montrant ce qu'elle contient
 * (icônes et noms dessinés par iOS — jamais lus par Vethos), un « × » par
 * élément et un « + ». Rien ne se modifie pendant une séance.
 *
 * - Distraction : écarté pendant les séances.
 * - Never allowed : écarté tout le temps.
 * - Always allowed : jamais écarté, même en mode profond.
 */
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBlocage } from '@/blocage/etat'
import { ListeBlocage } from '@/blocage/ListeBlocage'
import { usePlan } from '@/plan/Plan'
import { A, Carte, GEIST, TitrePage } from '@/ui/app-briques'

export default function Blocage() {
  const marges = useSafeAreaInsets()
  const { autorisation, selection, gardee, jamais, simule } = useBlocage()
  const demander = useBlocage((e) => e.demanderAutorisation)
  const { seanceEnCours } = usePlan()
  const accordee = autorisation === 'accordee' || simule
  const refusee = autorisation === 'refusee' || autorisation === 'revoquee'

  const autoriser = async () => {
    if (refusee) return void Linking.openSettings()
    await demander()
  }

  return (
    <ScrollView contentContainerStyle={{ paddingTop: marges.top + 20, paddingHorizontal: 20, paddingBottom: 120, width: '100%', maxWidth: 640, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
      <TitrePage>Blocking</TitrePage>
      <View style={{ gap: 12, marginTop: 24 }}>
        {!accordee ? (
          <Carte style={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 18, gap: 14 }}>
            <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>Screen Time</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void autoriser()}
              style={({ pressed }) => ({ height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: 'rgba(242,242,242,0.1)', alignSelf: 'flex-start', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}
            >
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>{refusee ? 'Open Settings' : 'Allow Screen Time'}</Text>
            </Pressable>
          </Carte>
        ) : null}
        <ListeBlocage role="ecarte" titre="Distraction" sous="Blocked during your sessions" selection={selection} verrou={seanceEnCours} pret={accordee} />
        <ListeBlocage role="jamais" titre="Never allowed" sous="Blocked all the time" selection={jamais} verrou={seanceEnCours} pret={accordee} />
        <ListeBlocage role="garde" titre="Always allowed" sous="Never blocked, even in deep focus" selection={gardee} verrou={seanceEnCours} pret={accordee} />
      </View>
    </ScrollView>
  )
}
