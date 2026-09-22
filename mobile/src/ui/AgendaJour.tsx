import { Text, View } from 'react-native'
import type { SegmentTemps } from '@/plan/lecture'
import { duree, enHeure } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'
import { couleurTemps, nomsTemps } from './temps-visuel'

/**
 * La journée, ligne par ligne.
 *
 * Trois états seulement, et ils viennent tous de l'horloge : à venir, en
 * cours, passé. Un bloc passé s'éteint sans commentaire — l'application ne
 * constate pas ce qui n'a pas été fait, parce qu'elle ne l'a pas mesuré, et un
 * constat non mesuré est un reproche déguisé (F).
 *
 * Ce qui apparaît en revanche, c'est ce que le MOTEUR a dû faire pour poser un
 * bloc là : un plafond franchi, une ancre réduite, une pause comprise dans
 * l'empreinte. Ce sont des faits sur le plan, pas sur la personne.
 */
export function AgendaJour({ segments, minute, vide = 'Nothing committed that day.' }: {
  segments: readonly SegmentTemps[]; minute?: number; vide?: string
}) {
  const j = useJetons()
  const visibles = segments.filter((s) => s.nature !== 'sleep')
  if (!visibles.length) return <Text style={{ fontFamily: GEIST.normal, color: j.text2, fontSize: 15, paddingVertical: 20 }}>{vide}</Text>
  return <View>{visibles.map((s) => {
    const actif = minute !== undefined && s.debut <= minute && minute < s.fin
    const passe = minute !== undefined && s.fin <= minute

    // Pendant qu'un bloc tourne, sa durée totale ne renseigne plus : ce qu'on
    // regarde à ce moment-là, c'est ce qu'il en reste.
    const restant = actif && s.travail > 0
      ? Math.max(0, s.travail - Math.max(0, minute! - s.debut))
      : null

    return <View key={`${s.nature}-${s.id}`} style={{ flexDirection: 'row', gap: 14, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: j.line, alignItems: 'center', opacity: passe ? 0.55 : 1 }}>
      <View style={{ width: 51, gap: 5 }}>
        <Text style={{ fontFamily: MONO.demi, fontSize: 12, color: actif ? j.accentEncre : j.text }}>{enHeure(s.debut)}</Text>
        <Text style={{ fontFamily: MONO.normal, fontSize: 11, color: j.text2 }}>{enHeure(s.fin)}</Text>
      </View>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: couleurTemps(s.nature, j) }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 16, color: j.text }}>{s.titre}</Text>
        <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: actif ? j.accentEncre : j.text2 }}>
          {actif ? 'Now' : nomsTemps[s.nature]} · {restant !== null ? `${duree(restant)} left` : duree(s.fin - s.debut)}
        </Text>
        {s.note ? (
          <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, color: j.text3 }}>{s.note}</Text>
        ) : null}
      </View>
    </View>
  })}</View>
}
