/**
 * La frise : son temps, surtout celui qui est déjà passé.
 *
 * Depuis le jour où il s'est décidé jusqu'à aujourd'hui, chaque soir qu'il a
 * repoussé est un point rouge. Aujourd'hui est une lumière. Après, quelques
 * mois de rouge atténué : ce qui arrivera si rien ne change.
 *
 * La bascule (juste avant « Vethos makes sure your day respects it ») :
 * la caméra entre dans aujourd'hui, puis ressort pendant que le rouge du futur
 * s'éteint, soir après soir, et devient des soirs que Vethos lui rend.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { GEIST, MONO } from '@/ui/primitives'
import type { Bilan } from './choix-introduction'
import { DEPLACEMENT, encre, LENTEUR, SORTIE, toucher } from './experience-introduction'

const lent = (ms: number) => Math.round(ms * LENTEUR)
const lourd = () =>
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined)

/** L'ordre dans lequel on allume les soirs d'une semaine : étalés, pas collés. */
const ORDRE_SOIRS = [3, 1, 5, 2, 4, 6, 0]
const JOUR = 86_400_000
const ETIQUETTE = 30
const ECART = 4
const OR = '#ffd9a0'

type Etat = 'vide' | 'passeLibre' | 'passePerdu' | 'aujourdhui' | 'futurLibre' | 'futurPerdu' | 'fin'
type Case = { etat: Etat; ordreFutur: number }
type Ligne = { nom: string; passe: boolean; cases: Case[] }

function motif(parSemaine: number) {
  const entiers = Math.min(7, Math.floor(parSemaine))
  return {
    toujours: ORDRE_SOIRS.slice(0, entiers),
    uneSurDeux: parSemaine - entiers >= 0.5 && entiers < 7 ? ORDRE_SOIRS[entiers]! : null,
  }
}
const perduCeJour = (b: Bilan, date: Date, reference: Date) => {
  const { toujours, uneSurDeux } = motif(b.parSemaine)
  const semaine = Math.floor((date.getTime() - reference.getTime()) / (7 * JOUR))
  return toujours.includes(date.getDay()) || (uneSurDeux === date.getDay() && Math.abs(semaine) % 2 === 0)
}

/** Construit les lignes : du mois où il s'est décidé jusqu'à quelques mois après aujourd'hui. */
export function construireFrise(bilans: Bilan[], moisFutur = 3, maintenant = new Date()): Ligne[] {
  const aujourdHui = new Date(maintenant)
  aujourdHui.setHours(12, 0, 0, 0)
  const semaines = Math.max(4, ...bilans.map((b) => b.semaines))
  const debut = new Date(aujourdHui.getTime() - semaines * 7 * JOUR)
  const debutPar = bilans.map((b) => new Date(aujourdHui.getTime() - b.semaines * 7 * JOUR))
  const premierMois = new Date(debut.getFullYear(), debut.getMonth(), 1, 12)
  const nbMois =
    (aujourdHui.getFullYear() - premierMois.getFullYear()) * 12 +
    (aujourdHui.getMonth() - premierMois.getMonth()) +
    1 +
    moisFutur
  const lignes: Ligne[] = []
  let ordre = 0
  for (let m = 0; m < nbMois; m++) {
    const mois = new Date(premierMois.getFullYear(), premierMois.getMonth() + m, 1, 12)
    const nb = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate()
    const cases: Case[] = []
    for (let d = 1; d <= nb; d++) {
      const date = new Date(mois.getFullYear(), mois.getMonth(), d, 12)
      let etat: Etat
      if (date.toDateString() === aujourdHui.toDateString()) etat = 'aujourdhui'
      else if (date < debut) etat = 'vide'
      else if (date < aujourdHui) {
        const perdu = bilans.some((b, i) => date >= debutPar[i]! && perduCeJour(b, date, aujourdHui))
        etat = perdu ? 'passePerdu' : 'passeLibre'
      } else {
        const fini = bilans.length === 1 && bilans[0]!.fin && date.toDateString() === bilans[0]!.fin.toDateString()
        const perdu = bilans.some((b) => (!b.fin || date <= b.fin) && perduCeJour(b, date, aujourdHui))
        etat = fini ? 'fin' : perdu ? 'futurPerdu' : 'futurLibre'
      }
      cases.push({ etat, ordreFutur: etat === 'futurPerdu' ? ordre++ : -1 })
    }
    lignes.push({
      nom: mois.toLocaleDateString('en-US', {
        month: 'short',
        ...(mois.getFullYear() !== aujourdHui.getFullYear() && mois.getMonth() === 0 ? { year: '2-digit' } : {}),
      }),
      passe: mois.getFullYear() * 12 + mois.getMonth() < aujourdHui.getFullYear() * 12 + aujourdHui.getMonth(),
      cases,
    })
  }
  return lignes
}

/** Aujourd'hui : une lumière chaude qui respire. Aucun mot ne la désigne. */
function Lumiere({ taille, reduit, eclat }: { taille: number; reduit: boolean; eclat?: Animated.Value }) {
  const souffle = useRef(new Animated.Value(reduit ? 0.5 : 0)).current
  useEffect(() => {
    if (reduit) return
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(souffle, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    a.start()
    return () => a.stop()
  }, [reduit, souffle])
  const halo = taille * 4.4
  return (
    <View style={{ width: taille, height: taille, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: halo,
          height: halo,
          borderRadius: halo / 2,
          backgroundColor: 'rgba(255, 210, 140, 0.22)',
          opacity: souffle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
          transform: [
            { scale: souffle.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.12] }) },
            ...(eclat ? [{ scale: eclat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }] : []),
          ],
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: halo * 0.5,
          height: halo * 0.5,
          borderRadius: halo,
          backgroundColor: 'rgba(255, 226, 180, 0.4)',
        }}
      />
      <View style={{ width: taille, height: taille, borderRadius: taille / 2, backgroundColor: '#fff6e6' }} />
    </View>
  )
}

function Point({
  c,
  taille,
  reduit,
  bascule,
  total,
  eclat,
}: {
  c: Case
  taille: number
  reduit: boolean
  bascule?: Animated.Value
  total: number
  eclat?: Animated.Value
}) {
  if (c.etat === 'aujourdhui') return <Lumiere taille={taille * 1.15} reduit={reduit} eclat={eclat} />
  if (c.etat === 'vide') return <View style={{ width: taille, height: taille }} />
  const rond = { width: taille, height: taille, borderRadius: taille / 2 } as const
  if (c.etat === 'futurPerdu' && bascule) {
    // L'onde part d'aujourd'hui : les premiers soirs basculent d'abord.
    const debut = (c.ordreFutur / Math.max(1, total)) * 0.82
    const v = bascule.interpolate({
      inputRange: [0, debut, Math.min(1, debut + 0.16), 1],
      outputRange: [0, 0, 1, 1],
    })
    return (
      <View style={rond}>
        <Animated.View
          style={[rond, { position: 'absolute', backgroundColor: encre.accentEncre, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }) }]}
        />
        <Animated.View
          style={[
            rond,
            {
              position: 'absolute',
              backgroundColor: encre.text,
              opacity: v,
              transform: [{ scale: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 1.35, 1] }) }],
            },
          ]}
        />
      </View>
    )
  }
  const fond =
    c.etat === 'passePerdu'
      ? encre.accentEncre
      : c.etat === 'futurPerdu'
        ? 'rgba(240, 82, 95, 0.5)'
        : c.etat === 'fin'
          ? encre.text
          : c.etat === 'passeLibre'
            ? '#242424'
            : '#171717'
  return <View style={[rond, { backgroundColor: fond }]} />
}

function Grille({
  lignes,
  largeur,
  reduit,
  apparition,
  bascule,
  eclat,
}: {
  lignes: Ligne[]
  largeur: number
  reduit: boolean
  apparition: Animated.Value[]
  bascule?: Animated.Value
  eclat?: Animated.Value
}) {
  const cellule = (largeur - ETIQUETTE) / 31
  const point = Math.max(3, cellule * 0.64)
  const total = lignes.reduce((s, l) => s + l.cases.filter((c) => c.ordreFutur >= 0).length, 0)
  return (
    <View style={{ gap: ECART }}>
      {lignes.map((l, r) => (
        <Animated.View
          key={`${l.nom}-${r}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: cellule,
            opacity: apparition[r]!.interpolate({ inputRange: [0, 1], outputRange: [0.06, 1] }),
            transform: [
              { translateY: apparition[r]!.interpolate({ inputRange: [0, 1], outputRange: [reduit ? 0 : 4, 0] }) },
            ],
          }}
        >
          <Text
            style={{
              width: ETIQUETTE,
              color: l.passe ? encre.text3 : '#5a5a5a',
              fontFamily: MONO.normal,
              fontSize: 9.5,
            }}
          >
            {l.nom}
          </Text>
          {l.cases.map((c, d) => (
            <View key={d} style={{ width: cellule, height: cellule, alignItems: 'center', justifyContent: 'center' }}>
              <Point c={c} taille={point} reduit={reduit} bascule={bascule} total={total} eclat={eclat} />
            </View>
          ))}
        </Animated.View>
      ))}
    </View>
  )
}

/** La frise, telle qu'on la lit dans le calcul : elle se remplit, puis se tait. */
export function Frise({
  bilans,
  reduit,
  anime = true,
  surFin,
}: {
  bilans: Bilan[]
  reduit: boolean
  anime?: boolean
  surFin?: () => void
}) {
  const [largeur, setLargeur] = useState(0)
  const lignes = useMemo(() => construireFrise(bilans), [bilans])
  const apparition = useRef(lignes.map(() => new Animated.Value(reduit || !anime ? 1 : 0))).current
  const fin = useRef(surFin)
  fin.current = surFin
  useEffect(() => {
    if (!largeur) return
    if (reduit || !anime) {
      fin.current?.()
      return
    }
    const a = Animated.stagger(
      lent(95),
      apparition.map((v) => Animated.timing(v, { toValue: 1, duration: lent(260), easing: SORTIE, useNativeDriver: true })),
    )
    a.start(({ finished }) => {
      if (!finished) return
      lourd()
      fin.current?.()
    })
    return () => a.stop()
  }, [anime, apparition, largeur, reduit])
  const perdus = lignes.reduce((s, l) => s + l.cases.filter((c) => c.etat === 'passePerdu').length, 0)
  return (
    <View
      onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Since you decided: ${perdus} evenings pushed to tomorrow. Today is lit. After it, what happens if nothing changes.`}
      style={{ gap: 10 }}
    >
      {largeur > 0 ? <Grille lignes={lignes} largeur={largeur} reduit={reduit} apparition={apparition} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginLeft: ETIQUETTE }}>
        <Legende couleur={encre.accentEncre} texte="Pushed to “tomorrow”" />
        <Legende couleur={OR} texte="Today" />
        <Legende couleur="rgba(240, 82, 95, 0.5)" texte="If nothing changes" />
      </View>
    </View>
  )
}

function Legende({ couleur, texte }: { couleur: string; texte: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: couleur }} />
      <Text style={{ color: encre.text3, fontFamily: GEIST.normal, fontSize: 11 }}>{texte}</Text>
    </View>
  )
}

/**
 * La bascule. Tout son passé perdu, puis la caméra entre dans aujourd'hui ;
 * en ressortant, le rouge du futur s'éteint soir après soir et devient
 * blanc — des soirs que Vethos lui rend. Sans un bouton.
 */
export function Bascule({ bilans, reduit, surFin }: { bilans: Bilan[]; reduit: boolean; surFin: () => void }) {
  const [largeur, setLargeur] = useState(0)
  const [phase, setPhase] = useState(0)
  const lignes = useMemo(() => construireFrise(bilans, 4), [bilans])
  const apparition = useRef(lignes.map(() => new Animated.Value(reduit ? 1 : 0))).current
  const zoom = useRef(new Animated.Value(0)).current
  const bascule = useRef(new Animated.Value(0)).current
  const eclat = useRef(new Animated.Value(0)).current
  const fin = useRef(surFin)
  fin.current = surFin

  // Où est aujourd'hui dans la grille : c'est là que la caméra entre.
  const cellule = largeur ? (largeur - ETIQUETTE) / 31 : 0
  let rangee = 0
  let colonne = 0
  lignes.forEach((l, r) =>
    l.cases.forEach((c, d) => {
      if (c.etat === 'aujourdhui') {
        rangee = r
        colonne = d
      }
    }),
  )
  const hauteur = lignes.length * cellule + (lignes.length - 1) * ECART
  const cx = ETIQUETTE + colonne * cellule + cellule / 2 - largeur / 2
  const cy = rangee * (cellule + ECART) + cellule / 2 - hauteur / 2
  const ECHELLE = 3.4

  useEffect(() => {
    if (!largeur) return
    const minuteurs: ReturnType<typeof setTimeout>[] = []
    const plus = (ms: number, f: () => void) => minuteurs.push(setTimeout(f, ms))
    if (reduit) {
      setPhase(1)
      plus(900, () => {
        setPhase(2)
        Animated.timing(bascule, { toValue: 1, duration: 300, useNativeDriver: true }).start()
      })
      plus(2400, () => fin.current())
      return () => minuteurs.forEach(clearTimeout)
    }
    const revele = Animated.stagger(
      lent(70),
      apparition.map((v) => Animated.timing(v, { toValue: 1, duration: lent(240), easing: SORTIE, useNativeDriver: true })),
    )
    revele.start()
    const t1 = lent(70) * lignes.length + lent(1500)
    plus(t1, () => {
      setPhase(1)
      Animated.timing(zoom, { toValue: 1, duration: lent(900), easing: DEPLACEMENT, useNativeDriver: true }).start(() => {
        lourd()
        Animated.sequence([
          Animated.timing(eclat, { toValue: 1, duration: 260, easing: SORTIE, useNativeDriver: true }),
          Animated.timing(eclat, { toValue: 0, duration: 900, easing: SORTIE, useNativeDriver: true }),
        ]).start()
      })
    })
    const t2 = t1 + lent(900) + lent(1400)
    plus(t2, () => {
      setPhase(2)
      Animated.parallel([
        Animated.timing(zoom, { toValue: 0, duration: lent(900), easing: DEPLACEMENT, useNativeDriver: true }),
        Animated.timing(bascule, {
          toValue: 1,
          duration: lent(1800),
          delay: lent(300),
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start()
      // L'onde se sent sous le doigt : quelques petits coups, qui s'espacent.
      ;[0, 280, 620, 1050, 1600].forEach((ms) => plus(lent(300 + ms), () => toucher('leger')))
    })
    plus(t2 + lent(2100) + lent(1600), () => fin.current())
    return () => {
      revele.stop()
      minuteurs.forEach(clearTimeout)
    }
  }, [apparition, bascule, eclat, largeur, lignes.length, reduit, zoom])

  const legendes = [
    'Every red dot is an evening you meant it.',
    'Today.',
    'From today, those evenings are yours again.',
  ]
  return (
    <View style={{ gap: 26 }}>
      <View style={{ minHeight: 80, justifyContent: 'flex-end' }}>
        <Text
          key={phase}
          accessibilityLiveRegion="polite"
          style={{
            color: encre.text,
            fontFamily: GEIST.demi,
            fontSize: phase === 1 ? 44 : 26,
            lineHeight: phase === 1 ? 50 : 32,
            letterSpacing: phase === 1 ? -1.4 : -0.6,
          }}
        >
          {legendes[phase]}
        </Text>
      </View>
      <View
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        accessible
        accessibilityLabel="Your evenings since you decided, then today, then the evenings Vethos gives back."
        style={{ overflow: 'hidden', height: hauteur || 200, borderRadius: 12 }}
      >
        {largeur > 0 ? (
          <Animated.View
            style={{
              transform: [
                { translateX: zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -cx * ECHELLE] }) },
                { translateY: zoom.interpolate({ inputRange: [0, 1], outputRange: [0, -cy * ECHELLE] }) },
                { scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1, ECHELLE] }) },
              ],
            }}
          >
            <Grille
              lignes={lignes}
              largeur={largeur}
              reduit={reduit}
              apparition={apparition}
              bascule={bascule}
              eclat={eclat}
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}
