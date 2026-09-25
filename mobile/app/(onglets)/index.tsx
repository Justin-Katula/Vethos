/**
 * Today, comme la maquette le dessine : ce qui se passe maintenant, le cadran
 * de la journée, trois chiffres qu'on peut toucher, la projection, puis la
 * journée ligne par ligne. Tout est lu dans le vrai plan : rien n'est inventé.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, Line, Mask, Path, Rect } from 'react-native-svg'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { dateLocale } from '@/plan/format'
import type { SegmentTemps } from '@/plan/lecture'
import { ChargementVethos } from '@/ui/MouvementVethos'
import { ArretSeance, DemarrerSeance } from '@/seances/ArretSeance'
import { useSeances } from '@/seances/magasin-seances'
import { RevueDimanche } from '@/coach/RevueDimanche'
import { afterMissLine, effectiveContract } from '@shared/contract'
import { peutParler } from '@shared/coach/coach'
import { A, Chevron, Cadenas, fmt, GEIST, hm, MONO, Plus, TRAIT, TYPEC, useLumiere, type NatureApp } from '@/ui/app-briques'

const MOIS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MOIS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FIXE = '#5c5c5c'

const angle = (m: number) => (m / 1440) * 2 * Math.PI - Math.PI / 2
const pt = (m: number, r: number) => [200 + r * Math.cos(angle(m)), 200 + r * Math.sin(angle(m))] as const
function arc(a0: number, a1: number, r: number) {
  let sp = (((a1 - a0) % 1440) + 1440) % 1440
  if (sp === 0) sp = 1439.9
  const [x0, y0] = pt(a0, r)
  const [x1, y1] = pt(a0 + sp, r)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${sp > 720 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}
const TICKS = Array.from({ length: 96 }, (_, i) => {
  const h = i % 4 === 0
  const six = i % 24 === 0
  const [x1, y1] = pt(i * 15, six ? 178 : h ? 180 : 182)
  const [x2, y2] = pt(i * 15, six ? 192 : h ? 188 : 185)
  return { x1, y1, x2, y2, c: six ? A.t1 : h ? A.t3 : '#3a3a3a', w: six ? 1.5 : 1 }
})
const enMin = (h: string) => {
  const [a, b] = h.split(':').map(Number)
  return (a ?? 0) * 60 + (b ?? 0)
}
type Iv = [number, number]
/** Retire des morceaux d'intervalles. */
function sans(ivs: Iv[], coupes: Iv[]): Iv[] {
  let out = ivs.map((x) => [...x] as Iv)
  for (const [c0, c1] of coupes)
    out = out.flatMap(([a, b]) =>
      c1 <= a || c0 >= b ? [[a, b] as Iv] : ([[a, Math.max(a, c0)], [Math.min(b, c1), b]] as Iv[]).filter(([p, q]) => q - p > 0),
    )
  return out
}
const somme = (ivs: Iv[]) => ivs.reduce((s, [a, b]) => s + b - a, 0)
const naturePlan = (s: SegmentTemps): NatureApp | null =>
  s.nature === 'task' ? 'TASK' : s.nature === 'objective' ? 'GOAL' : s.nature === 'ancre' ? 'ANCHOR' : null

type Focus = 'cap' | 'com' | 'left' | null

export default function Aujourdhui() {
  const marges = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { acc } = useLumiere()
  const { jours, minute: N, chargees, maintenant, seanceActive, demarrable, aujourdHui: cleJour } = usePlan()
  const evenements = useSeances((e) => e.apprentissage.sessionEvents)
  const apprentissageSignaux = useSeances((e) => e.apprentissage.lastSignalAt)
  // Le constat d'après un raté est noté quand il s'affiche : il ne revient
  // qu'après 72 h (usure des messages).
  const ligneMontree = useRef(false)
  useEffect(() => {
    if (!ligneMontree.current) return
    const dit = apprentissageSignaux['coach:rate']
    if (dit && Date.now() - new Date(dit).getTime() < 90 * 60_000) return
    const e = useSeances.getState()
    void e.poser({
      apprentissage: { ...e.apprentissage, lastSignalAt: { ...e.apprentissage.lastSignalAt, 'coach:rate': new Date().toISOString() } },
      confirmations: e.confirmations,
    })
  })
  const { taches, objectifs, ancres, obligations, reglages } = useDonnees()
  const [focus, setFocus] = useState<Focus>(null)
  const [slide, setSlide] = useState(0)
  const [annee, setAnnee] = useState(false)
  const carrousel = useRef<ScrollView>(null)
  const larg = Math.min(width, 540)
  const cote = Math.min(340, larg - 53)

  const jour = jours[0]
  const d = useMemo(() => {
    if (!jour) return null
    const WAKE = enMin(reglages.lever)
    let BED = enMin(reglages.coucher)
    if (BED <= WAKE) BED += 1440
    const visibles = jour.segments.filter((s) => s.nature !== 'sleep')
    const fixes = visibles.filter((s) => s.nature === 'fixed')
    const blocs = visibles.filter((s) => naturePlan(s))
    const fx: Iv[] = fixes.map((s) => [s.debut, s.fin])
    const bk: Iv[] = blocs.map((s) => [s.debut, s.fin])
    const capIv = sans([[WAKE, BED]], fx)
    const leftIv = N < BED ? sans([[Math.max(N, WAKE), BED]], [...fx, ...bk]) : []
    const cap = somme(capIv)
    const com = somme(bk)
    const left = somme(leftIv)
    const passe = (ivs: Iv[]) => ivs.reduce((a, [p, q]) => a + Math.max(0, Math.min(q, N) - p), 0)
    const libre = Math.max(1, cap - com)
    return {
      WAKE,
      BED,
      fixes,
      blocs,
      capIv,
      leftIv,
      bk,
      vals: { cap, com, left },
      restes: {
        cap: 1 - passe(capIv) / (cap || 1),
        com: com ? 1 - passe(bk) / com : 1,
        left: 1 - Math.max(0, libre - left) / libre,
      },
      visibles,
    }
  }, [jour, N, reglages.coucher, reglages.lever])

  if (!jour || !chargees || !d) return <ChargementVethos pleinEcran />

  const { WAKE, BED, blocs, visibles } = d
  // Ce qui se passe maintenant.
  const cur = visibles.find((s) => s.debut <= N && N < s.fin)
  const nxt = visibles.find((s) => s.debut > N)
  const couleurSeg = (s: SegmentTemps) => {
    const n = naturePlan(s)
    return n ? TYPEC[n] : FIXE
  }
  // Après un raté : un constat en une phrase, puis la prochaine action — au
  // ton du contrat. Visible une heure et demie, puis il s'efface.
  const rate = evenements
    .filter((e) => e.date === cleJour && !e.started)
    .map((e) => e.plannedStartMinute + e.plannedMinutes)
    .filter((fin) => N >= fin && N - fin < 90)
    .sort((a, b) => b - a)[0]
  const contrat = reglages.contrat ? effectiveContract(reglages.contrat, maintenant) : null
  // 72 h par sujet : le même constat ne revient pas chaque soir.
  const sujetRate = 'coach:rate'
  const dejaDit = apprentissageSignaux[sujetRate]
  const ligneRate =
    rate !== undefined && contrat && (!dejaDit || maintenant.getTime() - new Date(dejaDit).getTime() < 90 * 60_000 || peutParler({ dernier: dejaDit, maintenant, autonomie: 0 }))
      ? afterMissLine(contrat.mode, nxt ? fmt(nxt.debut) : null)
      : null
  ligneMontree.current = !!ligneRate

  let maintenantCarte: { k: string; t: string; titre: string; point: string }
  if (N < WAKE || N >= BED) maintenantCarte = { k: 'NOW', t: `${fmt(BED)} – ${fmt(WAKE)}`, titre: 'The night is yours.', point: acc }
  else if (cur) maintenantCarte = { k: 'NOW', t: `${fmt(cur.debut)} – ${fmt(cur.fin)}`, titre: cur.titre, point: couleurSeg(cur) }
  else if (nxt) maintenantCarte = { k: 'UP NEXT', t: `${fmt(nxt.debut)} – ${fmt(nxt.fin)}`, titre: nxt.titre, point: couleurSeg(nxt) }
  else maintenantCarte = { k: 'YOUR OWN PACE', t: `${fmt(N)} – ${fmt(BED)}`, titre: 'Time that’s yours.', point: acc }

  const devant = blocs.filter((b) => b.debut > N).length
  const vivant = blocs.find((b) => b.debut <= N && N < b.fin)
  let statut = !blocs.length ? 'Free day' : vivant ? `${vivant.titre} · until ${fmt(vivant.fin)}` : devant ? `${devant} ahead` : 'All done'
  const FO = {
    cap: { iv: d.capIv, c: 'rgba(242,242,242,0.7)', cap: 'free across your day' },
    com: { iv: d.bk, c: acc, cap: 'committed today' },
    left: { iv: d.leftIv, c: A.t2, cap: 'still free from now' },
  }
  if (focus) statut = `${hm(d.vals[focus])} ${FO[focus].cap}`
  const [hx, hy] = pt(N, 168)
  const badge = `TODAY · ${maintenant.getDate()} ${MOIS[maintenant.getMonth()]}`

  // Les découpes du masque : l'aiguille passe SOUS les textes du centre.
  const K = 400 / 340
  const boite = (cx: number, cy: number, w: number, h: number) => ({ x: cx - w / 2, y: cy - h / 2, w, h })
  const coupes = [
    boite(200, 200 - 56 * K + 8 * K, (badge.length * 7.6 + 22) * K, 16 * K),
    boite(200, 200 - 56 * K + 57 * K, (5 * 36 + 10) * K, 56 * K),
    boite(200, 200 + 56 * K - 10 * K, (statut.length * 7.4 + 14) * K, 20 * K),
  ]

  const onCarrousel = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / larg)
    if (i !== slide) setSlide(i)
  }
  const allerSlide = (i: number) => {
    carrousel.current?.scrollTo({ x: i * larg, animated: true })
    setSlide(i)
  }

  const agenda = [
    { debut: WAKE, fin: WAKE, titre: 'Wake-up', c: 'rgba(242,242,242,0.16)', fixe: true },
    ...visibles.map((s) => ({ debut: s.debut, fin: s.fin, titre: s.titre, c: couleurSeg(s), fixe: s.nature === 'fixed' })),
    { debut: BED, fin: BED, titre: 'Sleep', c: 'rgba(242,242,242,0.16)', fixe: true },
  ]

  return (
    <ScrollView contentContainerStyle={{ paddingTop: marges.top + 20, paddingBottom: 120, width: '100%', maxWidth: 540, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
      {/* Les deux vues, et l'avatar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {['Today', 'Projection'].map((t, i) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: slide === i }}
              onPress={() => allerSlide(i)}
              style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: slide === i ? 'rgba(242,242,242,0.12)' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: slide === i ? acc : A.t4 }} />
              <Text style={{ color: slide === i ? A.t1 : A.t3, fontFamily: GEIST.moyen, fontSize: 14 }}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => router.push('/profil')}
          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: '#29405f', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }] })}
        >
          <Text style={{ color: '#d6e4f7', fontFamily: GEIST.demi, fontSize: 15 }}>{(reglages.prenom.trim()[0] ?? '?').toUpperCase()}</Text>
        </Pressable>
      </View>

      {/* Maintenant */}
      <View style={{ marginTop: 12, marginHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(242,242,242,0.06)', paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: maintenantCarte.point }} />
            <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 10, letterSpacing: 1 }}>{maintenantCarte.k}</Text>
          </View>
          <Text numberOfLines={1} style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 }}>
            {maintenantCarte.titre}
          </Text>
        </View>
        {seanceActive ? (
          <ArretSeance titre={cur?.titre ?? maintenantCarte.titre} />
        ) : demarrable ? (
          <DemarrerSeance />
        ) : (
          <Text style={{ color: A.t2, fontFamily: MONO.normal, fontSize: 12 }}>{maintenantCarte.t}</Text>
        )}
      </View>

      <RevueDimanche />

      {ligneRate ? (
        <Text style={{ marginTop: 8, marginHorizontal: 20, color: A.t2, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18 }}>{ligneRate}</Text>
      ) : null}

      <ScrollView
        ref={carrousel}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onCarrousel}
        scrollEventThrottle={32}
        style={{ marginTop: 8, width: larg, alignSelf: 'center', flexGrow: 0 }}
      >
        {/* Le cadran */}
        <View style={{ width: larg, paddingHorizontal: 20 }}>
          <Pressable accessible={false} onPress={() => setFocus(null)} style={{ width: cote, height: cote, marginTop: 4, alignSelf: 'center' }}>
            <Svg width={cote} height={cote} viewBox="0 0 400 400">
              <Defs>
                <Mask id="aiguille" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
                  <Rect x={0} y={0} width={400} height={400} fill="#fff" />
                  {coupes.map((k, i) => (
                    <Rect key={i} x={k.x} y={k.y} width={k.w} height={k.h} rx={4} fill="#000" />
                  ))}
                </Mask>
              </Defs>
              {TICKS.map((t, i) => (
                <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.c} strokeWidth={t.w} strokeLinecap="round" />
              ))}
              <Circle cx={200} cy={200} r={168} fill="none" stroke="rgba(242,242,242,0.12)" strokeWidth={2} />
              <Path d={arc(BED, WAKE, 158)} fill="none" stroke={A.t3} strokeWidth={1.5} strokeDasharray="1 5" strokeLinecap="round" />
              <Svg opacity={focus ? 0.2 : 1}>
                {d.fixes.map((f) => (
                  <Path key={f.id} d={arc(f.debut, f.fin, 168)} fill="none" stroke={FIXE} strokeWidth={2} />
                ))}
                {N > WAKE ? <Path d={arc(WAKE, Math.min(N, BED), 168)} fill="none" stroke={A.t1} strokeWidth={2} strokeOpacity={0.35} /> : null}
                {blocs.map((b) => (
                  <Path key={b.id} d={arc(b.debut, b.fin, 168)} fill="none" stroke={TRAIT[naturePlan(b)!]} strokeWidth={8} strokeOpacity={b.fin <= N ? 0.45 : 1} />
                ))}
              </Svg>
              {focus
                ? FO[focus].iv.map(([p, q], i) => <Path key={i} d={arc(p, q, 176)} fill="none" stroke={FO[focus].c} strokeWidth={3} strokeLinecap="round" />)
                : null}
              <Line x1={200} y1={200} x2={hx} y2={hy} stroke={A.t3} strokeWidth={1.5} strokeLinecap="round" mask="url(#aiguille)" />
              <Circle cx={hx} cy={hy} r={7} fill={acc} stroke="#000" strokeWidth={3} />
            </Svg>
            {([[0, '00'], [360, '06'], [720, '12'], [1080, '18']] as const).map(([m, t]) => {
              const [x, y] = pt(m, 150)
              return (
                <Text key={t} style={{ position: 'absolute', left: (x / 400) * cote - 12, top: (y / 400) * cote - 7, width: 24, textAlign: 'center', color: A.t3, fontFamily: MONO.normal, fontSize: 10 }}>
                  {t}
                </Text>
              )
            })}
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: acc }} />
                <Text style={{ color: A.t3, fontFamily: GEIST.demi, fontSize: 11, letterSpacing: 1.4 }}>{badge}</Text>
              </View>
              <Text style={{ marginTop: 6, color: A.t1, fontFamily: GEIST.demi, fontSize: 64, lineHeight: 70, letterSpacing: -2.5, fontVariant: ['tabular-nums'] }}>{fmt(N)}</Text>
              <Text style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 15 }}>{statut}</Text>
            </View>
          </Pressable>

          {/* Le trait qui relie le cadran à ses trois chiffres */}
          <Svg width="100%" height={26} viewBox="0 0 353 26" preserveAspectRatio="none" style={{ marginTop: -8 }}>
            {(
              [
                ['cap', 'M176.5 0 V8 Q176.5 13 171.5 13 H61.2 Q56.2 13 56.2 18 V26'],
                ['com', 'M176.5 0 V26'],
                ['left', 'M176.5 0 V8 Q176.5 13 181.5 13 H291.8 Q296.8 13 296.8 18 V26'],
              ] as const
            ).map(([k, dd]) => (
              <Path
                key={k}
                d={dd}
                fill="none"
                strokeWidth={1}
                strokeLinecap="round"
                stroke={focus === k ? (k === 'com' ? acc : 'rgba(242,242,242,0.7)') : k === 'com' ? `${acc}99` : 'rgba(242,242,242,0.18)'}
              />
            ))}
            <Circle cx={176.5} cy={1} r={2} fill={acc} />
          </Svg>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                ['cap', 'Capacity'],
                ['com', 'Committed'],
                ['left', 'Free left'],
              ] as const
            ).map(([k, l]) => {
              const on = focus === k
              const estC = k === 'com'
              const v = Math.max(0, Math.round(d.vals[k]))
              const vc = estC ? acc : k === 'left' ? A.t2 : A.t1
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${l}, ${hm(v)}`}
                  onPress={() => setFocus(on ? null : k)}
                  style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 8, transform: [{ scale: pressed ? 0.97 : 1 }] })}
                >
                  <View
                    style={{
                      width: '100%',
                      height: 54,
                      borderRadius: 8,
                      backgroundColor: on ? (estC ? `${acc}1a` : 'rgba(242,242,242,0.06)') : 'transparent',
                      borderWidth: 1,
                      borderColor: estC ? `${acc}${on ? 'cc' : '66'}` : on ? 'rgba(242,242,242,0.4)' : 'rgba(242,242,242,0.08)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                      <Text style={{ color: vc, fontFamily: MONO.normal, fontSize: 19, lineHeight: 22 }}>{v < 60 ? v : Math.floor(v / 60)}</Text>
                      <Text style={{ color: estC ? acc : A.t3, fontFamily: MONO.normal, fontSize: 11 }}>{v < 60 ? 'min' : 'h'}</Text>
                      {v >= 60 ? <Text style={{ color: vc, fontFamily: MONO.normal, fontSize: 19, lineHeight: 22, marginLeft: 3 }}>{String(v % 60).padStart(2, '0')}</Text> : null}
                    </View>
                    <View style={{ position: 'absolute', left: 10, right: 10, bottom: 7, height: 2, borderRadius: 1, backgroundColor: 'rgba(242,242,242,0.07)' }}>
                      <View
                        style={{
                          height: 2,
                          borderRadius: 1,
                          width: `${Math.min(100, Math.max(0, d.restes[k] * 100))}%`,
                          backgroundColor: estC ? acc : k === 'left' ? 'rgba(242,242,242,0.35)' : 'rgba(242,242,242,0.5)',
                        }}
                      />
                    </View>
                  </View>
                  <Text style={{ color: on ? A.t1 : A.t3, fontFamily: GEIST.moyen, fontSize: 12 }}>{l}</Text>
                </Pressable>
              )
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/engagements')}
            style={({ pressed }) => ({ marginTop: 16, height: 52, borderRadius: 8, backgroundColor: A.s, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, transform: [{ scale: pressed ? 0.975 : 1 }] })}
          >
            <Plus />
            <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>Add a commitment</Text>
          </Pressable>
        </View>

        {/* La projection */}
        <Projection largeur={larg} annee={annee} setAnnee={setAnnee} acc={acc} />
      </ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16, marginBottom: 20 }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: slide === i ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: slide === i ? A.t1 : 'rgba(242,242,242,0.25)' }} />
        ))}
      </View>

      {!obligations.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/temps')}
          style={{ marginTop: 8, marginHorizontal: 20, borderRadius: 12, backgroundColor: A.s, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <Cadenas taille={18} epais={1.75} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>Declare your schedule</Text>
            <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 13 }}>Work, school, commute. Vethos plans around them.</Text>
          </View>
          <Chevron couleur={A.t4} />
        </Pressable>
      ) : null}

      <View style={{ marginTop: 32, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}>Your day</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/temps')}
          style={{ height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: A.s, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 13 }}>The week</Text>
          <Chevron taille={10} />
        </Pressable>
      </View>
      <View style={{ marginTop: 12, marginHorizontal: 20 }}>
        {agenda.map((x, i) => {
          const passe = (x.fin <= N && x.fin > x.debut) || (x.debut === x.fin && x.debut < N)
          const actif = x.debut <= N && N < x.fin
          return (
            <View
              key={i}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 10, borderRadius: 8, backgroundColor: actif ? 'rgba(242,242,242,0.08)' : 'transparent', opacity: passe ? 0.45 : 1 }}
            >
              <Text style={{ width: 100, color: A.t3, fontFamily: MONO.normal, fontSize: 12 }}>
                {x.debut === x.fin ? fmt(x.debut) : `${fmt(x.debut)} – ${fmt(x.fin)}`}
              </Text>
              <View style={{ width: 3, height: 20, borderRadius: 1, backgroundColor: x.c }} />
              <Text numberOfLines={1} style={{ flex: 1, color: x.fixe ? A.t2 : A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{x.titre}</Text>
            </View>
          )
        })}
        {!blocs.length ? <Text style={{ paddingTop: 14, paddingHorizontal: 10, color: A.t3, fontFamily: GEIST.normal, fontSize: 15 }}>Nothing committed today.</Text> : null}
      </View>
    </ScrollView>
  )

  function Projection({ largeur, annee: an, setAnnee: setAn, acc: ac }: { largeur: number; annee: boolean; setAnnee: (v: boolean) => void; acc: string }) {
    const WK = an ? 52 : 4
    const semaine = jours.flatMap((j) => j.segments)
    const fois = (id: string) => semaine.filter((s) => s.ref === id).length
    const goals = objectifs.map((o) => ({ nom: o.nom, n: Math.max(1, fois(o.id)), min: o.cibleHebdoMinutes }))
    const gH = goals.reduce((a, g) => a + g.min, 0) * (WK / 60)
    const aH = ancres.reduce((a, x) => a + x.dureeMinutes * x.jours.length, 0) * (WK / 60)
    const regroupements = new Set(taches.map((t) => t.parentId).filter(Boolean))
    const ouvertes = taches.filter((t) => !t.terminee && !regroupements.has(t.id)).sort((a, b) => a.echeance.localeCompare(b.echeance))
    const nt = ouvertes[0]
    const jourDe = (cle: string) => dateLocale(cle)
    const carres = (list: { n: number }[], c: string) => {
      const tot = list.reduce((a, g) => a + g.n, 0) * WK
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
          {Array.from({ length: Math.min(20, tot) }, (_, i) => (
            <View key={i} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
          ))}
          {tot > 20 ? <Text style={{ marginLeft: 3, color: c, fontFamily: MONO.demi, fontSize: 12 }}>+</Text> : null}
        </View>
      )
    }
    const ligne = (l: string, r: string) => (
      <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: A.t2, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 16 }}>{l}</Text>
        <Text style={{ color: A.t1, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 16 }}>{r}</Text>
      </View>
    )
    const tete = (nom: string, n: number, c: string, v: string, u: string) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>{nom}</Text>
          <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: 'rgba(242,242,242,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: A.t2, fontFamily: MONO.normal, fontSize: 11 }}>{n}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 22, lineHeight: 26 }}>{v}</Text>
          <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 11 }}>{u}</Text>
        </View>
      </View>
    )
    const carte = { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(242,242,242,0.08)', paddingTop: 14, paddingHorizontal: 16, paddingBottom: 12, gap: 10 } as const
    const vide = (t: string, b: string, cta: string) => (
      <View style={{ borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(242,242,242,0.16)', paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', gap: 6 }}>
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 15 }}>{t}</Text>
        <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>{b}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/engagements')} style={{ marginTop: 8, height: 40, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(242,242,242,0.2)', justifyContent: 'center' }}>
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 14 }}>{cta}</Text>
        </Pressable>
      </View>
    )
    const ajd = maintenant
    const debutT = nt ? jourDe(nt.creeeLe.slice(0, 10)) : ajd
    const finT = nt ? jourDe(nt.echeance) : ajd
    const restants = nt ? Math.max(0, Math.round((finT.getTime() - ajd.getTime()) / 864e5)) : 0
    const frac = nt ? Math.max(0, Math.min(1, (ajd.getTime() - debutT.getTime()) / Math.max(1, finT.getTime() - debutT.getTime()))) : 0
    return (
      <View style={{ width: largeur, paddingTop: 8, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}>Projection</Text>
          <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(242,242,242,0.1)' }}>
            {[['1 month', false], ['1 year', true]].map(([t, v]) => (
              <Pressable key={String(t)} accessibilityRole="button" accessibilityState={{ selected: an === v }} onPress={() => setAn(v as boolean)} style={{ height: 28, paddingHorizontal: 10, borderRadius: 7, backgroundColor: an === v ? A.t1 : 'transparent', justifyContent: 'center' }}>
                <Text style={{ color: an === v ? '#000' : A.t3, fontFamily: GEIST.demi, fontSize: 12 }}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: 8, marginTop: 20 }}>
          {goals.length ? (
            <View style={carte}>
              {tete('Goals', goals.length, TYPEC.GOAL, String(Math.round(gH)), 'h')}
              {carres(goals, TYPEC.GOAL)}
              <View style={{ gap: 4 }}>{goals.map((g) => ligne(`${g.nom} · ${g.n} times a week`, `${g.n * WK} sessions`))}</View>
            </View>
          ) : (
            vide('No long-term goal declared', 'A goal has no deadline: it is a steady quota — 4 h of guitar or 5 h of coding a week, say.', 'Set my first goal')
          )}
          {nt ? (
            <View style={carte}>
              {tete('Tasks', ouvertes.length, A.t3, String(restants), restants === 1 ? 'day' : 'days')}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, color: A.t1, fontFamily: GEIST.moyen, fontSize: 12 }}>{nt.titre}</Text>
                  <Text style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 12 }}>{`${restants} ${restants === 1 ? 'day' : 'days'} left`}</Text>
                </View>
                <View style={{ height: 14 }}>
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 2, borderRadius: 1, backgroundColor: 'rgba(242,242,242,0.14)' }} />
                  <View style={{ position: 'absolute', left: 0, top: 6, height: 2, width: `${frac * 100}%`, borderRadius: 1, backgroundColor: A.t1 }} />
                  <View style={{ position: 'absolute', right: 0, top: 1, width: 2, height: 12, borderRadius: 1, backgroundColor: A.t3 }} />
                  <View style={{ position: 'absolute', left: `${frac * 100}%`, top: 2, width: 10, height: 10, marginLeft: -5, borderRadius: 5, backgroundColor: ac, borderWidth: 3, borderColor: '#000' }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: A.t4, fontFamily: MONO.normal, fontSize: 10 }}>{`${debutT.getDate()} ${MOIS3[debutT.getMonth()]}`}</Text>
                  <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 10 }}>{`due ${finT.getDate()} ${MOIS3[finT.getMonth()]}`}</Text>
                </View>
              </View>
            </View>
          ) : null}
          {ancres.length ? (
            <View style={carte}>
              {tete('Anchors', ancres.length, TRAIT.ANCHOR, String(Math.round(aH)), 'h')}
              {carres(ancres.map((x) => ({ n: x.jours.length })), TRAIT.ANCHOR)}
              <View style={{ gap: 4 }}>{ancres.map((x) => ligne(`${x.nom} · ${x.jours.length} times a week`, `${x.jours.length * WK} sessions`))}</View>
            </View>
          ) : null}
        </View>
      </View>
    )
  }
}
