import { Text, View } from 'react-native'
import type { DayCapacity } from '@shared/planning/types'
import { duree } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { PAS } from '@/theme/jetons'
import { useLargeur } from './largeur'
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
 * **Deux compositions, et l'écran choisit.** Le bureau aligne six colonnes ;
 * c'est la forme la plus lisible quand il y a la place, parce que deux jours
 * se comparent alors colonne par colonne. Sous 600 points, cette même forme
 * poussait « Disponible » — la seule colonne qu'on vient lire — hors de
 * l'écran. On ne renonce donc pas à la table du bureau : on la reprend dès
 * qu'elle tient, et en dessous chaque jour se replie sur deux lignes, réponse
 * d'abord.
 *
 * Aucune donnée ne disparaît d'une forme à l'autre. Une mise en page étroite
 * qui cache un chiffre n'est pas une adaptation, c'est une perte.
 */

const JOURS_LONGS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const JOURS_COURTS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const COLONNES = [
  { cle: 'brute', titre: 'Raw' },
  { cle: 'inutilisable', titre: 'Unusable' },
  { cle: 'repos', titre: 'Rest' },
  { cle: 'fatigue', titre: 'Fatigue' },
  { cle: 'dispo', titre: 'Free' },
] as const

export function TableauCapacite({ capacites }: { capacites: readonly DayCapacity[] }) {
  const large = useLargeur().tableau
  return large ? <EnColonnes capacites={capacites} /> : <EnLignes capacites={capacites} />
}

/** La table du bureau, telle quelle. Six colonnes, un jour par rangée. */
function EnColonnes({ capacites }: { capacites: readonly DayCapacity[] }) {
  const j = useJetons()

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: PAS[2], paddingBottom: PAS[2] }}>
        <Text style={{ width: 74, fontFamily: GEIST.moyen, fontSize: 10, color: j.text3 }}>Day</Text>
        {COLONNES.map((c) => (
          <Text
            key={c.cle}
            style={{ flex: 1, textAlign: 'right', fontFamily: GEIST.moyen, fontSize: 10, color: j.text3 }}
          >
            {c.titre}
          </Text>
        ))}
      </View>

      {capacites.map((c) => {
        const ampute = c.fatiguePenaltyMinutes + c.breathingReductionMinutes
        const cellule = (texte: string, fort?: boolean) => (
          <Text
            style={{
              flex: 1,
              textAlign: 'right',
              fontFamily: fort ? MONO.demi : MONO.normal,
              fontSize: 11.5,
              color: fort ? j.text : j.text3,
              fontVariant: ['tabular-nums'],
            }}
          >
            {texte}
          </Text>
        )
        return (
          <View
            key={c.date}
            style={{
              flexDirection: 'row',
              gap: PAS[2],
              alignItems: 'center',
              paddingVertical: PAS[2],
              borderTopWidth: 1,
              borderTopColor: j.line,
            }}
          >
            <Text style={{ width: 74, fontFamily: GEIST.normal, fontSize: 12, color: j.text2 }}>
              {JOURS_COURTS[c.dayOfWeek]}{' '}
              <Text style={{ fontFamily: MONO.normal, color: j.text3 }}>{c.date.slice(8)}</Text>
            </Text>
            {cellule(duree(c.rawCapacityMinutes))}
            {cellule(`−${duree(c.unusableMinutes)}`)}
            {cellule(`−${duree(c.restReservedMinutes)}`)}
            {cellule(ampute > 0 ? `−${duree(ampute)}` : '—')}
            {cellule(duree(c.effectiveCapacityMinutes), true)}
          </View>
        )
      })}
    </View>
  )
}

/** La forme étroite : la réponse à droite, les soustractions en dessous. */
function EnLignes({ capacites }: { capacites: readonly DayCapacity[] }) {
  const j = useJetons()

  return (
    <View>
      {capacites.map((c, i) => {
        const ampute = c.fatiguePenaltyMinutes + c.breathingReductionMinutes
        const retraits = [
          c.unusableMinutes > 0 ? `−${duree(c.unusableMinutes)} unusable` : null,
          c.restReservedMinutes > 0 ? `−${duree(c.restReservedMinutes)} rest` : null,
          ampute > 0 ? `−${duree(ampute)} fatigue` : null,
        ].filter((t): t is string => t !== null)

        return (
          <View
            key={c.date}
            accessible
            accessibilityLabel={`${JOURS_LONGS[c.dayOfWeek]} ${c.date.slice(8)}: ${duree(c.effectiveCapacityMinutes)} available`}
            style={{
              paddingVertical: PAS[2] + 2,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: j.line,
              gap: 3,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: PAS[2] }}>
              <Text style={{ flex: 1, fontFamily: GEIST.moyen, fontSize: 13, color: j.text }}>
                {JOURS_LONGS[c.dayOfWeek]}{' '}
                <Text style={{ fontFamily: MONO.normal, fontSize: 11.5, color: j.text3 }}>
                  {c.date.slice(8)}
                </Text>
              </Text>
              <Text
                style={{ fontFamily: MONO.demi, fontSize: 13, color: j.text, fontVariant: ['tabular-nums'] }}
              >
                {duree(c.effectiveCapacityMinutes)}
              </Text>
            </View>

            <Text style={{ fontFamily: GEIST.normal, fontSize: 11, lineHeight: 17, color: j.text3 }}>
              {duree(c.rawCapacityMinutes)} raw
              {retraits.length > 0 ? ` · ${retraits.join(' · ')}` : ''}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
