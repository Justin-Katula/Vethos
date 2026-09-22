import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { evaluateRequest, type RequestVerdict } from '@shared/planning/requests'
import type { DayCapacity } from '@shared/planning/types'
import { useDonnees } from '@/donnees/magasin'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { GEIST, MONO } from './primitives'

/**
 * Demander du temps libre — et recevoir un chiffre, pas un avis.
 *
 * C'est le seul endroit de Vethos où l'on pose une question à l'application.
 * Elle répond avec la même arithmétique qui gouverne le reste : ce qui tient,
 * ce qui ne tient pas, et de combien. Jamais « es-tu sûr ? », jamais un
 * encouragement — un verdict chiffré qu'on peut contester en regardant le
 * tableau juste au-dessus.
 *
 * Refusé ne veut pas dire interdit : Vethos ne confisque pas une soirée. Il
 * dit ce qu'elle coûte, et la décision reste entière.
 */

const PAS_MINUTES = 30
const MIN = 15
const MAX = 720

export function DemandeTemps({
  capacites,
  aujourdHui,
}: {
  capacites: readonly DayCapacity[]
  aujourdHui: string
}) {
  const j = useJetons()
  const taches = useDonnees((d) => d.taches)
  const [minutes, setMinutes] = useState(120)
  const [verdict, setVerdict] = useState<RequestVerdict | null>(null)

  const regler = (delta: number) => {
    setMinutes((v) => Math.min(MAX, Math.max(MIN, v + delta)))
    setVerdict(null)
  }

  const demander = () => {
    setVerdict(
      evaluateRequest({
        request: { type: 'free_time', minutes, date: aujourdHui },
        tasks: taches
          .filter((t) => !t.terminee)
          .map((t) => ({ deadline: t.echeance, remainingMinutes: t.minutesRestantes })),
        dailyCapacity: capacites.map((c) => ({
          date: c.date,
          capacityMinutes: c.effectiveCapacityMinutes,
        })),
        today: aujourdHui,
      }),
    )
  }

  return (
    <View style={{ gap: PAS[4] }}>
      <Text style={{ fontFamily: GEIST.normal, fontSize: 13, color: j.text2 }}>
        I want free time today.
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[3] }}>
        <Bouton etiquette="Less" signe="−" onPress={() => regler(-PAS_MINUTES)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontFamily: MONO.demi, fontSize: 24, color: j.text, fontVariant: ['tabular-nums'] }}>
            {minutes}
          </Text>
          <Text style={{ fontFamily: GEIST.normal, fontSize: 11, color: j.text3 }}>minutes</Text>
        </View>
        <Bouton etiquette="More" signe="+" onPress={() => regler(PAS_MINUTES)} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={demander}
        style={({ pressed }) => ({
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: j.lineForte,
          borderRadius: RAYON.md,
          transform: [{ translateY: pressed ? 1 : 0 }],
        })}
      >
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 14, color: j.text }}>Ask</Text>
      </Pressable>

      {verdict ? (
        <View
          accessibilityRole="alert"
          style={{ borderTopWidth: 1, borderTopColor: j.line, paddingTop: PAS[3], gap: PAS[2] }}
        >
          <Text
            style={{
              fontFamily: GEIST.moyen,
              fontSize: 14,
              color: verdict.status === 'denied' ? j.alerte : j.text,
            }}
          >
            {verdict.status === 'granted'
              ? `Granted — ${verdict.grantedMinutes} min.`
              : verdict.status === 'partial'
                ? `${verdict.grantedMinutes} min fit, not ${minutes}.`
                : 'Denied.'}
          </Text>
          <Text style={{ fontFamily: GEIST.normal, fontSize: 12, lineHeight: 19, color: j.text2 }}>
            {verdict.reason}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function Bouton({ signe, etiquette, onPress }: { signe: string; etiquette: string; onPress: () => void }) {
  const j = useJetons()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquette}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: j.lineForte,
        borderRadius: RAYON.md,
        transform: [{ translateY: pressed ? 1 : 0 }],
      })}
    >
      <Text style={{ fontFamily: GEIST.moyen, fontSize: 20, color: j.text }}>{signe}</Text>
    </Pressable>
  )
}
