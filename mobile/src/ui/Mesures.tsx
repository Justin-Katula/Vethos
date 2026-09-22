import { Text, View } from 'react-native'
import Svg, { G, Path } from 'react-native-svg'
import type { DayCapacity } from '@shared/planning/types'
import { partsDuree } from '@/plan/signaux'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { GEIST, MONO } from './primitives'

/**
 * Les chiffres de la journée, et le trait qui les relie au cadran.
 *
 * Aucun n'est inventé ici : la capacité vient de A.3, le repos de E.2, le
 * retard de D.7, et l'engagé n'est que la somme du travail effectif réellement
 * posé. Vethos ne fabrique pas de score — un chiffre affiché est un chiffre
 * que le moteur a calculé, ou il n'est pas affiché.
 */

type Ton = 'accent' | 'sourd' | 'alerte'

/**
 * Le trait qui relie une valeur aux valeurs qui la composent.
 *
 * Sans lui, trois capsules sous un grand nombre ne sont qu'une pile : rien ne
 * dit que les trois expliquent le premier. L'accolade le dit d'un seul trait,
 * et c'est la seule chose qu'elle a à dire — donc elle reste sourde et ne
 * brille jamais.
 */
export function Accolade({ branches = 3 }: { branches?: number }) {
  const j = useJetons()
  const x = Array.from({ length: branches }, (_, i) => ((i + 0.5) / branches) * 100)
  const premier = x[0]!
  const dernier = x[x.length - 1]!
  const r = 1.6

  return (
    <Svg width="100%" height={20} viewBox="0 0 100 20" preserveAspectRatio="none">
      <G fill="none" stroke={j.lineForte} strokeWidth={0.35} vectorEffect="non-scaling-stroke">
        <Path d="M 50 0 V 8" />
        <Path
          d={`M ${premier} 20 V ${8 + r} Q ${premier} 8 ${premier + r} 8 H ${dernier - r} Q ${dernier} 8 ${dernier} ${8 + r} V 20`}
        />
        {x.slice(1, -1).map((v) => (
          <Path key={v} d={`M ${v} 8 V 20`} />
        ))}
      </G>
    </Svg>
  )
}

function Mesure({ valeur, unite, etiquette, ton }: {
  valeur: string
  unite?: string
  etiquette: string
  ton: Ton
}) {
  const j = useJetons()
  const encre = ton === 'accent' ? j.accentEncre : ton === 'alerte' ? j.alerte : j.text2
  const bordure = ton === 'accent' ? j.accent : ton === 'alerte' ? j.alerte : j.line
  const fond =
    ton === 'accent' ? j.accentDoux : ton === 'alerte' ? 'transparent' : 'transparent'

  return (
    <View
      accessible
      accessibilityLabel={`${etiquette} : ${valeur} ${unite ?? ''}`.trim()}
      style={{ flex: 1, alignItems: 'center', gap: PAS[2] }}
    >
      <View
        style={{
          width: '100%',
          minHeight: 46,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 3,
          borderWidth: 1,
          borderColor: bordure,
          borderRadius: RAYON.md,
          backgroundColor: fond,
          paddingHorizontal: PAS[1],
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: encre,
            fontFamily: MONO.demi,
            fontSize: 17,
            fontVariant: ['tabular-nums'],
          }}
        >
          {valeur}
        </Text>
        {unite ? (
          <Text style={{ color: ton === 'sourd' ? j.text3 : encre, fontFamily: GEIST.normal, fontSize: 11 }}>
            {unite}
          </Text>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ color: j.text2, fontFamily: GEIST.moyen, fontSize: 11 }}>
        {etiquette}
      </Text>
    </View>
  )
}

/**
 * Trois mesures, quatre en cas de retard.
 *
 * Le retard n'a pas de place réservée : il n'apparaît que s'il existe. Une
 * case « Retard — 0 min » affichée en permanence transformerait un fait
 * ponctuel en reproche de fond, et le contrat l'interdit (F).
 */
export function Mesures({ capacite, engage }: { capacite: DayCapacity; engage: number }) {
  const retard = capacite.delayMinutes
  const branches = retard > 0 ? 4 : 3

  return (
    <View style={{ width: '100%', marginTop: PAS[1] }}>
      <Accolade branches={branches} />
      <View style={{ flexDirection: 'row', gap: PAS[2] }}>
        <Mesure etiquette="Capacity" ton="sourd" {...partsDuree(capacite.effectiveCapacityMinutes)} />
        <Mesure etiquette="Committed" ton="accent" {...partsDuree(engage)} />
        <Mesure etiquette="Rest" ton="sourd" {...partsDuree(capacite.restReservedMinutes)} />
        {retard > 0 ? <Mesure etiquette="Late" ton="alerte" {...partsDuree(retard)} /> : null}
      </View>
    </View>
  )
}
