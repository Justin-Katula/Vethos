/**
 * Acte 3 — la place. Ce que Vethos prend en charge, sa nature, ses réglages
 * (des roues, jamais le clavier), la protection, la nuit, les heures fixes ;
 * puis le vrai moteur le pose sur le cadran, et la vraie semaine apparaît.
 */
import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { RoueDuree, RoueHeure, RoueJour } from '@/ui/Roue'
import type { JourTemps } from '@/plan/lecture'
import { dateLocale } from '@/plan/format'
import { FIXL, fmt, ITEM, JOURS_LONGS, MOIS, MOIS_LONGS, WL, type Fixe, type Nature } from './catalogue-introduction'
import {
  choisie,
  choses,
  enMinutes,
  natureDe,
  nuitMinutes,
  nuitValide,
  reglagesPour,
  retenues,
  type Ctx,
} from './etat-introduction'
import {
  Bouton,
  BoutonTexte,
  C,
  DEPLACEMENT,
  Entree,
  GEIST,
  Jours,
  Ligne,
  MONO,
  PiedDegrade,
  SORTIE,
  T,
  Titre,
  useVers,
  vibrer,
} from './briques-introduction'
import { useMinuteries } from './ecrans-ecoute'
import type { TrancheAge } from '@/donnees/regle-sommeil'
import { duringBlockLine, type Mode } from '@shared/contract'

export const TYPEC: Record<Nature, string> = { TASK: '#505359', GOAL: '#e03131', ANCHOR: '#2c3a56' }
/** Sur un trait fin, l'ancre remonte d'un ton pour rester lisible. */
const TRAIT: Record<Nature, string> = { TASK: '#505359', GOAL: '#e03131', ANCHOR: '#4b6190' }
const TYPEL: Record<Nature, string> = {
  TASK: 'It has a finish line. Once it’s done, it’s done.',
  GOAL: 'A few hours every week, wherever they fit.',
  ANCHOR: 'Same time, same days — it never moves.',
}
export const natureDuBloc = (nature: string): Nature | null =>
  nature === 'task' ? 'TASK' : nature === 'objective' ? 'GOAL' : nature === 'ancre' ? 'ANCHOR' : null

// ——— 11 · Commencer par une ———

function Apercu({ tp }: { tp: Nature }) {
  const nom = (t: string) => (
    <Text numberOfLines={1} style={{ flexShrink: 1, color: C.t1, fontFamily: GEIST.demi, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 }}>
      {t}
    </Text>
  )
  const mono = (t: string) => <Text style={{ color: C.t2, fontFamily: MONO.normal, fontSize: 12 }}>{t}</Text>
  if (tp === 'TASK')
    return (
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ width: 34, gap: 2 }}>
          <Text style={{ color: C.t1, fontFamily: GEIST.moyen, fontSize: 24, lineHeight: 24, letterSpacing: -1 }}>6</Text>
          <Text style={{ color: C.t4, fontFamily: GEIST.moyen, fontSize: 11 }}>days</Text>
        </View>
        <View style={{ flex: 1, gap: 7, paddingTop: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            {nom('Tax return')}
            {mono('1 h 30 left')}
          </View>
          <View style={{ height: 2, borderRadius: 1, backgroundColor: 'rgba(242,242,242,0.1)', overflow: 'hidden' }}>
            <View style={{ height: 2, width: '40%', backgroundColor: C.t1 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: C.t3, fontFamily: GEIST.normal, fontSize: 12 }}>Due Friday</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }}>
              {[4, 6, 8, 10, 12].map((h, i) => (
                <View key={h} style={{ width: 2, height: h, borderRadius: 1, backgroundColor: i < 3 ? C.t1 : 'rgba(242,242,242,0.18)' }} />
              ))}
            </View>
          </View>
        </View>
      </View>
    )
  if (tp === 'GOAL')
    return (
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <View style={{ width: 34, height: 34 }}>
          <Svg width={34} height={34} viewBox="0 0 34 34" style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={17} cy={17} r={15} fill="none" stroke="rgba(242,242,242,0.1)" strokeWidth={2.5} />
            <Circle cx={17} cy={17} r={15} fill="none" stroke={C.t1} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="56.5 94.2" />
          </Svg>
          <Text style={{ position: 'absolute', width: 34, top: 11, textAlign: 'center', color: C.t2, fontFamily: GEIST.demi, fontSize: 10 }}>60%</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            {nom('Reading')}
            {mono('1 h 48 / 3 h')}
          </View>
          <Text style={{ color: C.t3, fontFamily: GEIST.normal, fontSize: 12 }}>This week</Text>
        </View>
      </View>
    )
  return (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
      <View style={{ width: 54, gap: 2 }}>
        <Text style={{ color: C.t1, fontFamily: GEIST.moyen, fontSize: 18, lineHeight: 22, letterSpacing: -0.6 }}>07:00</Text>
        <Text style={{ color: C.t4, fontFamily: GEIST.moyen, fontSize: 11 }}>1 h</Text>
      </View>
      <View style={{ flex: 1, gap: 7, paddingTop: 1 }}>
        {nom('Gym')}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {WL.map((d, i) => {
            const on = i === 0 || i === 2 || i === 4
            return (
              <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: on ? C.t1 : 'rgba(242,242,242,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: on ? '#000' : C.t4, fontFamily: GEIST.demi, fontSize: 10 }}>{d}</Text>
              </View>
            )
          })}
        </View>
      </View>
    </View>
  )
}

export function EcranUne({ ctx }: { ctx: Ctx }) {
  const e = ctx.e
  const ids = choses(e)
  const ch = choisie(e, ctx.maintenant)
  const tpc = natureDe(e, ch)
  const picks = retenues(e)
  const toucherPuce = (id: string) => {
    vibrer('light')
    const on = picks.includes(id)
    if (!on) ctx.maj(() => ({ picks: [...picks, id], chosen: id }))
    else if (ch !== id) ctx.maj(() => ({ chosen: id }))
    else if (picks.length > 1) {
      const reste = picks.filter((x) => x !== id)
      ctx.maj(() => ({ picks: reste, chosen: reste[0]! }))
    }
  }
  const continuer = () => {
    vibrer('light')
    ctx.maj((x) => ({ ...reglagesPour(x, ch, ctx.maintenant), chosen: ch, type: { ...x.type, [ch]: tpc } }))
    ctx.suivant()
  }
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ position: 'absolute', inset: 0 }}
        contentContainerStyle={{ paddingTop: ctx.haut, paddingHorizontal: 24, paddingBottom: 130 + ctx.bas }}
        showsVerticalScrollIndicator={false}
      >
        {ids.length > 1 ? (
          <Entree dl={100} reduit={ctx.reduit} style={{ marginBottom: 24 }}>
            <Text style={T.petit}>Choose what Vethos takes on</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {ids.map((id) => {
                const on = picks.includes(id)
                const fo = id === ch
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => toucherPuce(id)}
                    style={{
                      height: 36,
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      justifyContent: 'center',
                      backgroundColor: on ? C.t1 : C.s1,
                      borderWidth: 1,
                      borderColor: fo ? C.t1 : on ? 'rgba(242,242,242,0.5)' : 'rgba(242,242,242,0.16)',
                      opacity: on && !fo ? 0.72 : 1,
                    }}
                  >
                    <Text style={{ color: on ? '#000' : C.t2, fontFamily: GEIST.moyen, fontSize: 14 }}>{ITEM[id]!.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </Entree>
        ) : null}
        <Entree dl={210} reduit={ctx.reduit}>
          <Titre>{`How should Vethos hold “${ITEM[ch]!.name}”?`}</Titre>
        </Entree>
        <View style={{ gap: 8, marginTop: 24 }}>
          {(['TASK', 'GOAL', 'ANCHOR'] as Nature[]).map((t, i) => (
            <Entree key={t} dl={430 + i * 110} reduit={ctx.reduit}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: t === tpc }}
                accessibilityLabel={`${t}. ${TYPEL[t]}${ITEM[ch]!.fit === t ? ' Best fit.' : ''}`}
                onPress={() => {
                  vibrer('light')
                  ctx.maj((x) => ({ type: { ...x.type, [ch]: t } }))
                }}
                style={({ pressed }) => ({
                  padding: 14,
                  borderRadius: 8,
                  backgroundColor: C.s1,
                  borderWidth: 1,
                  borderColor: t === tpc ? 'rgba(242,242,242,0.7)' : 'transparent',
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: TYPEC[t], borderWidth: 1, borderColor: 'rgba(242,242,242,0.16)' }} />
                  <Text style={{ color: C.t1, fontFamily: GEIST.demi, fontSize: 13, lineHeight: 18, letterSpacing: 1.4 }}>{t}</Text>
                  <View style={{ flex: 1 }} />
                  {ITEM[ch]!.fit === t ? (
                    <View style={{ height: 20, paddingHorizontal: 8, borderRadius: 4, backgroundColor: '#2f2f2f', justifyContent: 'center' }}>
                      <Text style={{ color: C.t1, fontFamily: GEIST.moyen, fontSize: 11 }}>Best fit</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: C.t2, fontFamily: GEIST.normal, fontSize: 14, lineHeight: 20, marginTop: 4 }}>{TYPEL[t]}</Text>
                <View
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    paddingBottom: 2,
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(242,242,242,0.07)',
                    opacity: t === tpc ? 1 : 0.5,
                  }}
                >
                  <Apercu tp={t} />
                </View>
              </Pressable>
            </Entree>
          ))}
        </View>
      </ScrollView>
      <PiedDegrade bas={ctx.bas} dl={800} reduit={ctx.reduit}>
        <Bouton onPress={continuer}>Continue</Bouton>
      </PiedDegrade>
    </View>
  )
}

// ——— 12 · Les réglages ———

export function EcranReglage({ ctx }: { ctx: Ctx }) {
  const e = ctx.e
  const ch = choisie(e, ctx.maintenant)
  const tp = natureDe(e, ch)
  const b = ctx.etape.k === '12b'
  const garder = () => {
    vibrer('medium')
    ctx.suivant()
  }
  const maj = (p: Partial<Ctx['e']['w']>) => ctx.maj((x) => ({ w: { ...x.w, ...p } }))
  const roue = (largeur: number, contenu: React.ReactNode, haut = 48) => (
    <Entree dl={320} reduit={ctx.reduit} style={{ width: largeur, alignSelf: 'center', marginTop: haut }}>
      {contenu}
    </Entree>
  )
  let titre = ''
  let corps: React.ReactNode = null
  let action = { label: 'Next', actif: true, f: () => (vibrer('light'), ctx.suivant()) }
  if (!b && tp === 'TASK') {
    titre = 'When does it need to be done?'
    corps = roue(240, <RoueJour valeur={e.w.due} changer={(v) => maj({ due: v })} jours={30} etiquette="Deadline" />)
  } else if (!b && tp === 'GOAL') {
    titre = 'How much time does it get each week?'
    corps = roue(240, <RoueDuree minutes={e.w.goalMin} changer={(v) => maj({ goalMin: v })} maxHeures={100} etiquette="Time per week" />)
    action = { label: 'Keep this commitment', actif: e.w.goalMin > 0, f: garder }
  } else if (!b) {
    titre = 'At what time?'
    corps = roue(200, <RoueHeure valeur={e.w.anAt} changer={(v) => maj({ anAt: v })} etiquette="Anchor time" />)
  } else if (tp === 'TASK') {
    titre = 'How much work is left, in total?'
    corps = roue(240, <RoueDuree minutes={e.w.taskMin} changer={(v) => maj({ taskMin: v })} maxHeures={150} etiquette="Work left" />)
    action = { label: 'Keep this commitment', actif: e.w.taskMin > 0, f: garder }
  } else {
    titre = 'For how long, and on which days?'
    corps = (
      <>
        {roue(240, <RoueDuree minutes={e.w.anDur} changer={(v) => maj({ anDur: v })} maxHeures={8} etiquette="Anchor duration" />, 40)}
        <Entree dl={430} reduit={ctx.reduit} style={{ marginTop: 32 }}>
          <Jours
            valeurs={e.days.an}
            basculer={(i) => {
              vibrer('light')
              ctx.maj((x) => {
                const an = [...x.days.an]
                an[i] = an[i] ? 0 : 1
                return { days: { ...x.days, an } }
              })
            }}
          />
        </Entree>
      </>
    )
    action = { label: 'Keep this commitment', actif: e.w.anDur > 0 && e.days.an.some(Boolean), f: garder }
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
        <Entree dl={100} reduit={ctx.reduit}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 16, backgroundColor: C.s1, borderRadius: 8 }}>
            <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: TYPEC[tp], borderWidth: 1, borderColor: 'rgba(242,242,242,0.16)' }} />
            <Text numberOfLines={1} style={{ flex: 1, color: C.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{ITEM[ch]!.name}</Text>
            <Text style={{ color: C.t3, fontFamily: MONO.normal, fontSize: 11, letterSpacing: 1 }}>{tp}</Text>
          </View>
        </Entree>
        <Entree dl={210} reduit={ctx.reduit} style={{ marginTop: 32 }}>
          <Titre>{titre}</Titre>
        </Entree>
        {corps}
      </View>
      <Entree dl={600} reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
        <Bouton actif={action.actif} onPress={action.f}>
          {action.label}
        </Bouton>
      </Entree>
    </View>
  )
}

// ——— 13 · La protection ———

type Icone = { nom: string; fond: string[]; g: string; gc?: string; fs?: number; bloque?: boolean }
const ICONES: Icone[] = [
  { nom: 'Calendar', fond: ['#fff'], g: '25', gc: '#e5484d', fs: 16 },
  { nom: 'Photos', fond: ['#f5a524', '#e5484d', '#a855f7', '#3b82f6', '#22c55e'], g: '' },
  { nom: 'Camera', fond: ['#d4d4d8', '#9ca3af'], g: '◉', gc: '#27272a', fs: 18 },
  { nom: 'Mail', fond: ['#5ab0ff', '#1a73e8'], g: '✉', fs: 16 },
  { nom: 'Instagram', fond: ['#fdc830', '#f25c54', '#c13584', '#5b51d8'], g: '◎', fs: 18, bloque: true },
  { nom: 'TikTok', fond: ['#010101'], g: '♪', fs: 17, bloque: true },
  { nom: 'YouTube', fond: ['#fff'], g: '▶', gc: '#ff0033', fs: 14, bloque: true },
  { nom: 'Snapchat', fond: ['#fffc00'], g: 'S', gc: '#111', fs: 16, bloque: true },
  { nom: 'Netflix', fond: ['#000'], g: 'N', gc: '#e50914', fs: 18, bloque: true },
  { nom: 'X', fond: ['#000'], g: 'X', fs: 15, bloque: true },
  { nom: 'Reddit', fond: ['#ff4500'], g: 'r', fs: 17, bloque: true },
  { nom: 'Clash Royale', fond: ['#3b82f6', '#1e3a8a'], g: '♛', gc: '#fcd34d', fs: 16, bloque: true },
  { nom: 'Maps', fond: ['#a7f3d0', '#60a5fa'], g: '➤', gc: '#1d4ed8', fs: 14 },
  { nom: 'Notes', fond: ['#fde68a', '#fff'], g: '' },
  { nom: 'Weather', fond: ['#60a5fa', '#2563eb'], g: '☀', gc: '#fde047', fs: 16 },
  { nom: 'Settings', fond: ['#a1a1aa', '#52525b'], g: '⚙', fs: 18 },
]
const DOCK: Icone[] = [
  { nom: 'Phone', fond: ['#5ee07a', '#22b14c'], g: '✆' },
  { nom: 'Safari', fond: ['#fff', '#e4e4e7'], g: '◈', gc: '#2563eb' },
  { nom: 'Messages', fond: ['#5ee07a', '#22b14c'], g: '●' },
  { nom: 'Music', fond: ['#ff5a6e', '#fa243c'], g: '♫' },
]

function Cadenas({ taille = 8 }: { taille?: number }) {
  return (
    <Svg width={taille} height={taille * 1.25} viewBox="0 0 12 14">
      <Path d="M3 6V4.2a3 3 0 0 1 6 0V6" fill="none" stroke="#fff" strokeWidth={1.8} />
      <Rect x={1.5} y={6} width={9} height={7} rx={1.5} fill="#fff" />
    </Svg>
  )
}

function IconeApp({ ic, verrouille, retard, reduit }: { ic: Icone; verrouille: boolean; retard: number; reduit: boolean }) {
  const L = verrouille && !!ic.bloque
  const o = useVers(L ? 1 : 0, 420, SORTIE, reduit ? 0 : retard)
  const id = `ic${ic.nom.replace(/\W/g, '')}`
  return (
    <View style={{ width: 38, height: 38 }}>
      <View style={{ position: 'absolute', inset: 0, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={38} height={38} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              {ic.fond.map((c, i) => (
                <Stop key={i} offset={ic.fond.length > 1 ? i / (ic.fond.length - 1) : 0} stopColor={c} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width={38} height={38} fill={`url(#${id})`} />
        </Svg>
        <Text style={{ color: ic.gc ?? '#fff', fontFamily: GEIST.demi, fontSize: ic.fs ?? 15, letterSpacing: -0.5 }}>{ic.g}</Text>
        {/* Écarté : l'icône s'éteint, comme sous Temps d'écran. */}
        <Animated.View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(20,20,24,0.62)', opacity: o }} />
      </View>
      <Animated.View
        style={{
          position: 'absolute',
          right: -3,
          top: -3,
          width: 15,
          height: 15,
          borderRadius: 8,
          backgroundColor: 'rgba(40,40,44,0.92)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: o,
          transform: [{ scale: o.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}
      >
        <Cadenas />
      </Animated.View>
    </View>
  )
}

export function EcranProtection({
  ctx,
  proteger,
}: {
  ctx: Ctx
  /** Ouvre Temps d'écran ; rend vrai si une sélection existe au retour. */
  proteger: () => Promise<boolean>
}) {
  const verrou = ctx.e.locked
  const [occupe, setOccupe] = useState(false)
  const pill = useVers(verrou ? 1 : 0, 420, SORTIE, 500)
  let n = 0
  const verrouiller = async () => {
    if (occupe) return
    setOccupe(true)
    try {
      if (await proteger()) {
        vibrer('medium')
        ctx.maj(() => ({ locked: true }))
      }
    } finally {
      setOccupe(false)
    }
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
        <Entree dl={150} reduit={ctx.reduit}>
          <Titre>Give it your undivided attention.</Titre>
        </Entree>
        <Entree dl={370} reduit={ctx.reduit} style={{ alignSelf: 'center', marginTop: 28 }}>
          <View
            accessible
            accessibilityLabel={verrou ? 'Your distractions are locked during the session.' : 'Your home screen, before the session.'}
            style={{ width: 224, height: 462, borderRadius: 40, backgroundColor: '#1a1a1c', borderWidth: 1, borderColor: 'rgba(242,242,242,0.14)', padding: 6 }}
          >
            <View style={{ flex: 1, borderRadius: 34, overflow: 'hidden', backgroundColor: '#121421' }}>
              <Svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%">
                <Defs>
                  <LinearGradient id="ecran-a" x1="0.2" y1="0" x2="0.6" y2="0.6">
                    <Stop offset="0" stopColor="#3d4f86" stopOpacity={0.9} />
                    <Stop offset="1" stopColor="#3d4f86" stopOpacity={0} />
                  </LinearGradient>
                  <LinearGradient id="ecran-b" x1="0.9" y1="0.9" x2="0.4" y2="0.4">
                    <Stop offset="0" stopColor="#7a2f3a" stopOpacity={0.85} />
                    <Stop offset="1" stopColor="#7a2f3a" stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#ecran-a)" />
                <Rect width="100%" height="100%" fill="url(#ecran-b)" />
              </Svg>
              <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 22, paddingRight: 18 }}>
                <Text style={{ color: '#fff', fontFamily: GEIST.demi, fontSize: 10 }}>9:41</Text>
              </View>
              <View style={{ position: 'absolute', top: 8, left: '50%', marginLeft: -31, width: 62, height: 18, borderRadius: 10, backgroundColor: '#000' }} />
              <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 34, alignItems: 'center', opacity: pill, transform: [{ translateY: pill.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
                <View style={{ height: 20, paddingHorizontal: 9, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Cadenas taille={7} />
                  <Text style={{ color: '#fff', fontFamily: GEIST.demi, fontSize: 9 }}>Focus · protected</Text>
                </View>
              </Animated.View>
              <View style={{ position: 'absolute', left: 12, right: 12, top: 62, flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
                {ICONES.map((ic) => {
                  const retard = ic.bloque ? n++ * 60 : 0
                  return (
                    <View key={ic.nom} style={{ width: '25%', alignItems: 'center', gap: 3 }}>
                      <IconeApp ic={ic} verrouille={verrou} retard={retard} reduit={ctx.reduit} />
                      <Text numberOfLines={1} style={{ maxWidth: '100%', color: '#fff', fontFamily: GEIST.normal, fontSize: 7.5, lineHeight: 9, opacity: verrou && ic.bloque ? 0.55 : 1 }}>
                        {ic.nom}
                      </Text>
                    </View>
                  )
                })}
              </View>
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 84, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' }} />
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' }} />
              </View>
              <View style={{ position: 'absolute', left: 8, right: 8, bottom: 10, height: 62, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
                {DOCK.map((ic) => (
                  <IconeApp key={ic.nom} ic={ic} verrouille={false} retard={0} reduit={ctx.reduit} />
                ))}
              </View>
            </View>
          </View>
        </Entree>
      </View>
      <Entree dl={600} reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas, gap: 4 }}>
        <Bouton
          actif={!occupe}
          onPress={
            verrou
              ? () => {
                  vibrer('light')
                  ctx.suivant()
                }
              : () => void verrouiller()
          }
        >
          {verrou ? 'Continue' : occupe ? 'Opening Screen Time…' : 'Lock my distractions'}
        </Bouton>
        <BoutonTexte onPress={verrou ? () => void verrouiller() : ctx.suivant}>
          {verrou ? 'Change what’s locked' : 'Not now'}
        </BoutonTexte>
      </Entree>
    </View>
  )
}

// ——— Le cadran 24 h (écrans 14 et 16) ———

const angle = (m: number) => (m / 1440) * 2 * Math.PI - Math.PI / 2
const pt = (m: number, r: number) => [200 + r * Math.cos(angle(m)), 200 + r * Math.sin(angle(m))] as const
export function arc(a0: number, a1: number, r: number) {
  let sp = (((a1 - a0) % 1440) + 1440) % 1440
  if (sp === 0) sp = 1439.9
  const [x0, y0] = pt(a0, r)
  const [x1, y1] = pt(a0 + sp, r)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${sp > 720 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}
const TICKS = Array.from({ length: 96 }, (_, i) => {
  const m = i * 15
  const h = i % 4 === 0
  const six = i % 24 === 0
  const [x1, y1] = pt(m, six ? 178 : h ? 180 : 182)
  const [x2, y2] = pt(m, six ? 192 : h ? 188 : 185)
  return { x1, y1, x2, y2, c: six ? C.t1 : h ? C.t3 : '#3a3a3a', w: six ? 1.5 : 1 }
})
function Graduations() {
  return (
    <>
      {TICKS.map((t, i) => (
        <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.c} strokeWidth={t.w} strokeLinecap="round" />
      ))}
    </>
  )
}
function Heures({ taille, police }: { taille: number; police: number }) {
  return (
    <>
      {([[0, '00'], [360, '06'], [720, '12'], [1080, '18']] as const).map(([m, t]) => {
        const [x, y] = pt(m, 150)
        return (
          <Text
            key={t}
            style={{
              position: 'absolute',
              left: (x / 400) * taille - 12,
              top: (y / 400) * taille - 7,
              width: 24,
              textAlign: 'center',
              color: C.t3,
              fontFamily: MONO.normal,
              fontSize: police,
            }}
          >
            {t}
          </Text>
        )
      })}
    </>
  )
}

// ——— Le contrat d'Ulysse ———

const MODES_CONTRAT: [Mode, string][] = [
  ['ally', 'Ally'],
  ['sergeant', 'Sergeant'],
]
const heures = (m: number) => (m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m / 60} h`)

export function EcranContrat({ ctx }: { ctx: Ctx }) {
  const e = ctx.e
  const ch = choisie(e, ctx.maintenant)
  const nature = natureDe(e, ch)
  const engagement =
    nature === 'GOAL'
      ? `${heures(e.w.goalMin)} a week`
      : nature === 'ANCHOR'
        ? `${e.w.anAt}, ${heures(e.w.anDur)}`
        : `${heures(e.w.taskMin)} before ${e.w.due.slice(8, 10)}/${e.w.due.slice(5, 7)}`
  const choisir = (m: Mode) => {
    vibrer('light')
    ctx.maj(() => ({ mode: m }))
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
        <Entree dl={150} reduit={ctx.reduit}>
          <Titre>Your contract.</Titre>
        </Entree>
        <Entree dl={330} reduit={ctx.reduit} style={{ marginTop: 20, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flexShrink: 1, color: C.t1, fontFamily: GEIST.demi, fontSize: 16 }}>{ITEM[ch]!.name}</Text>
            <Text style={{ color: C.t2, fontFamily: MONO.normal, fontSize: 13 }}>{engagement}</Text>
          </View>
          <Text style={{ color: C.t2, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21 }}>No changes during a block.</Text>
          <Text style={{ color: C.t2, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21 }}>A change to this contract takes 48 hours.</Text>
        </Entree>
        <View style={{ gap: 8, marginTop: 24 }}>
          {MODES_CONTRAT.map(([m, l], i) => (
            <Entree key={m} dl={480 + i * 110} reduit={ctx.reduit}>
              <Ligne titre={l} sous={duringBlockLine(m, 18)} forme="radio" pris={e.mode === m} onPress={() => choisir(m)} />
            </Entree>
          ))}
        </View>
      </View>
      <Entree dl={700} reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
        <Bouton
          actif={e.mode !== null}
          onPress={() => {
            vibrer('success')
            ctx.suivant()
          }}
        >
          Sign it
        </Bouton>
      </Entree>
    </View>
  )
}

// ——— L'âge : il fixe le plancher de la nuit ———

const AGES: [TrancheAge, string][] = [
  ['13-18', '13 – 18'],
  ['19-24', '19 – 24'],
  ['25+', '25+'],
]

export function EcranAge({ ctx }: { ctx: Ctx }) {
  const apres = useMinuteries()
  const occupe = useRef(false)
  const choisir = (a: TrancheAge) => {
    if (occupe.current) return
    occupe.current = true
    ctx.maj(() => ({ age: a }))
    vibrer('medium')
    apres(500, ctx.suivant)
  }
  return (
    <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
      <Entree dl={150} reduit={ctx.reduit}>
        <Titre>How old are you?</Titre>
      </Entree>
      <View style={{ gap: 8, marginTop: 24 }}>
        {AGES.map(([a, l], i) => (
          <Entree key={a} dl={370 + i * 110} reduit={ctx.reduit}>
            <Ligne titre={l} forme="radio" pris={ctx.e.age === a} onPress={() => choisir(a)} />
          </Entree>
        ))}
      </View>
    </View>
  )
}

// ——— 14 · La nuit ———

export function EcranNuit({ ctx }: { ctx: Ctx }) {
  const e = ctx.e
  const ok = nuitValide(e)
  const avant = useRef(ok)
  useEffect(() => {
    if (avant.current && !ok) vibrer('warning')
    avant.current = ok
  }, [ok])
  const bed = enMinutes(e.w.bed)
  const wake = enMinutes(e.w.wake)
  const n = nuitMinutes(e)
  const ac = ok ? C.t3 : ctx.acc
  const [bx, by] = pt(bed, 168)
  const [wx, wy] = pt(wake, 168)
  const maj = (p: Partial<Ctx['e']['w']>) => ctx.maj((x) => ({ w: { ...x.w, ...p } }))
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
        <Entree dl={150} reduit={ctx.reduit}>
          <Titre>Your day starts with a good night.</Titre>
        </Entree>
        <Entree dl={370} reduit={ctx.reduit} style={{ width: 260, height: 260, alignSelf: 'center', marginTop: 16 }}>
          <Svg width={260} height={260} viewBox="0 0 400 400">
            <Graduations />
            <Circle cx={200} cy={200} r={168} fill="none" stroke="rgba(242,242,242,0.12)" strokeWidth={2} />
            <Path d={arc(bed, wake, 158)} fill="none" stroke={ac} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
            <Circle cx={bx} cy={by} r={6} fill={ac} stroke="#000" strokeWidth={3} />
            <Circle cx={wx} cy={wy} r={6} fill={C.t1} stroke="#000" strokeWidth={3} />
          </Svg>
          <Heures taille={260} police={10} />
          <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ac }} />
              <Text style={{ color: C.t3, fontFamily: GEIST.demi, fontSize: 11, letterSpacing: 1.4 }}>NIGHT</Text>
            </View>
            <Text
              accessibilityLabel={`${Math.floor(n / 60)} hours ${n % 60} minutes of sleep`}
              style={{ marginTop: 4, color: ok ? C.t1 : ctx.ink, fontFamily: GEIST.demi, fontSize: 44, lineHeight: 50, letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}
            >
              {`${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')}`}
            </Text>
            <Text style={{ color: C.t2, fontFamily: MONO.normal, fontSize: 12 }}>{`${fmt(bed)} – ${fmt(wake)}`}</Text>
          </View>
        </Entree>
        <Entree dl={480} reduit={ctx.reduit} style={{ flexDirection: 'row', gap: 16, marginTop: 20 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: C.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>Bedtime</Text>
            <RoueHeure valeur={e.w.bed} changer={(v) => maj({ bed: v })} etiquette="Bedtime" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: C.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>Wake-up</Text>
            <RoueHeure valeur={e.w.wake} changer={(v) => maj({ wake: v })} etiquette="Wake-up" />
          </View>
        </Entree>
      </View>
      <Entree dl={600} reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
        <Bouton
          actif={ok}
          onPress={() => {
            vibrer('light')
            ctx.suivant()
          }}
        >
          Keep this time for me
        </Bouton>
      </Entree>
    </View>
  )
}

// ——— 15 · Les heures fixes ———

export function EcranFixes({ ctx }: { ctx: Ctx }) {
  const e = ctx.e
  const basculer = (L: Fixe) => {
    vibrer('light')
    ctx.maj((x) => {
      const f = x.fixed
      const n: Fixe[] =
        L === 'Nothing fixed'
          ? f.includes(L)
            ? []
            : [L]
          : (f.includes(L) ? f.filter((y) => y !== L) : [...f, L]).filter((y) => y !== 'Nothing fixed')
      return { fixed: n }
    })
  }
  const maj = (p: Partial<Ctx['e']['w']>) => ctx.maj((x) => ({ w: { ...x.w, ...p } }))
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ position: 'absolute', inset: 0 }}
        contentContainerStyle={{ paddingTop: ctx.haut, paddingHorizontal: 24, paddingBottom: 140 + ctx.bas }}
        showsVerticalScrollIndicator={false}
      >
        <Entree dl={150} reduit={ctx.reduit}>
          <Titre>What’s already part of your day?</Titre>
        </Entree>
        <View style={{ gap: 8, marginTop: 24 }}>
          {FIXL.map((L, i) => {
            const on = e.fixed.includes(L)
            const p = L === 'Work' ? 'wk' : L === 'School' ? 'sc' : null
            return (
              <View key={L} style={{ gap: 8 }}>
                <Entree dl={370 + i * 110} reduit={ctx.reduit}>
                  <Ligne titre={L} forme="check" pris={on} onPress={() => basculer(L)} />
                </Entree>
                {on && p ? (
                  <Entree reduit={ctx.reduit}>
                    <View style={{ backgroundColor: C.s1, borderRadius: 8, padding: 16, gap: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ flex: 1, gap: 6 }}>
                          <Text style={{ color: C.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>From</Text>
                          <RoueHeure
                            valeur={p === 'wk' ? e.w.wkFrom : e.w.scFrom}
                            changer={(v) => maj(p === 'wk' ? { wkFrom: v } : { scFrom: v })}
                            etiquette={`${L} start`}
                            bande="#232323"
                          />
                        </View>
                        <View style={{ flex: 1, gap: 6 }}>
                          <Text style={{ color: C.t3, fontFamily: GEIST.moyen, fontSize: 13, textAlign: 'center' }}>Until</Text>
                          <RoueHeure
                            valeur={p === 'wk' ? e.w.wkTo : e.w.scTo}
                            changer={(v) => maj(p === 'wk' ? { wkTo: v } : { scTo: v })}
                            etiquette={`${L} end`}
                            bande="#232323"
                          />
                        </View>
                      </View>
                      <Jours
                        hauteur={40}
                        fond={C.s2}
                        valeurs={e.days[p]}
                        basculer={(d) => {
                          vibrer('light')
                          ctx.maj((x) => {
                            const a = [...x.days[p]]
                            a[d] = a[d] ? 0 : 1
                            return { days: { ...x.days, [p]: a } }
                          })
                        }}
                      />
                    </View>
                  </Entree>
                ) : null}
              </View>
            )
          })}
        </View>
      </ScrollView>
      <PiedDegrade bas={ctx.bas} reduit={ctx.reduit}>
        <Bouton
          actif={e.fixed.length > 0}
          onPress={() => {
            vibrer('light')
            ctx.suivant()
          }}
        >
          Find its place, Vethos
        </Bouton>
      </PiedDegrade>
    </View>
  )
}

// ——— 16 · Trouver sa place ———

/** Ce que le vrai moteur a rendu, lu pour l'introduction. */
export type Placement = {
  jours: JourTemps[]
  /** Les identifiants de l'engagement principal, et de tout ce que l'intro crée. */
  principal: Set<string>
  crees: Set<string>
  erreur: string
}

function premierBloc(p: Placement) {
  for (const j of p.jours) {
    const s = j.segments.find((x) => x.ref && p.principal.has(x.ref))
    if (s) return { jour: j, seg: s }
  }
  return null
}

export function EcranPlace({ ctx, placement }: { ctx: Ctx; placement: Placement }) {
  const apres = useMinuteries()
  const { width } = useWindowDimensions()
  const taille = Math.min(369, width - 24)
  const e = ctx.e
  const bed = enMinutes(e.w.bed)
  const wake = enMinutes(e.w.wake)
  const premier = premierBloc(placement)
  const jour = premier?.jour ?? placement.jours[0]
  const slot = premier ? premier.seg.debut : null
  const du = premier ? Math.max(15, premier.seg.fin - premier.seg.debut) : 60
  const tp = premier ? natureDuBloc(premier.seg.nature) ?? 'GOAL' : 'GOAL'
  const aujourdHui = jour?.date === placement.jours[0]?.date
  const maintenant = new Date()
  const nm = maintenant.getHours() * 60 + maintenant.getMinutes()
  const [ph, setPh] = useState(false)
  const [lbl, setLbl] = useState(false)
  const rot = useRef(new Animated.Value(slot != null ? (slot / 1440) * 360 - 360 : 0)).current
  const bo = useRef(new Animated.Value(0)).current
  useEffect(() => {
    apres(350, () => setPh(true))
    if (slot == null) {
      apres(2400, ctx.suivant)
      return
    }
    const cible = (slot / 1440) * 360
    if (ctx.reduit) {
      rot.setValue(cible)
      apres(900, () => Animated.timing(bo, { toValue: 1, duration: 600, easing: SORTIE, useNativeDriver: true }).start())
      apres(1500, () => {
        vibrer('medium')
        setLbl(true)
      })
      apres(3000, ctx.suivant)
      return
    }
    apres(800, () => Animated.timing(bo, { toValue: 1, duration: 420, easing: SORTIE, useNativeDriver: true }).start())
    apres(900, () => Animated.timing(rot, { toValue: cible, duration: 2000, easing: DEPLACEMENT, useNativeDriver: true }).start())
    apres(2900, () => {
      vibrer('medium')
      setLbl(true)
    })
    apres(4200, ctx.suivant)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const wo = useVers(ph ? 1 : 0)
  const lo = useVers(lbl ? 1 : 0)
  const ao = useVers(lbl ? 0 : 1)
  const fixes = jour?.segments.filter((s) => s.nature === 'fixed') ?? []
  const autres = jour?.segments.filter((s) => s.ref && !placement.principal.has(s.ref) && natureDuBloc(s.nature)) ?? []
  const [nx, ny] = pt(nm, 168)
  const d = jour ? dateLocale(jour.date) : maintenant
  const pastille = `${aujourdHui ? 'TODAY' : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]} · ${d.getDate()} ${MOIS[d.getMonth()]!.toUpperCase()}`
  const nom = ITEM[choisie(e, ctx.maintenant)]!.name
  const grand = { color: C.t1, fontFamily: GEIST.demi, fontSize: 72, letterSpacing: -3, fontVariant: ['tabular-nums' as const], textAlign: 'center' as const, textShadowColor: '#000', textShadowRadius: 12 }
  return (
    <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
      <Entree dl={150} reduit={ctx.reduit}>
        <Titre>Finding its place.</Titre>
      </Entree>
      <Entree fondu duree={530} dl={200} reduit={ctx.reduit} style={{ width: taille, height: taille, marginTop: 48, marginLeft: -12 }}>
        <Svg width={taille} height={taille} viewBox="0 0 400 400">
          <Graduations />
          <Circle cx={200} cy={200} r={168} fill="none" stroke="#232323" strokeWidth={2} />
          <Path d={arc(bed, wake, 158)} fill="none" stroke={C.t3} strokeWidth={1.5} strokeDasharray="1 5" strokeLinecap="round" />
          {aujourdHui ? (
            <Path d={arc(wake, Math.max(wake + 1, nm), 168)} fill="none" stroke={C.t1} strokeWidth={2} strokeOpacity={0.35} />
          ) : null}
        </Svg>
        <Animated.View style={{ position: 'absolute', inset: 0, opacity: wo }}>
          <Svg width={taille} height={taille} viewBox="0 0 400 400">
            {fixes.map((f) => (
              <Path key={f.id} d={arc(f.debut, f.fin, 168)} fill="none" stroke="#5c5c5c" strokeWidth={2} />
            ))}
          </Svg>
        </Animated.View>
        <Animated.View style={{ position: 'absolute', inset: 0, opacity: lo }}>
          <Svg width={taille} height={taille} viewBox="0 0 400 400">
            {autres.map((b) => (
              <Path key={b.id} d={arc(b.debut, b.fin, 168)} fill="none" stroke={TRAIT[natureDuBloc(b.nature)!]} strokeWidth={8} strokeOpacity={0.8} />
            ))}
          </Svg>
        </Animated.View>
        {slot != null ? (
          <Animated.View
            style={{
              position: 'absolute',
              inset: 0,
              opacity: bo,
              transform: [{ rotate: rot.interpolate({ inputRange: [-720, 720], outputRange: ['-720deg', '720deg'] }) }],
            }}
          >
            <Svg width={taille} height={taille} viewBox="0 0 400 400">
              <Path d={arc(0, du, 168)} fill="none" stroke={TRAIT[tp]} strokeWidth={8} />
              {[0, du].map((m) => {
                const [x1, y1] = pt(m, 161)
                const [x2, y2] = pt(m, 175)
                return <Line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={2.5} />
              })}
            </Svg>
          </Animated.View>
        ) : null}
        <Svg style={{ position: 'absolute', inset: 0 }} width={taille} height={taille} viewBox="0 0 400 400">
          <G>
            <Line x1={200} y1={200} x2={nx} y2={ny} stroke={C.t3} strokeWidth={1.5} strokeLinecap="round" />
            <Circle cx={200} cy={200} r={3} fill={C.t3} />
            <Circle cx={nx} cy={ny} r={7} fill={ctx.acc} stroke="#000" strokeWidth={3} />
          </G>
        </Svg>
        <Heures taille={taille} police={11} />
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 6, paddingVertical: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ctx.acc }} />
            <Text style={{ color: C.t3, fontFamily: GEIST.demi, fontSize: 11, letterSpacing: 1.4 }}>{pastille}</Text>
          </View>
          <View style={{ height: 78, width: 260, marginTop: 6 }}>
            <Animated.Text style={[grand, { position: 'absolute', width: 260, lineHeight: 78, opacity: ao }]}>{fmt(nm)}</Animated.Text>
            <Animated.Text style={[grand, { position: 'absolute', width: 260, lineHeight: 78, opacity: lo }]}>
              {slot != null ? fmt(slot) : ''}
            </Animated.Text>
          </View>
          <View style={{ height: 22, width: 260 }}>
            <Animated.Text style={{ position: 'absolute', width: 260, textAlign: 'center', color: C.t3, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 22, opacity: ao }}>
              {nom}
            </Animated.Text>
            <Animated.Text style={{ position: 'absolute', width: 260, textAlign: 'center', color: C.t2, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 22, opacity: lo }}>
              {slot != null ? `${nom} · until ${fmt(slot + du)}` : ''}
            </Animated.Text>
          </View>
        </View>
      </Entree>
    </View>
  )
}

// ——— 17 · La semaine ———

export function EcranSemaine({
  ctx,
  placement,
  entrer,
}: {
  ctx: Ctx
  placement: Placement
  /** Enregistre pour de vrai, puis ouvre l'app. */
  entrer: () => void
}) {
  const e = ctx.e
  const bed = enMinutes(e.w.bed)
  const wake = enMinutes(e.w.wake)
  const premier = premierBloc(placement)
  const plein = !premier
  const [sel, setSel] = useState(() => Math.max(0, placement.jours.findIndex((j) => j === premier?.jour)))
  const [app, setApp] = useState(false)
  const ao = useVers(app ? 0 : 1, 900)
  const ho = useVers(app ? 1 : 0, 900, SORTIE, 400)
  const bo = useVers(app ? 0 : 1, 700)
  const w0 = Math.floor(wake / 60) * 60
  const w1 = bed > wake ? Math.min(1440, Math.ceil(bed / 60) * 60) : 1440
  const wr = w1 - w0
  const Y = (m: number) => ((Math.max(w0, Math.min(w1, m)) - w0) / wr) * 220
  const heures: { t: string; y: number }[] = []
  for (let m = w0 + 60; m < w1; m += 60) if ((m / 60) % 3 === 0) heures.push({ t: String(m / 60).padStart(2, '0'), y: Y(m) })
  const maintenant = new Date()
  const nm = maintenant.getHours() * 60 + maintenant.getMinutes()
  const autres = retenues(e).filter((id) => id !== choisie(e, ctx.maintenant)).map((id) => ITEM[id]!.name)
  const nom = ITEM[choisie(e, ctx.maintenant)]!.name
  const corps =
    autres.length === 0
      ? `“${nom}” finally has a place in your week.`
      : autres.length === 1
        ? `“${nom}” and “${autres[0]}” finally have a place in your week.`
        : `“${nom}” and ${autres.length} more finally have a place in your week.`
  const couleur = (nature: string) => {
    const n = natureDuBloc(nature)
    return n ? TYPEC[n] : '#1d1d1f'
  }
  const jourSel = placement.jours[sel]
  const items = jourSel
    ? [
        { a: wake, t: fmt(wake), l: 'Wake-up', c: C.s3, tc: C.t2 },
        ...jourSel.segments
          .filter((s) => s.nature !== 'sleep')
          .map((s) => ({
            a: s.debut,
            t: `${fmt(s.debut)} → ${fmt(s.fin)}`,
            l: s.titre,
            c: s.nature === 'fixed' ? 'rgba(141,141,141,0.45)' : couleur(s.nature),
            tc: s.nature === 'fixed' ? C.t2 : C.t1,
          })),
        { a: bed < wake ? bed + 1440 : bed, t: fmt(bed), l: 'Sleep', c: C.s3, tc: C.t2 },
      ].sort((x, y) => x.a - y.a)
    : []
  const dSel = jourSel ? dateLocale(jourSel.date) : maintenant
  const auj = new Date()
  const entrerVraiment = () => {
    vibrer('medium')
    setApp(true)
    entrer()
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
        <View style={{ minHeight: 118 }}>
          <Animated.View style={{ position: 'absolute', inset: 0, opacity: ao }}>
            <Entree dl={150} reduit={ctx.reduit}>
              <Titre>{plein ? 'Your week is full. Vethos sees it.' : 'This is what one decision changes.'}</Titre>
            </Entree>
            <Entree dl={260} reduit={ctx.reduit} style={{ marginTop: 8 }}>
              <Text style={T.corps}>{placement.erreur || (plein ? 'Free up some hours, or adjust the commitment.' : corps)}</Text>
            </Entree>
          </Animated.View>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, opacity: ho }}>
            <Text style={T.gris}>{`${JOURS_LONGS[(auj.getDay() + 6) % 7]} ${auj.getDate()} ${MOIS_LONGS[auj.getMonth()]}`}</Text>
            <Titre style={{ marginTop: 4 }}>Your week</Titre>
          </Animated.View>
        </View>
        <Entree dl={370} reduit={ctx.reduit} style={{ marginTop: 12, marginHorizontal: -24, flexDirection: 'row' }}>
          <View style={{ width: 40 }}>
            <View style={{ height: 52, borderBottomWidth: 1, borderBottomColor: 'rgba(242,242,242,0.08)' }} />
            <View style={{ height: 220, marginTop: 8 }}>
              {heures.map((h) => (
                <Text key={h.t} style={{ position: 'absolute', right: 8, top: h.y - 5, color: C.t4, fontFamily: MONO.normal, fontSize: 9, lineHeight: 10 }}>
                  {h.t}
                </Text>
              ))}
            </View>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', paddingRight: 8 }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 8, top: 60, height: 220 }}>
              {heures.map((h) => (
                <View key={h.t} style={{ position: 'absolute', left: 0, right: 0, top: h.y, height: 1, backgroundColor: 'rgba(242,242,242,0.06)' }} />
              ))}
            </View>
            {placement.jours.map((j, i) => {
              const d = dateLocale(j.date)
              const on = i === sel
              const td = i === 0
              return (
                <Pressable
                  key={j.date}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${JOURS_LONGS[(d.getDay() + 6) % 7]} ${d.getDate()}`}
                  onPress={() => {
                    vibrer('light')
                    setSel(i)
                  }}
                  style={{ flex: 1 }}
                >
                  <View style={{ height: 52, alignItems: 'center', justifyContent: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(242,242,242,0.08)' }}>
                    <Text style={{ color: on || td ? C.t1 : C.t3, fontFamily: GEIST.moyen, fontSize: 11, lineHeight: 13 }}>
                      {WL[(d.getDay() + 6) % 7]}
                    </Text>
                    <View style={{ minWidth: 24, height: 22, paddingHorizontal: 3, borderRadius: 6, backgroundColor: on ? C.t1 : td ? 'rgba(242,242,242,0.12)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: on ? '#000' : td ? C.t1 : C.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>{d.getDate()}</Text>
                    </View>
                  </View>
                  <View style={{ height: 220, marginTop: 8, borderLeftWidth: 1, borderLeftColor: 'rgba(242,242,242,0.05)', backgroundColor: on ? 'rgba(242,242,242,0.04)' : 'transparent' }}>
                    {j.segments
                      .filter((s) => s.nature !== 'sleep')
                      .map((s) => {
                        const a = Math.max(w0, s.debut)
                        const b = Math.min(w1, s.fin)
                        if (b <= a) return null
                        const fixe = s.nature === 'fixed'
                        return (
                          <View
                            key={s.id}
                            style={{
                              position: 'absolute',
                              left: 2,
                              right: 2,
                              top: Y(a),
                              height: Math.max(4, Y(b) - Y(a)),
                              borderRadius: 5,
                              backgroundColor: couleur(s.nature),
                              borderWidth: fixe ? 1 : 0,
                              borderColor: 'rgba(242,242,242,0.07)',
                            }}
                          />
                        )
                      })}
                    {td && nm >= w0 && nm <= w1 ? (
                      <View style={{ position: 'absolute', left: 0, right: 0, top: Y(nm) - 1, height: 2, backgroundColor: ctx.acc }}>
                        <View style={{ position: 'absolute', left: -3, top: -2, width: 6, height: 6, borderRadius: 3, backgroundColor: ctx.acc }} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        </Entree>
        <Entree dl={480} reduit={ctx.reduit} style={{ marginTop: 16 }}>
          <Text style={T.petit}>{`${JOURS_LONGS[(dSel.getDay() + 6) % 7]} ${dSel.getDate()} ${MOIS_LONGS[dSel.getMonth()]}`}</Text>
        </Entree>
        <Entree dl={520} reduit={ctx.reduit} style={{ marginTop: 8 }}>
          {items.map((it, k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 30 }}>
              <Text style={{ width: 106, color: C.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>{it.t}</Text>
              <View style={{ width: 3, height: 20, borderRadius: 1, backgroundColor: it.c }} />
              <Text numberOfLines={1} style={{ flex: 1, color: it.tc, fontFamily: GEIST.moyen, fontSize: 15 }}>{it.l}</Text>
            </View>
          ))}
        </Entree>
      </View>
      <Animated.View pointerEvents={app ? 'none' : 'auto'} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas, gap: 4, opacity: bo }}>
        {plein ? (
          <BoutonTexte hauteur={48} onPress={() => (vibrer('light'), ctx.aller({ k: '12a' }))}>
            Adjust my commitment
          </BoutonTexte>
        ) : null}
        <Entree dl={700} reduit={ctx.reduit}>
          <Bouton onPress={entrerVraiment}>Enter Vethos</Bouton>
        </Entree>
      </Animated.View>
    </View>
  )
}

