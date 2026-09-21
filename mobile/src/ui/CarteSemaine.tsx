import { Pressable, ScrollView, Text, View } from 'react-native'
import type { JourTemps, NatureTemps } from '@/plan/lecture'
import { dateLocale } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'
import { couleurTemps, nomsTemps } from './temps-visuel'

const H = 224

export function CarteSemaine({ jours, selection, surSelection, aujourdHui, minute }: {
  jours: readonly JourTemps[]; selection: string; surSelection: (date: string) => void;
  aujourdHui: string; minute: number
}) {
  const j = useJetons()
  const natures = ['sleep', 'fixed', 'task', 'objective', 'ancre'] as NatureTemps[]
  return <View>
    <View style={{ flexDirection: 'row', marginTop: 24 }}>
      <View style={{ width: 28, marginTop: 64, height: H }}>
        {[0, 6, 12, 18, 24].map((h) => <Text key={h} style={{ position: 'absolute', top: h / 24 * H - 6,
          fontFamily: MONO.normal, fontSize: 11, color: j.text2 }}>{String(h).padStart(2, '0')}</Text>)}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} style={{ flex: 1 }}>
        {jours.map((jour) => {
          const date = dateLocale(jour.date)
          const choisi = selection === jour.date
          const maintenant = aujourdHui === jour.date
          return <Pressable key={jour.date} accessibilityRole="button"
            accessibilityState={{ selected: choisi }}
            accessibilityLabel={`${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${jour.segments.filter((s) => s.nature !== 'sleep').length} engagements`}
            onPress={() => surSelection(jour.date)}
            style={({ pressed }) => ({ flex: 1, minWidth: 44, alignItems: 'center', opacity: pressed ? 0.65 : 1 })}>
            <View style={{ minHeight: 60, alignItems: 'center', gap: 7 }}>
              <Text style={{ fontFamily: GEIST.normal, color: j.text2, fontSize: 12 }}>{date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</Text>
              <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: choisi ? j.text : 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontFamily: GEIST.demi, fontSize: 15, color: choisi ? j.bg : maintenant ? j.accentEncre : j.text }}>{date.getDate()}</Text>
              </View>
            </View>
            <View style={{ height: H, width: 25, marginTop: 4, backgroundColor: j.surface2, borderRadius: 5, overflow: 'hidden' }}>
              {jour.segments.map((s) => <View key={`${s.nature}-${s.id}`} style={{ position: 'absolute',
                left: s.nature === 'sleep' ? 8 : 0, right: s.nature === 'sleep' ? 8 : 0, top: s.debut / 1440 * H, height: (s.fin - s.debut) / 1440 * H,
                backgroundColor: couleurTemps(s.nature, j), borderTopWidth: s.nature === 'sleep' ? 0 : 1, borderTopColor: j.bg }} />)}
              {[6, 12, 18].map((h) => <View key={h} style={{ position: 'absolute', left: 0, right: 0, top: h / 24 * H, height: 1, backgroundColor: j.lineForte }} />)}
              {maintenant && <View style={{ position: 'absolute', left: 0, right: 0, top: minute / 1440 * H, height: 2, backgroundColor: j.accentEncre }} />}
            </View>
            <View style={{ height: 4, width: 4, borderRadius: 2, marginTop: 10, backgroundColor: choisi ? j.accentEncre : 'transparent' }} />
          </Pressable>
        })}
      </ScrollView>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, marginTop: 20 }}>
      {natures.filter((nature) => nature === 'sleep' || jours.some((jour) => jour.segments.some((s) => s.nature === nature))).map((nature) =>
        <View key={nature} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: couleurTemps(nature, j) }} />
          <Text style={{ fontFamily: GEIST.normal, fontSize: 11, color: j.text2 }}>{nomsTemps[nature]}</Text>
        </View>)}
    </View>
  </View>
}
