import { Text, View } from 'react-native'
import type { DayCapacity } from '@shared/planning/types'
import { duree } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { PAS } from '@/theme/jetons'
import { GEIST, MONO } from './primitives'

/**
 * D'où vient le chiffre « disponible ».
 *
 * Brute, moins l'inutilisable, moins le repos réservé, moins la fatigue.
 * Quatre soustractions que le moteur fait de toute façon ; les montrer, c'est
 * la différence entre une application qui annonce un chiffre et une qui le
 * justifie. Personne ne fait confiance à un nombre dont il ne voit pas le
 * calcul — et c'est ce nombre-là qui décide de tout le reste.
 *
 * Le bureau met six colonnes côte à côte. Portées telles quelles sur 375 px,
 * elles débordaient : le tableau défilait horizontalement et **« Disponible »
 * — la seule colonne qu'on vient lire — se retrouvait hors de l'écran.** Un
 * tableau dont on ne voit pas la réponse n'est pas un tableau réduit, c'est un
 * tableau cassé.
 *
 * Ici chaque jour tient sur deux lignes : la réponse d'abord, à droite, dans
 * la colonne où l'œil descend ; les soustractions en dessous, en plus petit,
 * pour qui veut vérifier. Même information, même ordre de lecture, aucune
 * donnée perdue.
 */

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

export function TableauCapacite({ capacites }: { capacites: readonly DayCapacity[] }) {
  const j = useJetons()

  return (
    <View>
      {capacites.map((c, i) => {
        const ampute = c.fatiguePenaltyMinutes + c.breathingReductionMinutes
        const retraits = [
          c.unusableMinutes > 0 ? `−${duree(c.unusableMinutes)} inutilisable` : null,
          c.restReservedMinutes > 0 ? `−${duree(c.restReservedMinutes)} repos` : null,
          ampute > 0 ? `−${duree(ampute)} fatigue` : null,
        ].filter((t): t is string => t !== null)

        return (
          <View
            key={c.date}
            accessible
            accessibilityLabel={`${JOURS[c.dayOfWeek]} ${c.date.slice(8)} : ${duree(c.effectiveCapacityMinutes)} disponibles`}
            style={{
              paddingVertical: PAS[2] + 2,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: j.line,
              gap: 3,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: PAS[2] }}>
              <Text style={{ flex: 1, fontFamily: GEIST.moyen, fontSize: 13, color: j.text }}>
                {JOURS[c.dayOfWeek]}{' '}
                <Text style={{ fontFamily: MONO.normal, fontSize: 11.5, color: j.text3 }}>
                  {c.date.slice(8)}
                </Text>
              </Text>
              <Text
                style={{
                  fontFamily: MONO.demi,
                  fontSize: 13,
                  color: j.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {duree(c.effectiveCapacityMinutes)}
              </Text>
            </View>

            <Text style={{ fontFamily: GEIST.normal, fontSize: 11, lineHeight: 17, color: j.text3 }}>
              {duree(c.rawCapacityMinutes)} brute
              {retraits.length > 0 ? ` · ${retraits.join(' · ')}` : ''}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
