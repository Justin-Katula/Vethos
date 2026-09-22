import { Pressable, Text, View } from 'react-native'
import type { SegmentTemps } from '@/plan/lecture'
import { duree, enHeure } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'
import { couleurTemps, nomsTemps } from './temps-visuel'

/**
 * La journée, ligne par ligne.
 *
 * Chaque bloc est tactile et permet d'ouvrir la fiche détaillée de l'engagement.
 */
export function AgendaJour({
  segments,
  minute,
  vide = 'Nothing committed that day.',
  surChoisirSegment,
}: {
  segments: readonly SegmentTemps[]
  minute?: number
  vide?: string
  surChoisirSegment?: (segment: SegmentTemps) => void
}) {
  const j = useJetons()
  const visibles = segments.filter((s) => s.nature !== 'sleep')
  if (!visibles.length) {
    return (
      <Text style={{ fontFamily: GEIST.normal, color: j.text2, fontSize: 15, paddingVertical: 20 }}>
        {vide}
      </Text>
    )
  }

  return (
    <View>
      {visibles.map((s) => {
        const actif = minute !== undefined && s.debut <= minute && minute < s.fin
        const passe = minute !== undefined && s.fin <= minute

        const restant = actif && s.travail > 0
          ? Math.max(0, s.travail - Math.max(0, minute! - s.debut))
          : null

        return (
          <Pressable
            key={`${s.nature}-${s.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${s.titre}, from ${enHeure(s.debut)} to ${enHeure(s.fin)}`}
            onPress={() => surChoisirSegment?.(s)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: 14,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: j.line,
              alignItems: 'center',
              opacity: pressed ? 0.7 : passe ? 0.55 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <View style={{ width: 51, gap: 5 }}>
              <Text style={{ fontFamily: MONO.demi, fontSize: 12, color: actif ? j.accentEncre : j.text }}>
                {enHeure(s.debut)}
              </Text>
              <Text style={{ fontFamily: MONO.normal, fontSize: 11, color: j.text2 }}>
                {enHeure(s.fin)}
              </Text>
            </View>

            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: couleurTemps(s.nature, j) }} />

            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: GEIST.moyen, fontSize: 16, color: j.text }}>
                {s.titre}
              </Text>
              <Text style={{ fontFamily: GEIST.normal, fontSize: 12, color: actif ? j.accentEncre : j.text2 }}>
                {actif ? 'Now' : nomsTemps[s.nature]} · {restant !== null ? `${duree(restant)} left` : duree(s.travail || s.fin - s.debut)}
              </Text>
              {s.note ? (
                <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, color: j.text3 }}>
                  {s.note}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}
