/**
 * My time, comme la maquette : treize jours — six derrière, aujourd'hui, six
 * devant —, trois colonnes à l'écran, la nuit hors de la grille. Le passé est
 * voilé, maintenant est une ligne de la couleur de l'heure. Toucher une séance
 * dit pourquoi elle est là ; le temps fixe se déclare dans sa feuille.
 *
 * Les jours à venir viennent du vrai plan (sept jours) ; les jours passés ne
 * montrent que ce qui était fixe : Vethos ne garde pas de plan d'hier, et
 * n'en inventera pas.
 */
import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Path, Stop, Rect } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useDonnees, type Obligation } from '@/donnees/magasin'
import { verifierSommeil } from '@/donnees/regle-sommeil'
import { usePlan } from '@/plan/Plan'
import { cleDate } from '@/plan/moteur'
import type { SegmentTemps } from '@/plan/lecture'
import { useSeances } from '@/seances/magasin-seances'
import { RoueHeure } from '@/ui/Roue'
import { accentApp } from '@/ui/lumiere'
import {
  A,
  BoutonBlanc,
  BoutonFermer,
  Cadenas,
  Chevron,
  Feuille,
  fmt,
  GEIST,
  hm,
  Lune,
  MONO,
  Plus,
  TitrePage,
  TYPEC,
  useLumiere,
  useToast,
  type NatureApp,
} from '@/ui/app-briques'

const AUJ = 6
const ND = 13
const GOUTTIERE = 46
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DOWL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MOIS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CATS: [Obligation['categoryType'], string][] = [
  ['school', 'School'],
  ['work', 'Work'],
  ['commute', 'Commute'],
  ['custom', 'Personal'],
]
const nomCat = (c: Obligation['categoryType']) => CATS.find((x) => x[0] === c)?.[1] ?? 'Commitment'
const enMin = (h: string) => {
  const [a, b] = h.split(':').map(Number)
  return (a ?? 0) * 60 + (b ?? 0)
}
const lundiDabord = (d: Date) => (d.getDay() + 6) % 7
const natureSeg = (s: SegmentTemps): NatureApp | null =>
  s.nature === 'task' ? 'TASK' : s.nature === 'objective' ? 'GOAL' : s.nature === 'ancre' ? 'ANCHOR' : null
const vibrer = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)

export default function MonTemps() {
  const marges = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { acc } = useLumiere()
  const toast = useToast()
  const { jours, minute: N, maintenant } = usePlan()
  const d = useDonnees()
  const confirmees = useSeances((e) => e.confirmations)
  const [vis, setVis] = useState(AUJ)
  const [sel, setSel] = useState<SegmentTemps | null>(null)
  const [fixe, setFixe] = useState(false)
  const [nouveau, setNouveau] = useState(false)
  const grille = useRef<ScrollView>(null)
  const pose = useRef(false)

  const larg = Math.min(width, 900)
  const COLW = (larg - GOUTTIERE) / 3
  const WAKE = enMin(d.reglages.lever)
  let BED = enMin(d.reglages.coucher)
  if (BED <= WAKE) BED += 1440
  BED = Math.min(1440, BED)
  const HAUT_GRILLE = marges.top + 20 + 129
  const GRIDH = Math.max(320, height - HAUT_GRILLE - 62 - (49 + Math.max(marges.bottom, 12)) - 16)
  const PH = GRIDH / ((BED - WAKE) / 60)
  const Y = (m: number) => ((Math.max(WAKE, Math.min(BED, m)) - WAKE) / 60) * PH

  // Les treize jours.
  const jourZero = useMemo(() => {
    const x = new Date(maintenant)
    x.setHours(12, 0, 0, 0)
    return x
  }, [maintenant])
  const DAYS = useMemo(
    () =>
      Array.from({ length: ND }, (_, i) => {
        const x = new Date(jourZero)
        x.setDate(x.getDate() + i - AUJ)
        return { date: x, cle: cleDate(x), l: DOW[lundiDabord(x)]!, L: DOWL[lundiDabord(x)]!, n: x.getDate() }
      }),
    [jourZero],
  )
  const segmentsDe = (i: number): SegmentTemps[] => {
    if (i >= AUJ) return (jours.find((j) => j.date === DAYS[i]!.cle)?.segments ?? []).filter((s) => s.nature !== 'sleep')
    // Le passé : seulement ce qui était fixe ce jour-là.
    const dt = DAYS[i]!
    return d.obligations
      .filter((o) => o.categoryType !== 'sleep' && (o.date ? o.date === dt.cle : o.dayOfWeek === dt.date.getDay()))
      .map((o) => ({ id: `${o.id}-${dt.cle}`, date: dt.cle, debut: o.startMinute, fin: o.endMinute, titre: o.label, nature: 'fixed' as const, travail: 0 }))
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const v = Math.max(0, Math.min(ND - 3, Math.round(e.nativeEvent.contentOffset.x / COLW)))
    if (v !== vis) setVis(v)
  }
  const allerAujourdhui = () => grille.current?.scrollTo({ x: AUJ * COLW, animated: true })

  const heures: number[] = []
  for (let m = Math.ceil(WAKE / 60) * 60; m <= BED; m += 60) heures.push(m)
  const nowOn = N >= WAKE && N <= BED
  const d0 = DAYS[vis]!
  const d2 = DAYS[Math.min(ND - 1, vis + 2)]!
  const plage = d0.date.getMonth() === d2.date.getMonth() ? `${d0.n} — ${d2.n} ${MOIS3[d2.date.getMonth()]}` : `${d0.n} ${MOIS3[d0.date.getMonth()]} — ${d2.n} ${MOIS3[d2.date.getMonth()]}`
  const nbFixes = new Set(d.obligations.filter((o) => o.categoryType !== 'sleep').map((o) => `${o.label}|${o.startMinute}|${o.endMinute}|${o.date ?? ''}`)).size

  return (
    <View style={{ flex: 1 }}>
      {/* En-tête */}
      <View style={{ position: 'absolute', left: 20, right: 20, top: marges.top + 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ gap: 6, flex: 1 }}>
          <TitrePage>My time</TitrePage>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={{ flexShrink: 0, marginRight: 4, color: A.t3, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 20 }}>{plage}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sleep ${d.reglages.coucher} to ${d.reglages.lever}`} onPress={() => setFixe(true)} style={({ pressed }) => ({ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: A.s, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
              <Lune />
              <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 12 }}>{`${d.reglages.coucher} – ${d.reglages.lever}`}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setFixe(true)} style={({ pressed }) => ({ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: A.s, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
              <Cadenas />
              <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 12 }}>{`${nbFixes} fixed`}</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 34 }}>
          <Pressable accessibilityRole="button" disabled={vis === AUJ} onPress={allerAujourdhui} style={{ height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: A.s, justifyContent: 'center', opacity: vis === AUJ ? 0 : 1 }}>
            <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 13 }}>Today</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="New fixed commitment" onPress={() => setNouveau(true)} style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 8, backgroundColor: A.s, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Plus taille={14} />
          </Pressable>
        </View>
      </View>

      {/* La gouttière des heures */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: HAUT_GRILLE + 52 + 1, width: GOUTTIERE, height: GRIDH + 20 }}>
        <View style={{ marginTop: 10, height: GRIDH }}>
          <Svg style={{ position: 'absolute', left: 6, top: 0 }} width={2} height={GRIDH}>
            <Defs>
              <LinearGradient id="bande" x1="0" y1="0" x2="0" y2="1">
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <Stop key={f} offset={f} stopColor={accentApp(((WAKE + (BED - WAKE) * f) / 60) % 24)} stopOpacity={0.55} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect width={2} height={GRIDH} rx={1} fill="url(#bande)" />
          </Svg>
          {heures.map((m) => (
            <Text key={m} style={{ position: 'absolute', right: 8, top: Y(m) - 5, color: A.t4, fontFamily: MONO.normal, fontSize: 9, lineHeight: 10, opacity: nowOn && (Math.abs(m - N) * PH) / 60 < 14 ? 0 : 1 }}>
              {fmt(m)}
            </Text>
          ))}
          {nowOn ? (
            <View style={{ position: 'absolute', right: 4, top: Y(N) - 8, height: 16, paddingHorizontal: 4, borderRadius: 4, backgroundColor: acc, justifyContent: 'center' }}>
              <Text style={{ color: '#000', fontFamily: MONO.demi, fontSize: 9 }}>{fmt(N)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* La grille : en-têtes et colonnes défilent ensemble, trois par écran */}
      <ScrollView
        ref={grille}
        horizontal
        snapToInterval={COLW}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: AUJ * COLW, y: 0 }}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onLayout={() => {
          // Le web ignore `contentOffset` : on se pose sur aujourd'hui à l'ouverture.
          if (!pose.current) {
            pose.current = true
            grille.current?.scrollTo({ x: AUJ * COLW, animated: false })
          }
        }}
        style={{ position: 'absolute', left: GOUTTIERE, right: 0, top: HAUT_GRILLE }}
      >
        <View>
          <View style={{ flexDirection: 'row', height: 52, borderBottomWidth: 1, borderBottomColor: 'rgba(242,242,242,0.08)' }}>
            {DAYS.map((x, i) => (
              <View key={x.cle} style={{ width: COLW, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Text style={{ color: i === AUJ ? A.t1 : i < AUJ ? A.t4 : A.t3, fontFamily: GEIST.moyen, fontSize: 13 }}>{x.l}</Text>
                <View style={{ minWidth: 28, height: 24, paddingHorizontal: 4, borderRadius: 6, backgroundColor: i === AUJ ? acc : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: i === AUJ ? '#000' : i < AUJ ? A.t4 : A.t1, fontFamily: MONO.normal, fontSize: 13 }}>{x.n}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={{ paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', height: GRIDH }}>
              {heures.map((m) => (
                <View key={m} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: Y(m), height: 1, backgroundColor: 'rgba(242,242,242,0.06)' }} />
              ))}
              {DAYS.map((x, i) => {
                const segs = segmentsDe(i)
                const voile = i < AUJ ? GRIDH : i === AUJ ? Y(N) : 0
                return (
                  <View key={x.cle} style={{ width: COLW, borderLeftWidth: 1, borderLeftColor: 'rgba(242,242,242,0.05)' }}>
                    {segs.map((s) => {
                      const a = Math.max(WAKE, s.debut)
                      const b = Math.min(BED, s.fin)
                      if (b <= a) return null
                      const h = Math.max(14, Y(b) - Y(a))
                      const n = natureSeg(s)
                      const t = `${fmt(s.debut)} – ${fmt(s.fin)}`
                      if (!n)
                        return (
                          <Pressable
                            key={s.id}
                            accessibilityLabel={`${s.titre}, fixed, ${t}`}
                            onPress={() => toast(`${s.titre} is fixed. Nothing goes on top of it.`)}
                            style={{ position: 'absolute', left: 3, right: 3, top: Y(a), height: h, borderRadius: 8, backgroundColor: '#1d1d1f', borderWidth: 1, borderColor: 'rgba(242,242,242,0.07)', paddingVertical: 7, paddingHorizontal: 8, overflow: 'hidden', zIndex: 4 }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Cadenas taille={10} couleur={A.t3} epais={2.4} />
                              <Text numberOfLines={1} style={{ flexShrink: 1, color: A.t2, fontFamily: GEIST.demi, fontSize: 12, lineHeight: 15 }}>{s.titre}</Text>
                            </View>
                            {h >= 38 ? <Text numberOfLines={1} style={{ marginTop: 3, color: A.t4, fontFamily: MONO.normal, fontSize: 10, lineHeight: 13 }}>{t}</Text> : null}
                          </Pressable>
                        )
                      const vivant = i === AUJ && s.debut <= N && N < s.fin
                      const on = sel?.id === s.id
                      return (
                        <Pressable
                          key={s.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${s.titre}, ${t}`}
                          onPress={() => (vibrer(), setSel(s))}
                          style={{
                            position: 'absolute',
                            left: 3,
                            right: 3,
                            top: Y(a),
                            height: h,
                            borderRadius: 8,
                            backgroundColor: TYPEC[n],
                            borderWidth: vivant || on ? 1.5 : 0,
                            borderColor: on ? A.t1 : acc,
                            paddingVertical: 6,
                            paddingHorizontal: 8,
                            overflow: 'hidden',
                            zIndex: on ? 15 : 5,
                          }}
                        >
                          <Text numberOfLines={1} style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 12, lineHeight: 15 }}>{s.titre}</Text>
                          {h >= 38 ? <Text numberOfLines={1} style={{ marginTop: 2, color: 'rgba(242,242,242,0.7)', fontFamily: MONO.normal, fontSize: 10, lineHeight: 13 }}>{t}</Text> : null}
                        </Pressable>
                      )
                    })}
                    {voile ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: voile, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 25 }} /> : null}
                    {i === AUJ && nowOn ? (
                      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: Y(N) - 1, height: 2, backgroundColor: acc, zIndex: 30 }}>
                        <View style={{ position: 'absolute', left: -3, top: -2, width: 6, height: 6, borderRadius: 3, backgroundColor: acc }} />
                      </View>
                    ) : null}
                  </View>
                )
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      <FeuilleSeance seg={sel} fermer={() => setSel(null)} DAYS={DAYS} N={N} acc={acc} confirmees={confirmees.confirmedAt} segmentsDe={segmentsDe} />
      <FeuilleFixe ouverte={fixe} fermer={() => setFixe(false)} nouveau={() => (setFixe(false), setNouveau(true))} />
      <FeuilleNouveau ouverte={nouveau} fermer={() => setNouveau(false)} DAYS={DAYS} />
    </View>
  )
}

// ——— La séance ———

function FeuilleSeance({
  seg,
  fermer,
  DAYS,
  N,
  acc,
  confirmees,
  segmentsDe,
}: {
  seg: SegmentTemps | null
  fermer: () => void
  DAYS: { cle: string; l: string; L: string; n: number }[]
  N: number
  acc: string
  confirmees: Record<string, number>
  segmentsDe: (i: number) => SegmentTemps[]
}) {
  const { taches, objectifs, ancres } = useDonnees()
  const servis = useSeances((e) => e.apprentissage.weeklyObjectiveServed)
  const dernier = useRef<SegmentTemps | null>(null)
  if (seg) dernier.current = seg
  const s = seg ?? dernier.current
  if (!s) return <Feuille ouverte={false} fermer={fermer}>{null}</Feuille>
  const n = natureSeg(s) ?? 'TASK'
  const iJour = DAYS.findIndex((x) => x.cle === s.date)
  const statut = (x: SegmentTemps, i: number): [string, string] => {
    const passe = i < AUJ || (i === AUJ && x.fin <= N)
    if (passe) return x.bloc && confirmees[x.bloc.id] ? ['Done', A.t2] : ['Missed', A.rouge]
    if (i === AUJ && x.debut <= N && N < x.fin) return ['Now', acc]
    return ['Upcoming', A.t3]
  }
  const miennes = DAYS.flatMap((x, i) => segmentsDe(i).filter((y) => y.ref && y.ref === s.ref).map((y) => ({ y, i }))).filter((z) => z.i >= AUJ)
  const [st, stc] = statut(s, iJour)
  const ancre = ancres.find((a) => a.id === s.ref)
  const objectif = objectifs.find((o) => o.id === s.ref)
  const tache = taches.find((t) => t.id === s.ref)
  const place = miennes.reduce((q, z) => q + z.y.fin - z.y.debut, 0)
  const stat =
    n === 'GOAL' && objectif
      ? `${hm(servis[objectif.id] ?? 0)} of ${hm(objectif.cibleHebdoMinutes)}`
      : n === 'TASK' && tache
        ? `${hm(place)} placed · ${hm(tache.minutesRestantes + tache.minutesSupplementaires)} left`
        : ancre
          ? `${miennes.map((z) => DAYS[z.i]!.l).join(' · ')} at ${fmt(ancre.minuteAncrage)}`
          : ''
  const pourquoi =
    s.note ??
    (n === 'ANCHOR'
      ? 'An anchor. Same time, same days. Vethos never moves it on its own.'
      : n === 'GOAL' && objectif
        ? `A goal of ${hm(objectif.cibleHebdoMinutes)} a week. Vethos spreads it through the week, around your fixed hours.`
        : `A task with ${hm(tache ? tache.minutesRestantes + tache.minutesSupplementaires : 0)} left. Vethos gives it your free windows, what is due first goes first.`)
  const typeL = n === 'TASK' ? 'TASK' : n === 'GOAL' ? 'GOAL' : 'ANCHOR'
  return (
    <Feuille ouverte={!!seg} fermer={fermer} style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: TYPEC[n] }} />
          <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 11, letterSpacing: 1 }}>{typeL}</Text>
        </View>
        <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 6, backgroundColor: A.s1 }}>
          <Text style={{ color: stc, fontFamily: GEIST.moyen, fontSize: 12 }}>{st}</Text>
        </View>
      </View>
      <Text style={{ marginTop: 12, color: A.t1, fontFamily: GEIST.demi, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 }}>{s.titre}</Text>
      <Text style={{ marginTop: 4, color: A.t2, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21 }}>
        {`${DAYS[iJour]?.L ?? ''} ${DAYS[iJour]?.n ?? ''} · ${fmt(s.debut)} – ${fmt(s.fin)} · ${hm(s.fin - s.debut)}`}
      </Text>
      <View style={{ marginTop: 20, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 13 }}>This week</Text>
          <Text style={{ color: A.t2, fontFamily: MONO.normal, fontSize: 12 }}>{stat}</Text>
        </View>
        <View style={{ borderRadius: 12, backgroundColor: 'rgba(242,242,242,0.04)' }}>
          {miennes.slice(0, 7).map(({ y, i }, k) => {
            const [t2, c2] = statut(y, i)
            return (
              <View key={y.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 40, paddingHorizontal: 14, borderTopWidth: k ? 1 : 0, borderTopColor: 'rgba(242,242,242,0.06)' }}>
                <Text style={{ width: 56, color: y.id === s.id ? A.t1 : A.t3, fontFamily: GEIST.moyen, fontSize: 13 }}>{`${DAYS[i]!.l} ${DAYS[i]!.n}`}</Text>
                <Text style={{ flex: 1, color: A.t2, fontFamily: MONO.normal, fontSize: 12 }}>{`${fmt(y.debut)} – ${fmt(y.fin)}`}</Text>
                <Text style={{ color: c2, fontFamily: GEIST.moyen, fontSize: 12 }}>{t2}</Text>
              </View>
            )
          })}
        </View>
      </View>
      <Text style={{ marginTop: 20, color: A.t3, fontFamily: GEIST.moyen, fontSize: 13 }}>Why here</Text>
      <Text style={{ marginTop: 4, color: A.t1, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21 }}>{pourquoi}</Text>
      <View style={{ marginTop: 24 }}>
        <BoutonBlanc onPress={fermer}>Done</BoutonBlanc>
      </View>
    </Feuille>
  )
}

// ——— Le temps fixe ———

function FeuilleFixe({ ouverte, fermer, nouveau }: { ouverte: boolean; fermer: () => void; nouveau: () => void }) {
  const d = useDonnees()
  const toast = useToast()
  const [nuitOuverte, setNuitOuverte] = useState(false)
  const [listeOuverte, setListeOuverte] = useState(true)
  const [coucher, setCoucher] = useState(d.reglages.coucher)
  const [lever, setLever] = useState(d.reglages.lever)
  const ref = d.reglages.sommeilReference ?? null
  const verdict = verifierSommeil({ coucher, lever }, ref, d.reglages.trancheAge)
  const apresMinuit = enMin(coucher) < 720 && enMin(coucher) > 0
  // Une obligation hebdomadaire est rangée jour par jour ; on la relit comme une seule ligne.
  const lignes = useMemo(() => {
    const g = new Map<string, { ids: string[]; o: Obligation; jours: number[] }>()
    for (const o of d.obligations) {
      if (o.categoryType === 'sleep') continue
      const k = `${o.label}|${o.categoryType}|${o.startMinute}|${o.endMinute}|${o.date ?? ''}`
      const x = g.get(k)
      if (x) (x.ids.push(o.id), x.jours.push(o.dayOfWeek))
      else g.set(k, { ids: [o.id], o, jours: [o.dayOfWeek] })
    }
    return [...g.values()]
  }, [d.obligations])
  const joursTxt = (js: number[]) => {
    const s = [...new Set(js.map((j) => (j + 6) % 7))].sort()
    if (s.join() === '0,1,2,3,4') return 'Mon – Fri'
    if (s.length === 7) return 'Every day'
    if (s.join() === '5,6') return 'Weekends'
    return s.map((i) => DOW[i]).join(' · ')
  }
  const terminer = async () => {
    if (!verdict.ok) {
      toast(verdict.raison)
      return
    }
    if (coucher !== d.reglages.coucher || lever !== d.reglages.lever) await d.majReglages({ coucher, lever })
    fermer()
  }
  return (
    <Feuille ouverte={ouverte} fermer={fermer} style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
      <View style={{ paddingHorizontal: 4 }}>
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 }}>My fixed time</Text>
        <Text style={{ marginTop: 4, color: A.t3, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21 }}>Vethos never places anything here.</Text>
      </View>
      <ScrollView style={{ marginTop: 20, flexGrow: 0, maxHeight: 460 }} showsVerticalScrollIndicator={false}>
        <View style={{ borderRadius: 12, backgroundColor: 'rgba(242,242,242,0.04)' }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: nuitOuverte }} onPress={() => setNuitOuverte((v) => !v)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 })}>
            <Lune taille={18} />
            <Text style={{ flex: 1, color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>Sleep</Text>
            <Text style={{ color: A.t2, fontFamily: MONO.normal, fontSize: 13 }}>{`${coucher} – ${lever}`}</Text>
            <View style={{ transform: [{ rotate: nuitOuverte ? '180deg' : '0deg' }] }}>
              <Chevron sens="bas" couleur={A.t4} />
            </View>
          </Pressable>
          {nuitOuverte ? (
            <View style={{ gap: 10, paddingHorizontal: 14, paddingBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>Bedtime</Text>
                  <RoueHeure valeur={coucher} changer={setCoucher} etiquette="Bedtime" bande="rgba(242,242,242,0.08)" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>Wake up</Text>
                  <RoueHeure valeur={lever} changer={setLever} etiquette="Wake up" bande="rgba(242,242,242,0.08)" />
                </View>
              </View>
              <Text style={{ textAlign: 'center', color: verdict.ok && !apresMinuit ? A.t3 : A.rouge, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>
                {!verdict.ok ? verdict.raison : apresMinuit ? 'After midnight counts as 00:00.' : `${hm(verdict.duree)} of sleep. Vethos plans around it.`}
              </Text>
            </View>
          ) : null}
          <View style={{ height: 1, backgroundColor: 'rgba(242,242,242,0.06)', marginLeft: 44 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingLeft: 14, paddingRight: 6 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: listeOuverte }} onPress={() => setListeOuverte((v) => !v)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, height: 56 }}>
              <Cadenas taille={18} epais={1.75} />
              <Text style={{ flex: 1, color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>Fixed commitments</Text>
              <Text style={{ color: A.t2, fontFamily: MONO.normal, fontSize: 13 }}>{lignes.length}</Text>
              <View style={{ transform: [{ rotate: listeOuverte ? '180deg' : '0deg' }] }}>
                <Chevron sens="bas" couleur={A.t4} />
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="New fixed commitment" onPress={nouveau} style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
              <Plus taille={14} />
            </Pressable>
          </View>
          {listeOuverte ? (
            <View style={{ paddingBottom: 6 }}>
              {lignes.map(({ ids, o, jours }) => (
                <View key={ids[0]} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingLeft: 44, paddingRight: 6, borderTopWidth: 1, borderTopColor: 'rgba(242,242,242,0.06)' }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text numberOfLines={1} style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{o.label}</Text>
                    <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 16 }}>
                      {`${nomCat(o.categoryType)} · ${o.date ? o.date : joursTxt(jours)} · ${fmt(o.startMinute)} – ${fmt(o.endMinute)}`}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${o.label}`}
                    onPress={() => {
                      for (const id of ids) void d.supprimerObligation(id)
                      toast('Removed. Vethos can use that time again.')
                    }}
                    style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={A.t3} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </Svg>
                  </Pressable>
                </View>
              ))}
              {!lignes.length ? <Text style={{ paddingTop: 14, paddingBottom: 10, paddingLeft: 44, paddingRight: 14, color: A.t3, fontFamily: GEIST.normal, fontSize: 13, borderTopWidth: 1, borderTopColor: 'rgba(242,242,242,0.06)' }}>Nothing fixed yet.</Text> : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={{ marginTop: 20 }}>
        <BoutonBlanc onPress={() => void terminer()}>Done</BoutonBlanc>
      </View>
    </Feuille>
  )
}

// ——— Un nouvel engagement fixe ———

function FeuilleNouveau({ ouverte, fermer, DAYS }: { ouverte: boolean; fermer: () => void; DAYS: { cle: string; l: string; n: number; date: Date }[] }) {
  const d = useDonnees()
  const toast = useToast()
  const [cat, setCat] = useState<Obligation['categoryType'] | null>(null)
  const [nom, setNom] = useState('')
  const [chaque, setChaque] = useState(true)
  const [jours, setJours] = useState<number[]>([])
  const [date, setDate] = useState<number | null>(null)
  const [de, setDe] = useState('18:00')
  const [a, setA] = useState('20:00')
  const [err, setErr] = useState('')
  const avant = useRef(false)
  if (ouverte && !avant.current) {
    avant.current = true
    setCat(null)
    setNom('')
    setChaque(true)
    setJours([])
    setDate(null)
    setErr('')
  }
  if (!ouverte && avant.current) avant.current = false
  const ajouter = async () => {
    if (!cat) return setErr('Pick a category.')
    const debut = enMin(de)
    const fin = enMin(a)
    if (fin <= debut) return setErr('Until must be after From.')
    if (chaque ? !jours.length : date === null) return setErr(chaque ? 'Pick at least one day.' : 'Pick a date.')
    const label = nom.trim() || nomCat(cat)
    const cibles: { dayOfWeek: number; date?: string }[] = chaque ? jours.map((j) => ({ dayOfWeek: (j + 1) % 7 })) : [{ dayOfWeek: DAYS[date!]!.date.getDay(), date: DAYS[date!]!.cle }]
    for (const c of cibles) {
      const o = d.obligations.find(
        (x) => x.categoryType !== 'sleep' && x.startMinute < fin && debut < x.endMinute && (c.date ? x.date === c.date || (!x.date && x.dayOfWeek === c.dayOfWeek) : !x.date && x.dayOfWeek === c.dayOfWeek),
      )
      if (o) return setErr(`Overlaps ${o.label} on ${DOW[(c.dayOfWeek + 6) % 7]}.`)
    }
    for (const c of cibles) await d.ajouterObligation({ ...c, startMinute: debut, endMinute: fin, categoryType: cat, label, color: '#8d8d8d' })
    toast('Added. Vethos will plan around it.')
    fermer()
  }
  return (
    <Feuille ouverte={ouverte} fermer={fermer} style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 8, paddingRight: 6 }}>
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}>New fixed commitment</Text>
        <BoutonFermer onPress={fermer} />
      </View>
      <ScrollView style={{ marginTop: 16, flexGrow: 0, maxHeight: 520 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {CATS.map(([k, t]) => {
          const o = cat === k
          return (
            <View key={k} style={{ gap: 8 }}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: o }}
                onPress={() => (setCat(o ? null : k), setErr(''))}
                style={{ height: 56, borderRadius: 8, backgroundColor: o ? 'rgba(242,242,242,0.1)' : A.s1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}
              >
                <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 16 }}>{t}</Text>
                <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: o ? A.t1 : 'transparent', borderWidth: 1.5, borderColor: o ? A.t1 : 'rgba(242,242,242,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                  {o ? (
                    <Svg width={12} height={10} viewBox="0 0 12 10">
                      <Path d="M1.5 5.2L4.4 8L10.5 1.8" fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  ) : null}
                </View>
              </Pressable>
              {o ? (
                <View style={{ borderRadius: 8, backgroundColor: A.s1, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 16, gap: 14 }}>
                  <TextInput value={nom} onChangeText={(v) => setNom(v.slice(0, 60))} placeholder={`Name (“${t}”)`} placeholderTextColor={A.t4} accessibilityLabel="Name" selectionColor={A.t1} style={{ height: 44, borderRadius: 8, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 14, color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>From</Text>
                      <RoueHeure valeur={de} changer={(v) => (setDe(v), setErr(''))} etiquette="From" bande="rgba(242,242,242,0.08)" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>Until</Text>
                      <RoueHeure valeur={a} changer={(v) => (setA(v), setErr(''))} etiquette="Until" bande="rgba(242,242,242,0.08)" />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {chaque
                      ? DOW.map((x, i) => {
                          const on = jours.includes(i)
                          return (
                            <Pressable key={i} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DOWL[i]} onPress={() => (setJours((j) => (on ? j.filter((y) => y !== i) : [...j, i])), setErr(''))} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: on ? A.t1 : 'rgba(242,242,242,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: on ? '#000' : A.t3, fontFamily: GEIST.demi, fontSize: 13 }}>{x[0]}</Text>
                            </Pressable>
                          )
                        })
                      : Array.from({ length: 7 }, (_, k) => {
                          const i = AUJ + k
                          const x = DAYS[i]!
                          const on = date === i
                          return (
                            <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => (setDate(i), setErr(''))} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: on ? A.t1 : 'rgba(242,242,242,0.1)', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                              <Text style={{ color: on ? '#000' : A.t3, fontFamily: GEIST.demi, fontSize: 13, lineHeight: 15 }}>{x.l}</Text>
                              <Text style={{ color: on ? '#000' : A.t3, fontFamily: MONO.normal, fontSize: 10, lineHeight: 12, opacity: 0.7 }}>{x.n}</Text>
                            </Pressable>
                          )
                        })}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
                    {([['Every week', true], ['Just once', false]] as const).map(([t2, v]) => (
                      <Pressable key={t2} accessibilityRole="radio" accessibilityState={{ selected: chaque === v }} onPress={() => (setChaque(v), setErr(''))} style={{ paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: chaque === v ? A.t1 : 'transparent' }}>
                        <Text style={{ color: chaque === v ? A.t1 : A.t3, fontFamily: GEIST.moyen, fontSize: 13 }}>{t2}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          )
        })}
      </ScrollView>
      <Text style={{ marginTop: 10, minHeight: 18, paddingHorizontal: 8, color: A.rouge, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{err}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void ajouter()}
        style={({ pressed }) => ({ marginTop: 4, height: 56, borderRadius: 8, backgroundColor: A.t1, alignItems: 'center', justifyContent: 'center', opacity: cat ? 1 : 0.4, transform: [{ scale: pressed ? 0.975 : 1 }] })}
      >
        <Text style={{ color: '#000', fontFamily: GEIST.demi, fontSize: 16 }}>Add it, Vethos plans around</Text>
      </Pressable>
    </Feuille>
  )
}
