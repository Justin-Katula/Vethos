/**
 * Commitments, comme la maquette : trois cartes — Tasks, Goals, Anchors —
 * deux engagements visibles, « See all »
 * pour le reste. Toucher une ligne l'ouvre sur place ; « + » ouvre la feuille
 * d'ajout de SA nature. Tout ce qui s'affiche est mesuré ou planifié, jamais
 * déclaré.
 */
import { useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { useDonnees, type Tache } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { cleDate } from '@/plan/moteur'
import { dateLocale } from '@/plan/format'
import { useGardeContrat } from '@/seances/garde-contrat'
import { useSeances } from '@/seances/magasin-seances'
import { CoachEnLigne } from '@/coach/CoachEnLigne'
import { maxTaskMinutesPerDay } from '@shared/planning/placement'
import { allouerCouleurAncre, allouerCouleurObjectif, allouerCouleurTache } from '@shared/palettes'
import { RoueDuree, RoueHeure, RoueJour } from '@/ui/Roue'
import {
  A,
  BoutonFermer,
  Carte,
  Chevron,
  Feuille,
  fmt,
  GEIST,
  hm,
  MONO,
  Plus,
  TitrePage,
  TRAIT,
  useLumiere,
  useToast,
  type NatureApp,
} from '@/ui/app-briques'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MOIS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const relD = (k: number) => (k <= 0 ? 'today' : k === 1 ? 'tomorrow' : `in ${k} days`)
const COULEUR: Record<NatureApp, string> = { TASK: '#8d8d8d', GOAL: '#e03131', ANCHOR: '#4b6190' }

const SECTIONS: Record<NatureApp, { titre: string; cta: string }> = {
  TASK: {
    titre: 'Tasks',
    cta: 'Add a task',
  },
  GOAL: {
    titre: 'Goals',
    cta: 'Add a goal',
  },
  ANCHOR: {
    titre: 'Anchors',
    cta: 'Add an anchor',
  },
}
const FORM: Record<NatureApp, [string, string, string]> = {
  TASK: ['New task', 'What needs to be done?', 'Add it'],
  GOAL: ['New goal', 'What do you want to keep doing?', 'Add it'],
  ANCHOR: ['New anchor', 'What happens at a fixed hour?', 'Add it'],
}

type Groupe = { racine: Tache; parties: Tache[]; total: number; fait: number }
function grouper(ouvertes: Tache[], fait: Record<string, number>): Groupe[] {
  const total = (t: Tache) => t.minutesRestantes + t.minutesSupplementaires
  return ouvertes
    .filter((t) => t.parentId === null)
    .map((racine) => {
      const parties = ouvertes.filter((t) => t.parentId === racine.id)
      if (!parties.length) return { racine, parties, total: total(racine), fait: fait[racine.id] ?? 0 }
      return {
        racine,
        parties,
        total: parties.reduce((s, p) => s + total(p), 0),
        fait: parties.reduce((s, p) => s + (fait[p.id] ?? 0), 0),
      }
    })
    .sort((a, b) => a.racine.echeance.localeCompare(b.racine.echeance))
}

function Pilule({ children, onPress, contour = false }: { children: React.ReactNode; onPress: () => void; contour?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        height: 34,
        paddingHorizontal: 14,
        borderRadius: 17,
        justifyContent: 'center',
        backgroundColor: contour ? 'transparent' : 'rgba(242,242,242,0.1)',
        borderWidth: contour ? 1 : 0,
        borderColor: 'rgba(242,242,242,0.14)',
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Text style={{ color: contour ? A.t3 : A.t1, fontFamily: GEIST.moyen, fontSize: 13 }}>{children}</Text>
    </Pressable>
  )
}

export default function Engagements() {
  const marges = useSafeAreaInsets()
  const d = useDonnees()
  const { resultat, maintenant } = usePlan()
  const { acc } = useLumiere()
  const toast = useToast()
  const garde = useGardeContrat()
  const fait = useSeances((e) => e.apprentissage.workedMinutesByRef)
  const servis = useSeances((e) => e.apprentissage.weeklyObjectiveServed)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [page, setPage] = useState<NatureApp | null>(null)
  const [finiesOuvertes, setFiniesOuvertes] = useState(false)
  const [forme, setForme] = useState<NatureApp | null>(null)
  const defile = useRef<ScrollView>(null)

  const aujourdHui = dateLocale(cleDate(maintenant))
  const jours = (cle: string) => Math.round((dateLocale(cle).getTime() - aujourdHui.getTime()) / 864e5)
  const groupes = grouper(d.taches.filter((t) => !t.terminee), fait)
  const finies = d.taches.filter((t) => t.terminee && t.parentId === null)
  const couper = <T,>(l: T[]) => (page ? l : l.slice(0, 2))
  const basculer = (id: string) => setOuvert((x) => (x === id ? null : id))
  const allerPage = (p: NatureApp | null) => {
    setPage(p)
    setOuvert(null)
    defile.current?.scrollTo({ y: 0, animated: false })
  }

  const ligneTache = (g: Groupe) => {
    const t = g.racine
    const k = jours(t.echeance)
    const o = ouvert === t.id
    const n = Math.max(1, g.parties.length)
    return (
      <Pressable key={t.id} accessibilityRole="button" accessibilityState={{ expanded: o }} onPress={() => basculer(t.id)} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: A.ligne }}>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          <View style={{ width: 34, gap: 2 }}>
            <Text style={{ color: k <= 7 ? acc : A.t1, fontFamily: GEIST.moyen, fontSize: 24, lineHeight: 24, letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{Math.max(0, k)}</Text>
            <Text style={{ color: A.t4, fontFamily: GEIST.moyen, fontSize: 11 }}>{k === 1 ? 'day left' : 'days left'}</Text>
          </View>
          <View style={{ flex: 1, gap: 7, paddingTop: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: A.t1, fontFamily: GEIST.demi, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 }}>{t.titre}</Text>
              <Text numberOfLines={1} style={{ flexShrink: 0, color: A.t2, fontFamily: MONO.normal, fontSize: 12 }}>{`${hm(Math.max(0, g.total - g.fait))} left`}</Text>
            </View>
            <View style={{ height: 2, borderRadius: 1, backgroundColor: 'rgba(242,242,242,0.1)', overflow: 'hidden' }}>
              <View style={{ height: 2, width: `${g.total ? Math.min(100, (g.fait / g.total) * 100) : 0}%`, backgroundColor: A.t1 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: A.t3, fontFamily: GEIST.normal, fontSize: 12 }}>{`${n} ${n > 1 ? 'parts' : 'part'} · ${hm(g.total)} total`}</Text>
              <View accessibilityLabel={`Importance ${t.importance} out of 10`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 10 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <View key={i} style={{ width: 2, height: 3 + i * 0.7, borderRadius: 1, backgroundColor: i < t.importance ? (i >= 7 ? acc : A.t2) : 'rgba(242,242,242,0.12)' }} />
                ))}
              </View>
            </View>
          </View>
        </View>
        {o ? (
          <View style={{ gap: 12, paddingTop: 12, paddingLeft: 50 }}>
            {t.intention ? <Text style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{t.intention}</Text> : null}
            <CoachEnLigne job="decoupage" libelle="Break it down" faits={{ tache: t.titre, plan: (t.intention ?? '').slice(0, 200), minutes_restantes: t.minutesRestantes }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pilule
                onPress={() => {
                  const cible = g.parties.length ? g.parties[g.parties.length - 1]! : t
                  void d.ajouterDuTemps(cible.id, 25)
                  toast(`25 min more for ${t.titre}.`)
                }}
              >
                +25 min
              </Pilule>
              <Pilule
                contour
                onPress={() => {
                  if (!garde()) return
                  for (const p of g.parties) void d.supprimerTache(p.id)
                  void d.supprimerTache(t.id)
                  toast(`${t.titre} removed.`)
                }}
              >
                Remove
              </Pilule>
            </View>
          </View>
        ) : null}
      </Pressable>
    )
  }

  const ligneObjectif = (o: (typeof d.objectifs)[number]) => {
    const fait2 = servis[o.id] ?? 0
    // Rampe de départ : la semaine se mesure à sa DOSE, et la cible reste la
    // destination — un écart qui se lit comme une progression, jamais un retard.
    const dose = resultat.objectiveDoses[o.id]?.dose ?? o.cibleHebdoMinutes
    const fr = dose ? Math.min(1, fait2 / dose) : 0
    const ou = ouvert === o.id
    return (
      <Pressable key={o.id} accessibilityRole="button" accessibilityState={{ expanded: ou }} onPress={() => basculer(o.id)} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: A.ligne }}>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <View style={{ width: 34, height: 34 }}>
            <Svg width={34} height={34} viewBox="0 0 34 34" style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={17} cy={17} r={15} fill="none" stroke="rgba(242,242,242,0.1)" strokeWidth={2.5} />
              <Circle cx={17} cy={17} r={15} fill="none" stroke={A.t1} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${(fr * 94.25).toFixed(1)} 94.25`} />
            </Svg>
            <Text style={{ position: 'absolute', width: 34, top: 11, textAlign: 'center', color: A.t2, fontFamily: GEIST.demi, fontSize: 10 }}>{`${Math.round(fr * 100)}%`}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: A.t1, fontFamily: GEIST.demi, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 }}>{o.nom}</Text>
              <Text style={{ color: A.t2, fontFamily: MONO.normal, fontSize: 12 }}>{`${hm(fait2)} / ${hm(dose)}`}</Text>
            </View>
            <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 12 }}>{dose < o.cibleHebdoMinutes ? `This week ${hm(dose)} · toward ${hm(o.cibleHebdoMinutes)}` : `About ${hm(dose / 7)} a day · this week`}</Text>
          </View>
        </View>
        {ou ? (
          <View style={{ gap: 12, paddingTop: 12 }}>
            {o.intention ? <Text style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{o.intention}</Text> : null}
            <View style={{ flexDirection: 'row' }}>
              <Pilule contour onPress={() => garde() && (void d.supprimerObjectif(o.id), toast(`${o.nom} removed.`))}>
                Remove
              </Pilule>
            </View>
          </View>
        ) : null}
      </Pressable>
    )
  }

  const ligneAncre = (a: (typeof d.ancres)[number]) => {
    const ou = ouvert === a.id
    return (
      <Pressable key={a.id} accessibilityRole="button" accessibilityState={{ expanded: ou }} onPress={() => basculer(a.id)} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: A.ligne }}>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          <View style={{ width: 54, gap: 2 }}>
            <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 18, lineHeight: 22, letterSpacing: -0.6, fontVariant: ['tabular-nums'] }}>{fmt(a.minuteAncrage)}</Text>
            <Text style={{ color: A.t4, fontFamily: GEIST.moyen, fontSize: 11 }}>{hm(a.dureeMinutes)}</Text>
          </View>
          <View style={{ flex: 1, gap: 7, paddingTop: 1 }}>
            <Text numberOfLines={1} style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 }}>{a.nom}</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {DOW.map((t, i) => {
                const on = a.jours.includes((i + 1) % 7)
                return (
                  <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: on ? COULEUR.ANCHOR : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: on ? A.t1 : A.t4, fontFamily: GEIST.demi, fontSize: 10 }}>{t}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        </View>
        {ou ? (
          <View style={{ gap: 12, paddingTop: 12, paddingLeft: 70 }}>
            {a.intention ? <Text style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{a.intention}</Text> : null}
            <View style={{ flexDirection: 'row' }}>
              <Pilule contour onPress={() => garde() && (void d.supprimerAncre(a.id), toast(`${a.nom} removed.`))}>
                Remove
              </Pilule>
            </View>
          </View>
        ) : null}
      </Pressable>
    )
  }

  const section = (K: NatureApp, total: number, resumeTxt: string, lignes: React.ReactNode[], extra?: React.ReactNode) => {
    const s = SECTIONS[K]
    return (
      <Carte key={K} style={{ marginTop: K === 'TASK' || page ? 24 : 12, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 8 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: COULEUR[K] }} />
              <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 }}>{s.titre}</Text>
              <Text style={{ color: A.t4, fontFamily: GEIST.moyen, fontSize: 15 }}>{total}</Text>
            </View>
            {resumeTxt ? <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{resumeTxt}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={s.cta}
            onPress={() => garde() && setForme(K)}
            style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: A.s, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }] })}
          >
            <Plus />
          </Pressable>
        </View>
        {total ? (
          <>
            {lignes}
            {!page && total > 2 ? (
              <Pressable accessibilityRole="button" onPress={() => allerPage(K)} style={{ height: 44, borderTopWidth: 1, borderTopColor: A.ligne, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 13 }}>{`See all ${total}`}</Text>
              </Pressable>
            ) : null}
            {extra}
          </>
        ) : (
          <View style={{ alignItems: 'flex-start', paddingVertical: 16, borderTopWidth: 1, borderTopColor: A.ligne }}>
            <Pressable accessibilityRole="button" onPress={() => garde() && setForme(K)} style={({ pressed }) => ({ height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: 'rgba(242,242,242,0.1)', justifyContent: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 13 }}>{s.cta}</Text>
            </Pressable>
          </View>
        )}
      </Carte>
    )
  }

  const finiesBloc =
    page === 'TASK' && finies.length ? (
      <>
        <Pressable onPress={() => setFiniesOuvertes((v) => !v)} style={{ height: 44, borderTopWidth: 1, borderTopColor: A.ligne, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 13 }}>{`${finies.length} finished`}</Text>
          <View style={{ transform: [{ rotate: finiesOuvertes ? '180deg' : '0deg' }] }}>
            <Chevron sens="bas" couleur={A.t4} />
          </View>
        </Pressable>
        {finiesOuvertes
          ? finies.map((t) => {
              const q = dateLocale(t.echeance)
              return (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: A.t4 }} />
                  <Text numberOfLines={1} style={{ flex: 1, color: A.t4, fontFamily: GEIST.normal, fontSize: 14, textDecorationLine: 'line-through' }}>{t.titre}</Text>
                  <Text style={{ color: A.t4, fontFamily: MONO.normal, fontSize: 11 }}>{`${q.getDate()} ${MOIS3[q.getMonth()]}`}</Text>
                </View>
              )
            })
          : null}
      </>
    ) : null

  const sections = [
    section('TASK', groupes.length, groupes.length ? `Next due ${relD(jours(groupes[0]!.racine.echeance))}` : '', couper(groupes).map(ligneTache), finiesBloc),
    section(
      'GOAL',
      d.objectifs.length,
      d.objectifs.length ? `${hm(d.objectifs.reduce((q, o) => q + o.cibleHebdoMinutes, 0))} a week in total` : '',
      couper(d.objectifs).map(ligneObjectif),
    ),
    section(
      'ANCHOR',
      d.ancres.length,
      d.ancres.length ? `${d.ancres.reduce((q, a) => q + a.jours.length, 0)} fixed slots a week` : '',
      couper(d.ancres).map(ligneAncre),
    ),
  ]
  const visibles = page ? sections.filter((_, i) => (['TASK', 'GOAL', 'ANCHOR'] as const)[i] === page) : sections

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={defile} contentContainerStyle={{ paddingTop: marges.top + 20, paddingHorizontal: 20, paddingBottom: 120, width: '100%', maxWidth: 640, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
        {page ? (
          <Pressable accessibilityRole="button" onPress={() => allerPage(null)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}>
            <Chevron sens="gauche" taille={14} />
            <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 16 }}>Commitments</Text>
          </Pressable>
        ) : (
          <TitrePage>Commitments</TitrePage>
        )}
        {visibles}
      </ScrollView>
      <Formulaire
        nature={forme}
        fermer={() => setForme(null)}
        creer={async (f) => {
          if (f.K === 'TASK') {
            await d.ajouterTache(
              { titre: f.nom, intention: f.plan, couleur: allouerCouleurTache(d.taches.filter((x) => !x.terminee)), echeance: f.echeance, importance: f.imp, minutesEstimees: f.minutes, nature: f.premiere ? 'nouveau' : 'routine' },
              { maxParJourMinutes: maxTaskMinutesPerDay(resultat.capacities) },
            )
            toast('Added.')
          } else if (f.K === 'GOAL') {
            await d.ajouterObjectif({ nom: f.nom, intention: f.plan, couleur: allouerCouleurObjectif(d.objectifs), cibleHebdoMinutes: f.minutes })
            toast('Added.')
          } else {
            await d.ajouterAncre({ nom: f.nom, intention: f.plan, declencheur: f.nom, couleur: allouerCouleurAncre(d.ancres), minuteAncrage: f.a, jours: f.jours, dureeMinutes: f.minutes })
            toast('Added.')
          }
        }}
      />
    </View>
  )
}

type Saisie = { K: NatureApp; nom: string; plan: string; minutes: number; echeance: string; imp: number; premiere: boolean; a: number; jours: number[] }

function Formulaire({ nature, fermer, creer }: { nature: NatureApp | null; fermer: () => void; creer: (f: Saisie) => Promise<void> }) {
  const [K, setK] = useState<NatureApp>('TASK')
  const [nom, setNom] = useState('')
  const [plan, setPlan] = useState('')
  const [dur, setDur] = useState(120)
  const [due, setDue] = useState('')
  const [imp, setImp] = useState(5)
  const [premiere, setPremiere] = useState(true)
  const [hebdo, setHebdo] = useState(180)
  const [a, setA] = useState('18:30')
  const [len, setLen] = useState(60)
  const [jours, setJours] = useState<number[]>([])
  const [err, setErr] = useState('')
  const [occupe, setOccupe] = useState(false)
  const ouvert = nature !== null
  const precedent = useRef<NatureApp | null>(null)
  if (nature && precedent.current !== nature) {
    precedent.current = nature
    setK(nature)
    setNom('')
    setPlan('')
    setJours([])
    setErr('')
    const d = new Date()
    d.setDate(d.getDate() + 6)
    setDue(cleDate(d))
  }
  if (!nature && precedent.current) precedent.current = null
  const { acc } = useLumiere()
  const [titre, ph, cta] = FORM[K]
  const pret = nom.trim().length > 0 && plan.trim().length > 0
  const champ = { height: 44, borderRadius: 8, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 14, color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 } as const
  const etiquette = (t: string) => <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>{t}</Text>
  const enregistrer = async () => {
    if (occupe) return
    if (!nom.trim()) return setErr('Give it a name.')
    if (!plan.trim()) return setErr('Explain what you will do.')
    if (K === 'TASK' && !dur) return setErr('How much work does it need?')
    if (K === 'GOAL' && !hebdo) return setErr('How much time each week?')
    if (K === 'ANCHOR' && !len) return setErr('How long does it last?')
    if (K === 'ANCHOR' && !jours.length) return setErr('Pick at least one day.')
    const [h, m] = a.split(':').map(Number)
    setOccupe(true)
    try {
      await creer({ K, nom: nom.trim(), plan: plan.trim(), minutes: K === 'TASK' ? dur : K === 'GOAL' ? hebdo : len, echeance: due, imp, premiere, a: (h ?? 0) * 60 + (m ?? 0), jours })
      Keyboard.dismiss()
      fermer()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create.')
    } finally {
      setOccupe(false)
    }
  }
  return (
    <Feuille ouverte={ouvert} fermer={fermer} voile={false} style={{ paddingHorizontal: 14, paddingBottom: 16, maxHeight: 720 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 8, paddingRight: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: TRAIT[K] }} />
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 }}>{titre}</Text>
        </View>
        <BoutonFermer onPress={fermer} />
      </View>
      <ScrollView style={{ marginTop: 14 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ borderRadius: 8, backgroundColor: 'rgba(242,242,242,0.055)', paddingTop: 14, paddingHorizontal: 14, paddingBottom: 16, gap: 14 }}>
          <TextInput value={nom} onChangeText={(v) => (setNom(v.slice(0, 60)), setErr(''))} placeholder={ph} placeholderTextColor={A.t4} accessibilityLabel="Name" selectionColor={A.t1} style={champ} />
          <View>
            <TextInput value={plan} onChangeText={(v) => (setPlan(v.slice(0, 200)), setErr(''))} placeholder="What exactly will you do?" placeholderTextColor={A.t4} accessibilityLabel="Plan" selectionColor={A.t1} style={[champ, { fontFamily: GEIST.normal }]} />
            <Text style={{ marginTop: 6, paddingRight: 4, textAlign: 'right', color: A.t4, fontFamily: MONO.normal, fontSize: 10 }}>{`${plan.length} / 200`}</Text>
          </View>
          {K === 'TASK' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  {etiquette('Work needed')}
                  <RoueDuree minutes={dur} changer={setDur} maxHeures={150} etiquette="Work needed" bande="rgba(242,242,242,0.08)" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  {etiquette('Due')}
                  <RoueJour valeur={due} changer={setDue} jours={30} etiquette="Due" bande="rgba(242,242,242,0.08)" />
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 13 }}>Importance</Text>
                  <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 13 }}>{`${imp}/10`}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 32 }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <Pressable key={i} accessibilityLabel={`Importance ${i + 1}`} onPress={() => setImp(i + 1)} style={{ flex: 1, height: `${30 + i * 7.8}%`, borderRadius: 3, backgroundColor: i < imp ? (i >= 7 ? acc : A.t1) : 'rgba(242,242,242,0.1)' }} />
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
                {([['Done before', false], ['First time', true]] as const).map(([t, v]) => (
                  <Pressable key={t} accessibilityRole="radio" accessibilityState={{ selected: premiere === v }} onPress={() => setPremiere(v)} style={{ paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: premiere === v ? A.t1 : 'transparent' }}>
                    <Text style={{ color: premiere === v ? A.t1 : A.t3, fontFamily: GEIST.moyen, fontSize: 13 }}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {K === 'GOAL' ? (
            <>
              <View style={{ width: 220, alignSelf: 'center', gap: 2 }}>
                {etiquette('Every week')}
                <RoueDuree minutes={hebdo} changer={setHebdo} maxHeures={100} etiquette="Every week" bande="rgba(242,242,242,0.08)" />
              </View>
              <Text style={{ minHeight: 18, color: A.t3, fontFamily: GEIST.normal, fontSize: 13, textAlign: 'center' }}>{hebdo ? `About ${hm(hebdo / 7)} a day` : ''}</Text>
            </>
          ) : null}
          {K === 'ANCHOR' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  {etiquette('At')}
                  <RoueHeure valeur={a} changer={setA} etiquette="At" bande="rgba(242,242,242,0.08)" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  {etiquette('For')}
                  <RoueDuree minutes={len} changer={setLen} maxHeures={8} etiquette="For" bande="rgba(242,242,242,0.08)" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {DOW.map((t, i) => {
                  const g = (i + 1) % 7
                  const on = jours.includes(g)
                  return (
                    <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setJours((j) => (on ? j.filter((x) => x !== g) : [...j, g]))} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: on ? A.t1 : 'rgba(242,242,242,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: on ? '#000' : A.t3, fontFamily: GEIST.demi, fontSize: 13 }}>{t}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          ) : null}
        </View>
        <Text style={{ minHeight: 18, paddingHorizontal: 8, color: A.rouge, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{err}</Text>
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        onPress={() => void enregistrer()}
        style={({ pressed }) => ({ marginTop: 4, height: 52, borderRadius: 8, backgroundColor: A.t1, alignItems: 'center', justifyContent: 'center', opacity: pret ? 1 : 0.4, transform: [{ scale: pressed ? 0.975 : 1 }] })}
      >
        <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 16 }}>{occupe ? 'Adding…' : cta}</Text>
      </Pressable>
    </Feuille>
  )
}
