import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { effectiveContract } from '@shared/contract'
import { dayOfWeek } from '@shared/planning/dates'
import { autonomie } from '@shared/planning/habitudes'
import { faitsRevue, peutParler, revueDimanche, revueEnClair } from '@shared/coach/coach'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { useSeances } from '@/seances/magasin-seances'
import { A, Carte, GEIST } from '@/ui/app-briques'
import { coach } from './client'

const SUJET = 'coach:revue'

/**
 * La revue du dimanche (spec moteur 2026-09-25) : 3 chiffres, 1 ajustement,
 * 1 question. Les chiffres et l'ajustement viennent du moteur ; le Coach ne
 * fait que les dire. Sans Coach, la même revue en clair. Une fois lue, elle
 * se tait jusqu'à dimanche prochain.
 */
export function RevueDimanche() {
  const { aujourdHui, maintenant, resultat } = usePlan()
  const { objectifs, reglages } = useDonnees()
  const { apprentissage, poser, confirmations } = useSeances()
  const events = apprentissage.sessionEvents
  const dimanche = dayOfWeek(aujourdHui) === 6
  const auto = useMemo(
    () => (objectifs.length ? objectifs.reduce((s, o) => s + autonomie(events, o.id, aujourdHui), 0) / objectifs.length : 0),
    [objectifs, events, aujourdHui],
  )
  const revue = useMemo(
    () =>
      dimanche
        ? revueDimanche({
            events,
            today: aujourdHui,
            doses: resultat.objectiveDoses,
            noms: Object.fromEntries(objectifs.map((o) => [o.id, o.nom])),
          })
        : null,
    [dimanche, events, aujourdHui, resultat.objectiveDoses, objectifs],
  )
  const visible = !!revue && peutParler({ dernier: apprentissage.lastSignalAt[SUJET], maintenant, autonomie: auto })
  const [lignes, setLignes] = useState<string[] | null>(null)

  useEffect(() => {
    if (!visible || !revue) return
    setLignes(revueEnClair(revue))
    const mode = reglages.contrat ? effectiveContract(reglages.contrat, maintenant).mode : 'ally'
    let vivant = true
    void coach()
      .demander({ job: 'revue', mode, faits: faitsRevue(revue), messages: [] })
      .then((t) => {
        if (vivant && t) setLignes([t])
      })
    return () => {
      vivant = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, revue?.semaine])

  if (!visible || !lignes) return null
  return (
    <Carte style={{ marginTop: 12, marginHorizontal: 20, paddingVertical: 16, paddingHorizontal: 16, gap: 6 }}>
      <Text style={{ color: A.t3, fontFamily: GEIST.demi, fontSize: 11, letterSpacing: 1 }}>THIS WEEK</Text>
      {lignes.map((l, i) => (
        <Text key={i} style={{ color: i === lignes.length - 1 && l.endsWith('?') ? A.t1 : A.t2, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21 }}>
          {l}
        </Text>
      ))}
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void poser({
              apprentissage: { ...apprentissage, lastSignalAt: { ...apprentissage.lastSignalAt, [SUJET]: new Date().toISOString() } },
              confirmations,
            })
          }
          style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(242,242,242,0.1)', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}
        >
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>Got it</Text>
        </Pressable>
      </View>
    </Carte>
  )
}
