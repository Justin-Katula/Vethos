import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from '@/ui/primitives'
import type { PlacedBlock } from '@shared/planning/types'

/**
 * L'horloge du hall, portée sur téléphone.
 *
 * Elle ne dit pas l'heure — le téléphone la dit déjà, en haut de l'écran. Elle
 * dit **où l'on en est dans sa journée** : ce qui est passé, ce qui vient, et à
 * quel endroit du cercle on se trouve maintenant.
 *
 * Douze heures par tour serait ambigu : un bloc à 9h et un à 21h tomberaient au
 * même endroit. Le cercle couvre donc la journée ÉVEILLÉE, du lever au coucher.
 * C'est la seule échelle qui rende le dessin honnête.
 */
export function Horloge({
  blocs,
  leverMinute,
  coucherMinute,
  taille = 260,
}: {
  blocs: readonly PlacedBlock[]
  leverMinute: number
  coucherMinute: number
  taille?: number
}) {
  const j = useJetons()
  const [maintenant, setMaintenant] = useState(() => minuteCourante())

  useEffect(() => {
    // Une fois par minute suffit : l'aiguille avance d'un demi-degré, et
    // rafraîchir plus souvent ne ferait que réveiller le téléphone pour rien.
    const t = setInterval(() => setMaintenant(minuteCourante()), 30_000)
    return () => clearInterval(t)
  }, [])

  const r = taille / 2
  const rayonPiste = r - 26
  const epaisseur = 16

  const etendue = Math.max(1, coucherMinute - leverMinute)
  /** Une minute de la journée → sa position en degrés sur le cercle. */
  const angle = (minute: number) => {
    const borne = Math.min(Math.max(minute, leverMinute), coucherMinute)
    return ((borne - leverMinute) / etendue) * 360 - 90
  }

  const eveille = maintenant >= leverMinute && maintenant <= coucherMinute

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={taille} height={taille}>
        <G>
          {/* La piste : toute la journée éveillée, encore à vivre. */}
          <Circle
            cx={r}
            cy={r}
            r={rayonPiste}
            stroke={j.surface2}
            strokeWidth={epaisseur}
            fill="none"
          />

          {/* Ce qui est déjà passé, éteint plutôt qu'effacé. */}
          {eveille ? (
            <Path
              d={arc(r, r, rayonPiste, angle(leverMinute), angle(maintenant))}
              stroke={j.surface3}
              strokeWidth={epaisseur}
              fill="none"
              strokeLinecap="butt"
            />
          ) : null}

          {/* Les blocs du plan. C'est le seul endroit où la couleur entre. */}
          {blocs.map((b) => (
            <Path
              key={b.id}
              d={arc(r, r, rayonPiste, angle(b.startMinute), angle(b.endMinute))}
              stroke={couleurBloc(b, j)}
              strokeWidth={epaisseur}
              fill="none"
              strokeLinecap="butt"
              opacity={b.endMinute <= maintenant ? 0.38 : 1}
            />
          ))}

          {/* L'aiguille. Un seul trait, jusqu'au bord : c'est « ici, maintenant ». */}
          {eveille ? (
            <Line
              x1={r}
              y1={r}
              x2={r + Math.cos(rad(angle(maintenant))) * (rayonPiste + epaisseur / 2 + 4)}
              y2={r + Math.sin(rad(angle(maintenant))) * (rayonPiste + epaisseur / 2 + 4)}
              stroke={j.accentEncre}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : null}

          <SvgText
            x={r}
            y={r - 4}
            fill={j.text}
            fontSize={40}
            fontFamily={MONO.demi}
            textAnchor="middle"
          >
            {enHeure(maintenant)}
          </SvgText>
          <SvgText x={r} y={r + 22} fill={j.text3} fontSize={11.5} fontFamily={GEIST.normal} textAnchor="middle">
            {eveille ? `éveillé depuis ${duree(maintenant - leverMinute)}` : 'nuit'}
          </SvgText>
        </G>
      </Svg>
    </View>
  )
}

function couleurBloc(b: PlacedBlock, j: ReturnType<typeof useJetons>): string {
  if (b.kind === 'task') return j.blocTache
  if (b.kind === 'ancre') return j.blocAncre
  return j.blocObjectif
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Un arc de cercle en coordonnées SVG. */
function arc(cx: number, cy: number, rayon: number, deb: number, fin: number): string {
  // Un arc de 360° ne peut pas se tracer d'un seul trait : les deux extrémités
  // se confondraient et SVG ne dessinerait rien du tout.
  const balaye = Math.min(Math.max(fin - deb, 0), 359.9)
  const finSure = deb + balaye
  const x1 = cx + rayon * Math.cos(rad(deb))
  const y1 = cy + rayon * Math.sin(rad(deb))
  const x2 = cx + rayon * Math.cos(rad(finSure))
  const y2 = cy + rayon * Math.sin(rad(finSure))
  const grandArc = balaye > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${rayon} ${rayon} 0 ${grandArc} 1 ${x2} ${y2}`
}

function minuteCourante(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function enHeure(minute: number): string {
  const h = Math.floor(minute / 60) % 24
  const m = Math.round(minute) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function duree(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const reste = m % 60
  if (h === 0) return `${reste} min`
  if (reste === 0) return `${h} h`
  return `${h} h ${String(reste).padStart(2, '0')}`
}
