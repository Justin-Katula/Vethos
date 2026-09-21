import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlan } from '@/plan/Plan'
import { duree, enHeure, segmentActuel } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { Horloge } from '@/ui/Horloge'
import { AgendaJour } from '@/ui/AgendaJour'
import { Chevron, Plus } from '@/ui/icones'
import { GEIST, MONO } from '@/ui/primitives'

export default function Aujourdhui() {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const routeur = useRouter()
  const { jours, minute, maintenant, chargees } = usePlan()
  const jour = jours[0]
  if (!jour || !chargees) return <View style={{ flex: 1, backgroundColor: j.bg }} accessibilityLabel="Chargement du planning" />
  const actuel = segmentActuel(jour.segments, minute)
  const suivant = jour.segments.find((s) => s.nature !== 'sleep' && s.debut > minute)
  const actif = actuel && actuel.nature !== 'sleep' ? actuel : suivant
  return <ScrollView style={{ flex: 1, backgroundColor: j.bg }} contentContainerStyle={{ paddingTop: marges.top + 20, paddingBottom: 36, paddingHorizontal: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontFamily: GEIST.demi, fontSize: 30, letterSpacing: -0.8, color: j.text }}>Aujourd’hui</Text>
        <Text style={{ fontFamily: GEIST.normal, color: j.text2, fontSize: 14 }}>{maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ajouter un engagement" onPress={() => routeur.push('/engagements')}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 8, backgroundColor: j.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Plus couleur={j.text} taille={20} />
      </Pressable>
    </View>
    <Horloge jour={jour} minute={minute} />
    <View style={{ paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: j.line, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: j.accentEncre }} />
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 12, color: j.text2 }}>{actif === actuel ? 'En cours' : actif ? 'À suivre' : 'À ton rythme'}</Text>
        {actif && <Text style={{ marginLeft: 'auto', fontFamily: MONO.normal, fontSize: 12, color: j.text2 }}>{enHeure(actif.debut)}–{enHeure(actif.fin)}</Text>}
      </View>
      <Text style={{ fontFamily: GEIST.moyen, fontSize: 22, letterSpacing: -0.4, color: j.text }}>{actif?.titre ?? (actuel?.nature === 'sleep' ? 'La nuit est à toi.' : 'Du temps pour toi.')}</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
      <Text style={{ fontFamily: GEIST.demi, fontSize: 18, color: j.text }}>Ta journée</Text>
      <Pressable accessibilityRole="button" onPress={() => routeur.push('/temps')}
        style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', opacity: pressed ? 0.5 : 1 })}>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 13, color: j.text2 }}>La semaine</Text><Chevron couleur={j.text2} taille={14} />
      </Pressable>
    </View>
    <AgendaJour segments={jour.segments} minute={minute} vide="Aucun engagement aujourd’hui." />
    {jour.travail > 0 && <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: j.text2, marginTop: 16 }}>{duree(jour.travail)} de travail planifié</Text>}
  </ScrollView>
}
