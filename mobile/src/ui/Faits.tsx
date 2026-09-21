import { Text, View } from 'react-native'
import type { PlanningResult } from '@shared/planning/types'
import { duree } from '@/plan/lecture'
import { echeanceCourte, pireDeficit, pireTension, remarques } from '@/plan/signaux'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { GEIST, MONO } from './primitives'

/**
 * Ce que l'application a remarqué.
 *
 * Trois poids, trois formes, et l'écart entre les deux est délibéré :
 *
 * - **Le déficit** a un cadre, parce qu'il y a quelque chose à décider — et
 *   les options arrivent déjà chiffrées, jamais sous forme de conseil.
 * - **Les signaux** ont un cadre mais pas de filet d'accent : ce sont des
 *   constats sur la semaine, pas des décisions du jour.
 * - **La tension** reste du texte nu. Lui donner une carte la mettrait au même
 *   rang qu'un déficit, alors qu'il n'y a précisément rien à faire.
 *
 * Ces faits ne se glissent jamais dans l'agenda : posés parmi les blocs du
 * jour, ils se liraient comme des rendez-vous qu'on aurait ratés.
 */
export function Faits({
  resultat,
  nomDe,
}: {
  resultat: PlanningResult
  nomDe: (id: string) => string | undefined
}) {
  const j = useJetons()
  const deficit = pireDeficit(resultat)
  const tension = pireTension(resultat)
  const lignes = remarques(resultat, nomDe)

  if (!deficit && !tension && lignes.length === 0) return null

  return (
    <View style={{ gap: PAS[4], marginTop: PAS[6] }}>
      {deficit ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: j.accent,
            borderRadius: RAYON.lg,
            backgroundColor: j.surface,
            padding: PAS[4],
            gap: PAS[3],
          }}
        >
          <Text style={{ color: j.text, fontFamily: GEIST.normal, fontSize: 13.5, lineHeight: 21 }}>
            Avant le {echeanceCourte(deficit.deadline)}, il manque{' '}
            <Text style={{ fontFamily: MONO.demi, color: j.accentEncre }}>
              {duree(deficit.deficitMinutes)}
            </Text>
            , soit {Math.round(deficit.deficitRatio * 100)} % du travail demandé.
          </Text>

          <View style={{ borderTopWidth: 1, borderTopColor: j.line, paddingTop: PAS[3], gap: PAS[2] }}>
            {deficit.options.map((o) => (
              <View
                key={o.action}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: PAS[3] }}
              >
                <Text
                  style={{ flex: 1, color: j.text2, fontFamily: GEIST.normal, fontSize: 12.5, lineHeight: 19 }}
                >
                  {o.action}
                </Text>
                <Text
                  style={{
                    color: j.accentEncre,
                    fontFamily: MONO.demi,
                    fontSize: 12,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  +{duree(o.minutesFreed)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {lignes.length > 0 ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: j.line,
            borderRadius: RAYON.lg,
            backgroundColor: j.surface,
            padding: PAS[4],
            gap: PAS[3],
          }}
        >
          {lignes.map((r) => (
            <View
              key={r.cle}
              style={{ borderLeftWidth: 2, borderLeftColor: j.alerte, paddingLeft: PAS[3] }}
            >
              <Text style={{ color: j.text2, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 20 }}>
                {r.texte}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {tension ? (
        <Text
          style={{ color: j.text3, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 19, paddingHorizontal: PAS[1] }}
        >
          Avant le {echeanceCourte(tension.deadline)}, {Math.round(tension.tensionRatio * 100)} % du
          temps disponible est déjà pris — encore de la marge, mais ça se resserre.
        </Text>
      ) : null}
    </View>
  )
}
