/**
 * Les trois natures, montrées dans le langage de la carte de Vethos : une
 * mini-semaine, des colonnes, des blocs à liseré. Ce qu'on voit est ce que
 * l'app fera vraiment.
 *
 * - Task   : des séances qui remontent depuis l'échéance.
 * - Goal   : un budget d'heures réparti sur la semaine.
 * - Anchor : la même heure, les mêmes jours.
 */
import { useEffect, useRef } from 'react'
import { Animated, Text, View } from 'react-native'
import { GEIST, MONO } from '@/ui/primitives'
import { type NatureIntroduction } from './modele-introduction'
import { encre } from './experience-introduction'

export const TEINTE: Record<NatureIntroduction, string> = {
  tache: encre.text2,
  objectif: encre.accentEncre,
  ancre: '#6888ab',
}
export const NOM_NATURE: Record<NatureIntroduction, string> = {
  tache: 'TASK',
  objectif: 'GOAL',
  ancre: 'ANCHOR',
}

const LETTRES = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
/** Lundi = 0 … dimanche = 6, pour l'affichage ; `jours` du modèle utilise 0 = dimanche. */
const versModele = (i: number) => (i + 1) % 7

type Bloc = { col: number; debut: number; duree: number }

/** Ce que chaque nature place, en fractions de la hauteur de la colonne. */
function blocsDe(
  nature: NatureIntroduction,
  { jours, heure, echeanceCol }: { jours: number[]; heure: number; echeanceCol: number },
): Bloc[] {
  if (nature === 'tache') {
    // Trois séances, qui remontent depuis la veille de l'échéance.
    return [1, 2, 3]
      .map((k) => echeanceCol - k)
      .filter((c) => c >= 0)
      .map((col, i) => ({ col, debut: [0.52, 0.3, 0.62][i]!, duree: 0.2 }))
  }
  if (nature === 'objectif') {
    return [
      { col: 0, debut: 0.55, duree: 0.16 },
      { col: 1, debut: 0.28, duree: 0.2 },
      { col: 3, debut: 0.6, duree: 0.16 },
      { col: 4, debut: 0.36, duree: 0.2 },
      { col: 5, debut: 0.18, duree: 0.24 },
    ]
  }
  const y = Math.min(0.8, Math.max(0.02, (heure - 360) / (1380 - 360)))
  return [0, 1, 2, 3, 4, 5, 6]
    .filter((i) => jours.includes(versModele(i)))
    .map((col) => ({ col, debut: y, duree: 0.17 }))
}

export function MiniSemaine({
  nature,
  reduit,
  delai = 0,
  jours = [1, 3, 5],
  heure = 1080,
  echeanceCol = 4,
  legende,
  lettres = LETTRES,
}: {
  nature: NatureIntroduction
  reduit: boolean
  delai?: number
  jours?: number[]
  heure?: number
  /** Colonne de l'échéance (0 = lundi) pour une Task. */
  echeanceCol?: number
  legende?: string
  /** Les initiales des sept colonnes (par défaut lundi → dimanche). */
  lettres?: string[]
}) {
  const blocs = blocsDe(nature, { jours, heure, echeanceCol })
  const cle = `${nature}|${jours.join(',')}|${heure}|${echeanceCol}`
  // Pour une Task, les séances apparaissent de l'échéance vers aujourd'hui.
  const ordre = nature === 'tache' ? [...blocs].reverse() : blocs
  const p = useRef(new Animated.Value(reduit ? 1 : 0)).current
  useEffect(() => {
    if (reduit) {
      p.setValue(1)
      return
    }
    p.setValue(0)
    const a = Animated.timing(p, { toValue: 1, duration: 900, delay: delai, useNativeDriver: true })
    a.start()
    return () => a.stop()
  }, [cle, delai, p, reduit])
  const hauteur = 76
  const couleur = TEINTE[nature]
  return (
    <View accessible={false} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        {lettres.map((l, i) => (
          <Text
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              color: nature === 'tache' && i === echeanceCol ? encre.accentEncre : encre.text3,
              fontFamily: nature === 'tache' && i === echeanceCol ? GEIST.demi : GEIST.moyen,
              fontSize: 10,
            }}
          >
            {nature === 'tache' && i === echeanceCol ? 'DUE' : l}
          </Text>
        ))}
      </View>
      <View
        style={{
          height: hauteur,
          flexDirection: 'row',
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: '#0c0c0c',
          borderWidth: 1,
          borderColor: encre.line,
        }}
      >
        {LETTRES.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              borderRightWidth: i < 6 ? 1 : 0,
              borderRightColor: 'rgba(242, 242, 242, 0.06)',
              backgroundColor:
                nature === 'tache' && i > echeanceCol ? 'rgba(0,0,0,0.55)' : 'transparent',
            }}
          >
            {nature === 'tache' && i === echeanceCol ? (
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: encre.accentEncre }} />
            ) : null}
          </View>
        ))}
        {ordre.map((b, k) => {
          const debut = k / Math.max(ordre.length, 1)
          return (
            <Animated.View
              key={`${b.col}-${k}`}
              style={{
                position: 'absolute',
                left: `${(b.col / 7) * 100}%`,
                width: `${100 / 7}%`,
                top: b.debut * hauteur,
                height: Math.max(10, b.duree * hauteur),
                paddingHorizontal: 3,
                opacity: p.interpolate({
                  inputRange: [0, debut * 0.8, Math.min(1, debut * 0.8 + 0.2), 1],
                  outputRange: [0, 0, 1, 1],
                }),
                transform: [
                  {
                    translateY: p.interpolate({
                      inputRange: [0, debut * 0.8, Math.min(1, debut * 0.8 + 0.2), 1],
                      outputRange: [reduit ? 0 : 5, reduit ? 0 : 5, 0, 0],
                    }),
                  },
                ],
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: 4,
                  backgroundColor: encre.surface3,
                  borderLeftWidth: 3,
                  borderLeftColor: couleur,
                }}
              />
            </Animated.View>
          )
        })}
      </View>
      {legende ? (
        <Text style={{ color: encre.text3, fontFamily: MONO.normal, fontSize: 11, textAlign: 'right' }}>
          {legende}
        </Text>
      ) : null}
    </View>
  )
}
