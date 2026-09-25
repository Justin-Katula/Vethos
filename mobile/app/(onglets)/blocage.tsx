/** Blocking, dans la forme de la maquette. iOS ne donne que des jetons opaques : on montre les vrais compteurs. */
import { useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBlocage } from '@/blocage/etat'
import { SelecteurApplications } from '@/blocage/SelecteurApplications'
import { selectionEstVide } from '@/blocage/contrat'
import { A, Cadenas, Carte, GEIST, MONO, Plus, TitrePage } from '@/ui/app-briques'

function Pilule({ children, onPress, plein = true }: { children: React.ReactNode; onPress: () => void; plein?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 16,
        borderRadius: 18,
        backgroundColor: plein ? 'rgba(242,242,242,0.1)' : 'transparent',
        borderWidth: plein ? 0 : 1,
        borderColor: 'rgba(242,242,242,0.2)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {children}
    </Pressable>
  )
}

export default function Blocage() {
  const marges = useSafeAreaInsets()
  const { autorisation, selection, simule } = useBlocage()
  const demander = useBlocage((e) => e.demanderAutorisation)
  const choisir = useBlocage((e) => e.choisirApplications)
  const [selecteur, setSelecteur] = useState(false)
  const accordee = autorisation === 'accordee'
  const refusee = autorisation === 'refusee' || autorisation === 'revoquee'
  const vide = !selection || selectionEstVide(selection)
  const ouvrir = async () => {
    if (!accordee) {
      if (refusee) {
        void Linking.openSettings()
        return
      }
      await demander()
      if (useBlocage.getState().autorisation !== 'accordee') return
    }
    if (simule) void choisir()
    else setSelecteur(true)
  }
  const chiffres: [string, number][] = selection
    ? [
        ['apps', selection.nbApplications],
        ['categories', selection.nbCategories],
        ['sites', selection.nbSitesWeb],
      ]
    : []
  const total = selection ? selection.nbApplications + selection.nbCategories + selection.nbSitesWeb : 0

  return (
    <ScrollView contentContainerStyle={{ paddingTop: marges.top + 20, paddingHorizontal: 20, paddingBottom: 120, width: '100%', maxWidth: 640, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
      <TitrePage>Blocking</TitrePage>
      <View style={{ gap: 12, marginTop: 24 }}>
        <Carte style={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingBottom: 10 }}>
            <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>Blocked apps</Text>
            <Text style={{ color: A.t4, fontFamily: GEIST.moyen, fontSize: 15 }}>{total}</Text>
          </View>
          {!accordee ? (
            <View style={{ paddingTop: 14, borderTopWidth: 1, borderTopColor: A.ligne }}>
              <Pilule onPress={() => void ouvrir()}>
                <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>{refusee ? 'Open Settings' : 'Allow Screen Time'}</Text>
              </Pilule>
            </View>
          ) : vide ? (
            <View style={{ paddingTop: 14, borderTopWidth: 1, borderTopColor: A.ligne }}>
              <Pilule onPress={() => void ouvrir()}>
                <Plus />
                <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>Pick my apps</Text>
              </Pilule>
            </View>
          ) : (
            <View style={{ borderTopWidth: 1, borderTopColor: A.ligne }}>
              {chiffres.map(([k, v], i) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: A.ligne }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: A.s, alignItems: 'center', justifyContent: 'center' }}>
                    <Cadenas taille={14} couleur={v ? A.t1 : A.t4} />
                  </View>
                  <Text style={{ flex: 1, color: v ? A.t1 : A.t4, fontFamily: GEIST.demi, fontSize: 16 }}>{k[0]!.toUpperCase() + k.slice(1)}</Text>
                  <Text style={{ color: v ? A.t1 : A.t4, fontFamily: MONO.normal, fontSize: 16 }}>{v}</Text>
                </View>
              ))}
              <View style={{ marginTop: 8 }}>
                <Pilule onPress={() => void ouvrir()}>
                  <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>Change my selection</Text>
                </Pilule>
              </View>
            </View>
          )}
        </Carte>

        <Carte style={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 18 }}>
          <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>Installed apps</Text>
          <View style={{ marginTop: 14 }}>
            <Pilule plein={false} onPress={() => void ouvrir()}>
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>Browse my apps</Text>
            </Pilule>
          </View>
        </Carte>
      </View>
      <SelecteurApplications
        ouvert={selecteur}
        surFermeture={() => setSelecteur(false)}
      />
    </ScrollView>
  )
}
