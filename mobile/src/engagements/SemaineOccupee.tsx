/**
 * La semaine d'une ancre, vue d'un coup d'œil : une ligne par jour, de minuit
 * à minuit. Ce qui est déjà pris (sommeil, heures fixes, autres ancres) est
 * gris ; la place choisie est blanche, rouge là où elle tombe sur du pris.
 * Toucher un endroit libre y pose l'heure et coche le jour.
 */
import { useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import { A, GEIST } from '@/ui/app-briques'
import type { AncrePosee } from '@/plan/ancres-libres'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LIGNE = 10
const pc = (m: number) => `${(Math.max(0, Math.min(1440, m)) / 1440) * 100}%` as const

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
  /** Un endroit libre touché : l'heure (minute du jour) et le jour. */
  poser: (minute: number, jour: number) => void
}) {
  const lignes = useRef<(View | null)[]>([])
  const fin = Math.min(1440, debut + Math.max(1, duree))
  return (
    <View style={{ gap: 5 }}>
      {DOW.map((t, i) => {
        const g = (i + 1) % 7
        const ceJour = pris.filter((a) => a.jours.includes(g))
        const conflit = ceJour.some((a) => debut < a.minuteAncrage + a.dureeMinutes && a.minuteAncrage < fin)
        const coche = jours.includes(g)
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: 10, color: coche ? A.t1 : A.t4, fontFamily: GEIST.demi, fontSize: 10, textAlign: 'center' }}>{t}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t}: place it here`}
              hitSlop={{ top: 2, bottom: 2 }}
              onPress={(e) => {
                const x = e.nativeEvent.pageX
                // pageX et la mesure de la ligne : locationX n'est pas fiable partout.
                lignes.current[i]?.measureInWindow((gauche, _y, l) => {
                  if (!l || !Number.isFinite(x)) return
                  const m = Math.round((((x - gauche) / l) * 1440) / 15) * 15
                  poser(Math.max(0, Math.min(1440 - Math.max(15, duree), m)), g)
                })
              }}
              ref={(r) => {
                lignes.current[i] = r
              }}
              style={{ flex: 1, height: LIGNE, borderRadius: 3, backgroundColor: 'rgba(242,242,242,0.05)', overflow: 'hidden' }}
            >
              {ceJour.map((a) => (
                <View
                  key={a.id}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: pc(a.minuteAncrage),
                    width: pc(a.dureeMinutes),
                    backgroundColor: a.sommeil ? 'rgba(242,242,242,0.12)' : 'rgba(242,242,242,0.26)',
                  }}
                />
              ))}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: pc(debut),
                  width: pc(fin - debut),
                  minWidth: 2,
                  borderRadius: 2,
                  backgroundColor: !coche ? 'transparent' : conflit ? A.rouge : A.t1,
                  borderWidth: coche ? 0 : 1,
                  borderColor: conflit ? A.rouge : 'rgba(242,242,242,0.45)',
                }}
              />
            </Pressable>
          </View>
        )
      })}
      <View style={{ flexDirection: 'row', marginLeft: 18 }}>
        {['12a', '6a', '12p', '6p', '12a'].map((h, k) => (
          <Text key={k} style={{ position: k ? 'absolute' : 'relative', left: k ? pc(k * 360) : undefined, transform: [{ translateX: k === 4 ? -16 : k ? -8 : 0 }], color: A.t4, fontFamily: GEIST.moyen, fontSize: 10 }}>
            {h}
          </Text>
        ))}
      </View>
    </View>
  )
}
