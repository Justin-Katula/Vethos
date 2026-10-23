/**
 * La semaine d'une ancre, vue d'un coup d'œil : une piste par jour, de minuit
 * à minuit. La nuit est pointillée, les heures fixes hachurées, les autres
 * ancres dans leur couleur. La place choisie luit — blanche si elle est libre,
 * rouge là où elle tombe sur du pris — et un fil vertical la relie d'un jour
 * à l'autre, son heure au-dessus. Toucher une piste y pose l'heure et coche
 * le jour.
 */
import { useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Defs, G, Line, Path, Pattern, Rect } from 'react-native-svg'
import { A, GEIST, MONO } from '@/ui/app-briques'
import { traitDe } from '@/ui/couleurs-engagement'
import type { AncrePosee } from '@/plan/ancres-libres'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const PISTE = 14
const ECART = 7
const MARGE = 22
const ENTETE = 24
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function SemaineOccupee({
  pris,
  debut,
  duree,
  jours,
  poser,
}: {
  pris: readonly AncrePosee[]
  debut: number
  duree: number
  /** Les jours cochés (0 = dimanche). */
  jours: readonly number[]
  /** Un endroit touché : l'heure (minute du jour) et le jour. */
  poser: (minute: number, jour: number) => void
}) {
  const [largeur, setLargeur] = useState(0)
  const zone = useRef<View | null>(null)
  const W = Math.max(0, largeur - MARGE)
  const x = (m: number) => MARGE + (Math.max(0, Math.min(1440, m)) / 1440) * W
  const fin = Math.min(1440, debut + Math.max(1, duree))
  const H = ENTETE + 7 * PISTE + 6 * ECART
  const aujourdHui = new Date().getDay()
  const conflitDe = (g: number) => pris.some((a) => a.jours.includes(g) && debut < a.minuteAncrage + a.dureeMinutes && a.minuteAncrage < fin)
  const libre = jours.length > 0 && jours.every((g) => !conflitDe(g))
  // L'étiquette d'heure suit le fil, sans sortir du cadre.
  const etiquette = `${hhmm(debut)}–${hhmm(fin)}`
  const largeurEtiquette = 92
  const gaucheEtiquette = Math.max(MARGE - 4, Math.min(largeur - largeurEtiquette, (x(debut) + x(fin)) / 2 - largeurEtiquette / 2))

  return (
    <View
      ref={zone}
      onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      style={{ paddingTop: 4, paddingBottom: 2 }}
    >
      {largeur ? (
        <View style={{ height: H }}>
          <Svg width={largeur} height={H}>
            <Defs>
              <Pattern id="sem-nuit" width={5} height={5} patternUnits="userSpaceOnUse">
                <Rect width={5} height={5} fill="rgba(242,242,242,0.035)" />
                <Rect x={2} y={2} width={1} height={1} fill="rgba(242,242,242,0.22)" />
              </Pattern>
              <Pattern id="sem-fixe" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <Rect width={5} height={5} fill="rgba(242,242,242,0.09)" />
                <Line x1={0} y1={0} x2={0} y2={5} stroke="rgba(242,242,242,0.32)" strokeWidth={1.4} />
              </Pattern>
            </Defs>

            {/* Les repères de la journée : 6 h, midi, 18 h. */}
            {[360, 720, 1080].map((m) => (
              <Line key={m} x1={x(m)} x2={x(m)} y1={ENTETE - 2} y2={H} stroke="rgba(242,242,242,0.07)" strokeWidth={1} strokeDasharray="2 3" />
            ))}

            {DOW.map((_, i) => {
              const g = (i + 1) % 7
              const y = ENTETE + i * (PISTE + ECART)
              const coche = jours.includes(g)
              const conflit = conflitDe(g)
              const couleurPlace = conflit ? A.rouge : A.t1
              return (
                <G key={i}>
                  <Rect x={MARGE} y={y} width={W} height={PISTE} rx={PISTE / 2} fill="rgba(242,242,242,0.045)" />
                  {pris
                    .filter((a) => a.jours.includes(g))
                    .map((a) => {
                      const x0 = x(a.minuteAncrage)
                      const l = Math.max(2, x(a.minuteAncrage + a.dureeMinutes) - x0)
                      const debord = a.minuteAncrage <= 0 || a.minuteAncrage + a.dureeMinutes >= 1440
                      return (
                        <Rect
                          key={a.id}
                          x={x0}
                          y={y}
                          width={l}
                          height={PISTE}
                          rx={debord ? PISTE / 2 : 3}
                          fill={a.sommeil ? 'url(#sem-nuit)' : a.couleur ? traitDe('ANCHOR', a.couleur, a.id) : 'url(#sem-fixe)'}
                          opacity={a.couleur && !a.sommeil ? 0.55 : 1}
                        />
                      )
                    })}
                  {/* La place choisie : elle luit sur les jours cochés, en pointillé ailleurs. */}
                  {coche ? (
                    <>
                      <Rect x={x(debut) - 3} y={y - 3} width={Math.max(2, x(fin) - x(debut)) + 6} height={PISTE + 6} rx={(PISTE + 6) / 2} fill={couleurPlace} opacity={0.16} />
                      <Rect x={x(debut)} y={y} width={Math.max(3, x(fin) - x(debut))} height={PISTE} rx={4} fill={couleurPlace} />
                    </>
                  ) : (
                    <Rect
                      x={x(debut) + 0.5}
                      y={y + 0.5}
                      width={Math.max(2, x(fin) - x(debut)) - 1}
                      height={PISTE - 1}
                      rx={4}
                      fill="none"
                      stroke={conflit ? 'rgba(240,82,95,0.6)' : 'rgba(242,242,242,0.35)'}
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                  )}
                </G>
              )
            })}

            {/* Le fil : relie la place d'un jour à l'autre. */}
            <Path d={`M${x(debut)} ${ENTETE - 4} V${H}`} stroke={libre ? 'rgba(242,242,242,0.4)' : 'rgba(240,82,95,0.55)'} strokeWidth={1} />
          </Svg>

          {/* Les jours, aujourd'hui marqué. */}
          {DOW.map((t, i) => {
            const g = (i + 1) % 7
            const y = ENTETE + i * (PISTE + ECART)
            const coche = jours.includes(g)
            return (
              <View key={i} pointerEvents="none" style={{ position: 'absolute', left: 0, top: y, width: MARGE - 6, height: PISTE, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: coche ? A.t1 : g === aujourdHui ? A.t2 : A.t4, fontFamily: GEIST.demi, fontSize: 10 }}>{t}</Text>
                {g === aujourdHui ? <View style={{ position: 'absolute', left: 0, top: PISTE / 2 - 1.5, width: 3, height: 3, borderRadius: 2, backgroundColor: A.t2 }} /> : null}
              </View>
            )
          })}

          {/* L'heure choisie, au-dessus du fil. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: gaucheEtiquette, width: largeurEtiquette, alignItems: 'center' }}>
            <View style={{ paddingHorizontal: 8, height: 18, borderRadius: 9, justifyContent: 'center', backgroundColor: libre ? 'rgba(242,242,242,0.1)' : 'rgba(240,82,95,0.16)' }}>
              <Text style={{ color: libre ? A.t1 : 'rgba(255,190,184,0.95)', fontFamily: MONO.normal, fontSize: 11, fontVariant: ['tabular-nums'] }}>{etiquette}</Text>
            </View>
          </View>

          {/* Les pistes touchables : l'heure se pose là où le doigt tombe. */}
          {DOW.map((t, i) => {
            const g = (i + 1) % 7
            const y = ENTETE + i * (PISTE + ECART)
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${t}: place it here`}
                onPress={(e) => {
                  const px = e.nativeEvent.pageX
                  // pageX et la mesure du cadre : locationX n'est pas fiable partout.
                  zone.current?.measureInWindow((gauche) => {
                    if (!W || !Number.isFinite(px)) return
                    const m = Math.round((((px - gauche - MARGE) / W) * 1440) / 15) * 15
                    poser(Math.max(0, Math.min(1440 - Math.max(15, duree), m)), g)
                  })
                }}
                style={{ position: 'absolute', left: MARGE, right: 0, top: y - ECART / 2, height: PISTE + ECART }}
              />
            )
          })}
        </View>
      ) : (
        <View style={{ height: H }} />
      )}
      <View style={{ height: 14, marginTop: 6, marginLeft: MARGE }}>
        {['12a', '6a', '12p', '6p', '12a'].map((h, k) => (
          <Text
            key={k}
            style={{ position: 'absolute', left: (k / 4) * W, transform: [{ translateX: k === 0 ? 0 : k === 4 ? -18 : -9 }], color: A.t4, fontFamily: MONO.normal, fontSize: 10 }}
          >
            {h}
          </Text>
        ))}
      </View>
    </View>
  )
}
