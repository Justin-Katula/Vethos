import { Text, View } from 'react-native'
import type { SegmentTemps } from '@/plan/lecture'
import { duree, enHeure } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'
import { couleurTemps, nomsTemps } from './temps-visuel'

export function AgendaJour({ segments, minute, vide = 'Aucun engagement ce jour.' }: {
  segments: readonly SegmentTemps[]; minute?: number; vide?: string
}) {
  const j = useJetons()
  const visibles = segments.filter((s) => s.nature !== 'sleep')
  if (!visibles.length) return <Text style={{ fontFamily: GEIST.normal, color: j.text2, fontSize: 15, paddingVertical: 20 }}>{vide}</Text>
  return <View>{visibles.map((s) => {
    const actif = minute !== undefined && s.debut <= minute && minute < s.fin
    return <View key={`${s.nature}-${s.id}`} style={{ flexDirection: 'row', gap: 14, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: j.line, alignItems: 'center' }}>
      <View style={{ width: 51, gap: 5 }}>
        <Text style={{ fontFamily: MONO.demi, fontSize: 12, color: actif ? j.accentEncre : j.text }}>{enHeure(s.debut)}</Text>
        <Text style={{ fontFamily: MONO.normal, fontSize: 11, color: j.text2 }}>{enHeure(s.fin)}</Text>
      </View>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: couleurTemps(s.nature, j) }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 16, color: j.text }}>{s.titre}</Text>
        <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: actif ? j.accentEncre : j.text2 }}>
          {actif ? 'En cours' : nomsTemps[s.nature]} · {duree(s.fin - s.debut)}
        </Text>
      </View>
    </View>
  })}</View>
}
