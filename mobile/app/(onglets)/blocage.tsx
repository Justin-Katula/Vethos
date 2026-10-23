/**
 * Blocking : une seule liste, ce qui est bloqué pendant les séances (icônes et
 * noms dessinés par iOS — jamais lus par Vethos), qui défile sur toute la
 * hauteur, un « × » par élément et un « + ». Rien ne se modifie pendant une séance.
 * La liste gardée (mode profond) reste en coulisses, sans écran.
 */
import { useEffect } from 'react'
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

  // « Never allowed » n'existe plus (2026-10-23) : une liste invisible qui bloquerait
  // tout le temps serait un piège. On la vide une fois.
  const poserJamais = useBlocage((e) => e.poserJamais)
  useEffect(() => {
    if (jamais) void poserJamais(null)
  }, [jamais, poserJamais])

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
        <ListeBlocage role="ecarte" titre="Blocked" selection={selection} verrou={seanceEnCours} pret={accordee} pleineHauteur />
      </View>
    </ScrollView>
  )
}
