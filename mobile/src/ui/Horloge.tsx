import type { ReactNode } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg'
import type { JourTemps } from '@/plan/lecture'
import { enHeure, segmentActuel } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'
import { couleurTemps } from './temps-visuel'
export { duree, enHeure } from '@/plan/lecture'

/**
 * Cadran civil 24 h : les mêmes segments que Mon temps, sans horloge locale.
 *
 * Le centre se remplit du dehors. C'est la seule chose de l'écran qu'on
 * REGARDE plutôt qu'on lit, et ce qu'elle doit montrer dépend de l'écran :
 * « ce qu'il te reste » sur l'accueil, l'heure ailleurs. Le cadran ne décide
 * pas de ça tout seul.
 */
export function Horloge({ jour, minute, centre }: { jour: JourTemps; minute: number; centre?: ReactNode }) {
  const j = useJetons()
  const { width, fontScale } = useWindowDimensions()
  const taille = Math.min(336, width - 56)
  const actuel = segmentActuel(jour.segments, minute)
  const angle = (m: number) => (m / 1440) * 360 - 90
  const point = (r: number, m: number) => ({
    x: 180 + Math.cos(angle(m) * Math.PI / 180) * r,
    y: 180 + Math.sin(angle(m) * Math.PI / 180) * r,
  })
  const repere = point(135, minute)
  return (
    <View accessible accessibilityLabel={`${enHeure(minute)}. ${actuel?.titre ?? 'Free time'}. 24-hour dial.`}
      style={{ alignItems: 'center', alignSelf: 'center', width: taille, marginVertical: 12 }}>
      <Svg width={taille} height={taille} viewBox="0 0 360 360">
        <Circle cx={180} cy={180} r={135} stroke={j.surface2} strokeWidth={14} fill="none" />
        {Array.from({ length: 96 }, (_, i) => {
          const majeur = i % 4 === 0
          const a = point(153, i * 15)
          const b = point(majeur ? 161 : 156, i * 15)
          return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={majeur ? j.text3 : j.lineForte} strokeWidth={majeur ? 1.3 : 0.8} />
        })}
        {[0, 360, 720, 1080].map((m) => {
          const p = point(170, m)
          return <SvgText key={m} x={p.x} y={p.y + 4} textAnchor="middle"
            fill={j.text2} fontFamily={MONO.normal} fontSize={11}>{String(m / 60).padStart(2, '0')}</SvgText>
        })}
        {jour.segments.flatMap((s) => {
          const base = (
            <Path
              key={`${s.nature}-${s.id}`}
              d={arc(180, 135, angle(s.debut), angle(s.fin))}
              stroke={couleurTemps(s.nature, j)}
              strokeWidth={s.nature === 'sleep' ? 6 : 14}
              strokeLinecap="butt"
              fill="none"
              opacity={s.fin <= minute ? 0.5 : 1}
            />
          )
          if (!s.pauseVisible || !s.pause || s.pause <= 0) return [base]
          return [
            base,
            <Path
              key={`pause-veil-${s.id}`}
              d={arc(180, 135, angle(s.fin - s.pause), angle(s.fin))}
              stroke={j.pauseVoile}
              strokeWidth={14}
              strokeLinecap="butt"
              fill="none"
            />,
            <Path
              key={`pause-hatch-${s.id}`}
              d={arc(180, 135, angle(s.fin - s.pause), angle(s.fin))}
              stroke={j.text3}
              strokeWidth={14}
              strokeLinecap="butt"
              strokeDasharray="2, 4"
              fill="none"
              opacity={0.65}
            />,
          ]
        })}
        <Circle cx={repere.x} cy={repere.y} r={6} fill={j.accentEncre} stroke={j.bg} strokeWidth={3} />
      </Svg>
      <View
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: '15%',
          gap: 6,
        }}
      >
        {centre ?? (
          <>
            <Text
              style={{
                fontFamily: GEIST.normal,
                color: j.text,
                fontSize: 48 / Math.max(1, fontScale / 1.3),
                letterSpacing: -1.5,
                fontVariant: ['tabular-nums'],
              }}
            >
              {enHeure(minute)}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: GEIST.moyen,
                fontSize: 14,
                color: j.text2,
                textAlign: 'center',
              }}
            >
              {actuel?.titre ?? 'Free time'}
            </Text>
          </>
        )}
      </View>
    </View>
  )
}

function arc(centre: number, rayon: number, debut: number, fin: number): string {
  if (fin - debut >= 359.99) return `M ${centre} ${centre - rayon} a ${rayon} ${rayon} 0 1 1 0 ${rayon * 2} a ${rayon} ${rayon} 0 1 1 0 ${-rayon * 2}`
  const a = debut * Math.PI / 180
  const b = fin * Math.PI / 180
  return `M ${centre + rayon * Math.cos(a)} ${centre + rayon * Math.sin(a)} A ${rayon} ${rayon} 0 ${fin - debut > 180 ? 1 : 0} 1 ${centre + rayon * Math.cos(b)} ${centre + rayon * Math.sin(b)}`
}
