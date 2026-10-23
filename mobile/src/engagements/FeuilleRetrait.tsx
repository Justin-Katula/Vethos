import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { texteSuffisant } from '@shared/planning/report'
import { daysBetween } from '@shared/planning/dates'
import { historiquePourJuge, reglesFixes } from '@shared/planning/justification'
import type { DemandeArbitre } from '@shared/coach/arbitre'
import { useReduit } from '@/accueil/briques-introduction'
import { coach } from '@/coach/client'
import { useDonnees } from '@/donnees/magasin'
import { cleDate } from '@/plan/moteur'
import { usePlan } from '@/plan/Plan'
import { Juge, type MoteurJuge } from '@/seances/Juge'
import { useSeances } from '@/seances/magasin-seances'
import { A, BoutonBlanc, Feuille, GEIST, hm, MONO } from '@/ui/app-briques'
import { faitsPourGarder, flair, type DernierCoup, type EntreeCarnet, type Flair, type NatureRetrait } from './retrait'
import { useRetrait } from './useRetrait'

export type CibleRetrait = {
  nature: NatureRetrait
  refId: string
  nom: string
  /** L'engagement et ses parties. */
  ids: string[]
  /** Le travail total demandé (tâche), sinon null. */
  total: number | null
  creeLe: string
  /** L'échéance (tâche), AAAA-MM-JJ. */
  echeance?: string
}

type Etape = 'raison' | 'garder' | 'juge' | 'dernier'

const JOURS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MOIS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** « Thu 18:30 », « Today 18:30 » — le moment du dernier coup. */
export function quandDernierCoup(c: DernierCoup, maintenant: Date): string {
  if (!c.seance) return 'Last day'
  const [y, m, d] = c.seance.date.split('-').map(Number)
  const jour = new Date(y!, (m ?? 1) - 1, d ?? 1)
  const ecart = daysBetween(cleDate(maintenant), c.seance.date)
  const nom = ecart === 0 ? 'Today' : ecart === 1 ? 'Tomorrow' : ecart < 7 ? JOURS[jour.getDay()]! : `${jour.getDate()} ${MOIS[jour.getMonth()]}`
  return `${nom} ${hhmm(c.seance.debut)}`
}

/**
 * La braise : ce qui reste d'un engagement qui vit son dernier coup. Elle
 * respire lentement ; `forte` pour l'écran du dernier coup, petite sur la carte.
 */
export function Braise({ taille = 14, forte = false }: { taille?: number; forte?: boolean }) {
  const reduit = useReduit()
  const souffle = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduit) return
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(souffle, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    boucle.start()
    return () => boucle.stop()
  }, [reduit, souffle])
  const halo = taille * (forte ? 3.2 : 2.2)
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: halo, height: halo, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', opacity: souffle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }), transform: [{ scale: souffle.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1.06] }) }] }}>
        <Svg width={halo} height={halo}>
          <Defs>
            <RadialGradient id={`braise-${taille}-${forte ? 1 : 0}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={A.rouge} stopOpacity={forte ? 0.55 : 0.42} />
              <Stop offset="0.45" stopColor={A.rouge} stopOpacity={0.14} />
              <Stop offset="1" stopColor={A.rouge} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={halo / 2} cy={halo / 2} r={halo / 2} fill={`url(#braise-${taille}-${forte ? 1 : 0})`} />
        </Svg>
      </Animated.View>
      <View style={{ width: taille * 0.42, height: taille * 0.42, borderRadius: taille, backgroundColor: '#ffb4a8', shadowColor: A.rouge, shadowOpacity: 0.9, shadowRadius: taille * 0.5, shadowOffset: { width: 0, height: 0 } }} />
    </View>
  )
}

/**
 * « Remove » : s'expliquer, voir ce qu'on perdrait. « Keep it » ferme tout
 * (la raison reste au carnet, jamais montré). « Remove anyway » : si le flair
 * se lève, le juge lit le carnet et pose ses questions, sans dire pourquoi ;
 * sinon — ou s'il accepte — l'engagement a droit à un dernier coup, puis
 * s'éteint. Retiré dans l'heure qui suit sa création : une erreur, rien de tout ça.
 */
export function FeuilleRetrait({ cible, fermer }: { cible: CibleRetrait | null; fermer: () => void }) {
  const { maintenant, confiance } = usePlan()
  const events = useSeances((e) => e.apprentissage.sessionEvents ?? [])
  const travaille = useSeances((e) => e.apprentissage.workedMinutesByRef)
  const { lancerDernierCoup, noter, carnet } = useRetrait()
  const [etape, setEtape] = useState<Etape>('raison')
  const [texte, setTexte] = useState('')
  const [coup, setCoup] = useState<DernierCoup | null>(null)
  const [vu, setVu] = useState<Flair | null>(null)
  const precedente = useRef<string | null>(null)
  // Une nouvelle cible repart de zéro.
  if (cible && precedente.current !== cible.refId) {
    precedente.current = cible.refId
    setEtape('raison')
    setTexte('')
    setCoup(null)
    setVu(null)
  }
  if (!cible && precedente.current) precedente.current = null

  const quitter = () => {
    Keyboard.dismiss()
    fermer()
  }
  const f = cible
    ? faitsPourGarder({ ids: cible.ids, events, travaille, total: cible.total, creeLe: cible.creeLe, maintenantMs: maintenant.getTime() })
    : null

  const entree = (issue: EntreeCarnet['issue'], reponses: string[] = []): EntreeCarnet | null =>
    cible && f
      ? {
          id: `${cible.refId}-${Date.now()}`,
          refId: cible.refId,
          nature: cible.nature,
          nom: cible.nom.slice(0, 80),
          texte: texte.trim().slice(0, 500),
          reponses: reponses.map((r) => r.slice(0, 500)).slice(0, 5),
          a: new Date().toISOString(),
          joursDepuisCreation: f.jours,
          minutesFaites: f.fait,
          seances: f.seances,
          issue,
          flair: vu !== null,
        }
      : null

  const eteindreBientot = async (reponses: string[] = []) => {
    const e = entree('dernier-coup', reponses)
    if (!cible || !e) return
    setCoup(await lancerDernierCoup({ refId: cible.refId, nature: cible.nature, nom: cible.nom.slice(0, 80), ids: cible.ids }, e))
    setEtape('dernier')
  }

  // Le juge d'un retrait : il ne lit le carnet que quand le flair s'est levé.
  const moteur: MoteurJuge | null =
    cible && f
      ? {
          juger: async (echanges) => {
            if (useDonnees.getState().reglages.consentementIA !== 'oui') return { action: 'indecis' }
            const aujourdHui = cleDate(new Date())
            const historique: DemandeArbitre['historique'] = [
              ...carnet
                .map((x) => ({ x, jours: daysBetween(x.a.slice(0, 10), aujourdHui) }))
                .filter(({ jours }) => jours >= 0 && jours < 30)
                .slice(0, 20)
                .map(({ x, jours }) => ({
                  joursPasses: jours,
                  sorte: 'retrait' as const,
                  raison: null,
                  texte: `${x.nom}: ${x.texte}`.slice(0, 500),
                  reponses: x.reponses,
                  verdict: x.issue === 'refuse' ? ('refuse' as const) : x.issue === 'dernier-coup' ? ('accepte' as const) : null,
                })),
              ...historiquePourJuge(useSeances.getState().apprentissage, aujourdHui),
            ].slice(0, 40)
            const d = new Date()
            return coach().arbitrer({
              sorte: 'retrait',
              raison: null,
              texte: texte.trim().slice(0, 500),
              echanges,
              confiance: confiance.niveau,
              faits: {
                titre: cible.nom.slice(0, 80),
                nature: cible.nature === 'TASK' ? 'task' : cible.nature === 'GOAL' ? 'objective' : 'anchor',
                heure: hhmm(d.getHours() * 60 + d.getMinutes()),
                minutesPrevues: 0,
                minutesTenues: 0,
                tentativesApps: 0,
                echeanceJours: cible.echeance ? Math.max(0, Math.min(3650, daysBetween(aujourdHui, cible.echeance))) : null,
                engagement: { joursDepuisCreation: Math.min(3650, f.jours), minutesFaites: Math.min(100_000, f.fait), seances: Math.min(10_000, f.seances), pourcent: f.pourcent },
              },
              historique,
            })
          },
          conclure: async ({ reponses, verdict }) => {
            if (verdict === 'accepte') return eteindreBientot(reponses)
            const e = entree('refuse', reponses)
            if (e) await noter(e)
          },
          regles: () => reglesFixes({ texte, niveau: confiance.niveau }),
        }
      : null

  const titre = { color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 } as const
  const tuile = (valeur: string, libelle: string) => (
    <View key={libelle} style={{ flex: 1, minWidth: '45%', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(242,242,242,0.06)', gap: 2 }}>
      <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 24, lineHeight: 28, fontVariant: ['tabular-nums'] }}>{valeur}</Text>
      <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 12 }}>{libelle}</Text>
    </View>
  )

  return (
    <Feuille ouverte={!!cible} fermer={quitter} style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
      {cible && etape === 'raison' ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={titre}>{`Remove ${cible.nom}?`}</Text>
          <TextInput
            value={texte}
            onChangeText={(v) => setTexte(v.slice(0, 500))}
            placeholder="Why?"
            placeholderTextColor={A.t4}
            accessibilityLabel="Why"
            selectionColor={A.t1}
            multiline
            style={{ minHeight: 72, maxHeight: 140, borderRadius: 10, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, color: A.t1, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' }}
          />
          <BoutonBlanc
            actif={texteSuffisant(texte)}
            onPress={() => {
              if (!texteSuffisant(texte)) return
              Keyboard.dismiss()
              setEtape('garder')
            }}
          >
            Continue
          </BoutonBlanc>
        </View>
      ) : null}

      {cible && f && etape === 'garder' ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={titre}>{`Keep ${cible.nom}?`}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              tuile(hm(f.fait), 'already done'),
              ...(f.pourcent !== null ? [tuile(`${f.pourcent}%`, 'of it')] : []),
              tuile(String(f.seances), f.seances === 1 ? 'session' : 'sessions'),
              tuile(String(f.jours), f.jours === 1 ? 'day in' : 'days in'),
            ]}
          </View>
          <BoutonBlanc
            hauteur={56}
            onPress={() => {
              // Gardé : la raison reste au carnet, le flair s'en souviendra.
              const e = entree('garde')
              if (e) void noter(e)
              quitter()
            }}
          >
            Keep it
          </BoutonBlanc>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const v = flair({ carnet, texte, maintenantMs: Date.now() })
              setVu(v)
              if (v) setEtape('juge')
              else void eteindreBientot()
            }}
            style={({ pressed }) => ({ height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 15 }}>Remove anyway</Text>
          </Pressable>
        </View>
      ) : null}

      {cible && f && moteur && etape === 'juge' ? (
        <View>
          <Juge sorte="retrait" texte={texte} acc={A.t1} encre="#000" moteur={moteur} onAccepte={() => undefined} onRefuse={quitter} onAide={() => quitter()} />
        </View>
      ) : null}

      {cible && etape === 'dernier' ? (
        <View style={{ gap: 14, alignItems: 'center', paddingTop: 4 }}>
          <Braise taille={22} forte />
          <View style={{ gap: 4, alignItems: 'center' }}>
            <Text accessibilityRole="header" style={[titre, { textAlign: 'center' }]}>One last round.</Text>
            {coup ? <Text style={{ color: A.t2, fontFamily: MONO.normal, fontSize: 14, letterSpacing: 0.2 }}>{quandDernierCoup(coup, maintenant)}</Text> : null}
          </View>
          <View style={{ alignSelf: 'stretch' }}>
            <BoutonBlanc onPress={quitter}>OK</BoutonBlanc>
          </View>
        </View>
      ) : null}
    </Feuille>
  )
}
