/**
 * Acte 2 — le coût. Chaque chose montre son passé, soir repoussé après soir
 * repoussé ; puis la pensée qui a tout coûté, frappée mot par mot ; puis
 * l'année qui vient, et ce que Vethos en rend ; puis Vethos.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Image, Text, useWindowDimensions, View } from 'react-native'
import {
  annee,
  ajouter,
  calendrier,
  ITEM,
  midi,
  MOIS,
  resume,
  type Mesure,
} from './catalogue-introduction'
import { frequence, mesures, type Ctx } from './etat-introduction'
import {
  Bouton,
  C,
  DEPLACEMENT,
  Entree,
  GEIST,
  SORTIE,
  T,
  Titre,
  lancer,
  useCompte,
  useVers,
  vibrer,
} from './briques-introduction'
import { useMinuteries } from './ecrans-ecoute'

/** Une horloge en millisecondes, de 0 à `jusqua`, pour synchroniser des centaines de points. */
function useHorloge(jusqua: number, actif = true) {
  const t = useRef(new Animated.Value(actif ? 0 : jusqua)).current
  useEffect(() => {
    if (!actif) return
    t.setValue(0)
    return lancer(Animated.timing(t, { toValue: jusqua, duration: jusqua, easing: Easing.linear, useNativeDriver: true }))
  }, [actif, jusqua, t])
  return t
}

// ——— 7 · Le coût ———

/** Le temps du calendrier : les mois, puis les soirs un à un. */
const dureeCalendrier = (rangs: number) => rangs * 120 + 31 * 8 + 300

function Calendrier({ m, pw, acc, reduit, maintenant, hauteurMax }: { m: Mesure; pw: number; acc: string; reduit: boolean; maintenant: Date; hauteurMax: number }) {
  const { width } = useWindowDimensions()
  const rows = useMemo(() => calendrier(m.start, m.finish, pw, maintenant), [m.start, m.finish, pw, maintenant])
  const t = useHorloge(dureeCalendrier(rows.length), !reduit)
  // Un mois sur deux lignes de 16 soirs, des carrés arrondis. Toute la largeur,
  // bord à bord : quand la hauteur force des carrés plus petits, ce sont les
  // écarts qui grandissent, jamais un vide à droite.
  const ETIQUETTE = 34
  const ENTRE_MOIS = 8
  const largeur = width - 48 - ETIQUETTE
  const parLargeur = Math.floor((largeur - 15 * 3) / 16)
  const parHauteur = Math.floor((hauteurMax - (rows.length - 1) * ENTRE_MOIS) / (rows.length * 2 + rows.length * 0.4))
  const d = Math.max(5, Math.min(20, parLargeur, parHauteur))
  const ecartV = Math.max(2, Math.round(d * 0.4))
  const vu = (dl: number, duree = 300) =>
    reduit ? 1 : t.interpolate({ inputRange: [dl, dl + duree], outputRange: [0, 1], extrapolate: 'clamp' })
  const rayon = Math.max(1.5, d * 0.22)
  const carre = (p: (typeof rows)[number]['dots'][number], i: number) => (
    <Animated.View key={i} style={{ width: d, height: d, opacity: vu(p.dl) }}>
      <View
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: rayon,
          backgroundColor: p.today ? C.t1 : p.rouge ? acc : C.s2,
          opacity: p.futur ? 0.35 : 1,
        }}
      />
      {p.ring ? (
        <View style={{ position: 'absolute', left: -3, top: -3, width: d + 6, height: d + 6, borderRadius: rayon + 2, borderWidth: 1.5, borderColor: C.t1 }} />
      ) : null}
    </Animated.View>
  )
  // La seconde ligne a 15 soirs au plus : des cases vides gardent les colonnes alignées.
  const ligne = (pts: (typeof rows)[number]['dots'], depart: number) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {pts.map((p, i) => carre(p, i + depart))}
      {Array.from({ length: 16 - pts.length }, (_, i) => <View key={`v${i}`} style={{ width: d, height: d }} />)}
    </View>
  )
  return (
    <View style={{ gap: ENTRE_MOIS }} accessible accessibilityLabel={`${rows.length} months of evenings. Each colored square is an evening pushed to tomorrow.`}>
      {rows.map((r) => (
        <View key={r.label + r.dl} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Animated.Text style={{ width: ETIQUETTE, color: C.t3, fontFamily: GEIST.moyen, fontSize: 12, lineHeight: 16, opacity: vu(r.dl, 420) }}>
            {r.label}
          </Animated.Text>
          <View style={{ flex: 1, gap: ecartV }}>
            {ligne(r.dots.slice(0, 16), 0)}
            {ligne(r.dots.slice(16), 16)}
          </View>
        </View>
      ))}
    </View>
  )
}

/** Une phrase qui se lit d'un coup d'œil : grande, seule, jamais un paragraphe. */
const PHRASE = { color: C.t1, fontFamily: GEIST.demi, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 } as const

function BlocChose({
  ctx,
  m,
  i,
  n,
  onFin,
  sortie,
}: {
  ctx: Ctx
  m: Mesure
  i: number
  n: number
  onFin: () => void
  sortie: boolean
}) {
  const apres = useMinuteries()
  const { height: hauteurEcran } = useWindowDimensions()
  // Un temps après l'autre : le chiffre seul, qui compte ; ce qu'il veut dire ;
  // les soirs, un à un ; puis les soirs s'en vont et laissent la suite.
  const [etape, setEtape] = useState(0)
  const COMPTE = 2200
  const compte = useCompte(m.big, { duree: COMPTE, delai: 300, reduit: ctx.reduit })
  const rangs = calendrier(m.start, m.finish, frequence(ctx.e).pw, ctx.maintenant).length
  useEffect(() => {
    apres(300, () => vibrer('light'))
    if (ctx.reduit) {
      setEtape(3)
      apres(1000, onFin)
      return
    }
    const sens = COMPTE + 500
    const soirs = sens + 1100
    const suite = soirs + dureeCalendrier(rangs) + 1400
    apres(COMPTE + 300, () => vibrer('medium'))
    apres(sens, () => setEtape(1))
    apres(soirs, () => setEtape(2))
    apres(suite, () => setEtape(3))
    apres(suite + 900, onFin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const o = useVers(sortie ? 0 : 1, 530, DEPLACEMENT)
  const x = useVers(sortie && !ctx.reduit ? -24 : 0, 530, DEPLACEMENT)
  // Le chiffre commence au milieu de l'écran, seul ; il monte quand le reste arrive.
  const seul = useVers(etape === 0 ? 1 : 0, 700, DEPLACEMENT)
  const montee = seul.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, hauteurEcran * 0.26)] })
  const soirsVisibles = useVers(etape === 2 ? 1 : 0, etape === 3 ? 450 : 1, DEPLACEMENT)
  // La place qui reste vraiment sous l'en-tête, mesurée — pas devinée.
  const [hauteurSoirs, setHauteurSoirs] = useState(Math.max(200, hauteurEcran - ctx.haut - ctx.bas - 300))
  return (
    <Animated.View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut, bottom: ctx.bas + 8, opacity: o, transform: [{ translateX: x }] }}>
      <Animated.View style={{ transform: [{ translateY: montee }] }}>
        <Entree dl={100} reduit={ctx.reduit}>
          <Text style={T.gris}>{(n > 1 ? `${i + 1} of ${n} · ` : '') + ITEM[m.id]!.label}</Text>
        </Entree>
        <Entree dl={200} reduit={ctx.reduit} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
          <Text
            accessibilityLabel={`${m.big} ${m.unit}`}
            style={{ color: ctx.ink, fontFamily: GEIST.demi, fontSize: 104, lineHeight: 108, letterSpacing: -3.5, fontVariant: ['tabular-nums'] }}
          >
            {compte}
          </Text>
          <Text style={{ color: C.t1, fontFamily: GEIST.demi, fontSize: 26, lineHeight: 32 }}>{m.unit}</Text>
        </Entree>
        <View style={{ minHeight: 64, marginTop: 4 }}>
          {etape >= 1 ? (
            <Entree reduit={ctx.reduit}>
              <Text style={PHRASE}>{m.sub}</Text>
            </Entree>
          ) : null}
        </View>
      </Animated.View>
      <View style={{ flex: 1, marginTop: 24 }} onLayout={(ev) => setHauteurSoirs(Math.max(160, Math.floor(ev.nativeEvent.layout.height)))}>
        {etape === 2 || (etape === 3 && !ctx.reduit) ? (
          <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: soirsVisibles }}>
            <Calendrier m={m} pw={frequence(ctx.e).pw} acc={ctx.acc} reduit={ctx.reduit} maintenant={ctx.maintenant} hauteurMax={hauteurSoirs} />
          </Animated.View>
        ) : null}
        {etape === 3 ? (
          <Entree dl={ctx.reduit ? 0 : 350} reduit={ctx.reduit} style={{ position: 'absolute', left: 0, right: 0, top: '30%' }}>
            <Text style={[PHRASE, { fontSize: 30, lineHeight: 36, letterSpacing: -0.7 }]}>{m.l2}</Text>
          </Entree>
        ) : null}
      </View>
    </Animated.View>
  )
}

export function EcranCout({ ctx }: { ctx: Ctx }) {
  const apres = useMinuteries()
  const ms = useMemo(() => mesures(ctx.e, ctx.maintenant), [ctx.e, ctx.maintenant])
  const [i, setI] = useState(0)
  const [pret, setPret] = useState(false)
  const [sortie, setSortie] = useState(false)
  const [somme, setSomme] = useState(false)
  const [eq, setEq] = useState(false)
  const [fin, setFin] = useState(false)
  const r = resume(ms)
  const total = useCompte(r.v, { duree: 1200, delai: 400, actif: somme, reduit: ctx.reduit })
  const beaucoup = ms.length > 3

  const suivante = () => {
    setPret(false)
    setSortie(true)
    apres(530, () => {
      setSortie(false)
      if (i + 1 >= ms.length) {
        setSomme(true)
        apres(400, () => vibrer('light'))
        apres(3500, () => setEq(true))
        apres(4400, () => setFin(true))
      } else setI(i + 1)
    })
  }
  const blocFini = () => {
    // Plus de trois choses : elles défilent seules. Sinon, il avance quand il est prêt.
    if (beaucoup) apres(2400, suivante)
    else setPret(true)
  }
  const m = ms[i]
  return (
    <View style={{ flex: 1 }}>
      {!somme && m ? <BlocChose key={m.id} ctx={ctx} m={m} i={i} n={ms.length} onFin={blocFini} sortie={sortie} /> : null}
      {somme ? (
        <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
          <Entree dl={100} reduit={ctx.reduit}>
            <Text style={{ color: C.t2, fontFamily: GEIST.normal, fontSize: 18, lineHeight: 26 }}>
              All together, since you first decided,
            </Text>
          </Entree>
          <Entree dl={250} reduit={ctx.reduit} style={{ marginTop: 4 }}>
            <Text
              accessibilityLabel={String(r.v)}
              style={{ color: C.t1, fontFamily: GEIST.demi, fontSize: 88, lineHeight: 92, letterSpacing: -2.5, fontVariant: ['tabular-nums'] }}
            >
              {total}
            </Text>
          </Entree>
          <Entree dl={400} reduit={ctx.reduit}>
            <Text style={{ color: C.t1, fontFamily: GEIST.demi, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 }}>{r.label}</Text>
          </Entree>
          <View style={{ minHeight: 64, marginTop: 28 }}>
            {eq ? (
              <Entree reduit={ctx.reduit}>
                <Text style={PHRASE}>{r.eq}</Text>
              </Entree>
            ) : null}
          </View>
        </View>
      ) : null}
      {pret && !somme ? (
        <Entree reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
          <Bouton
            onPress={() => {
              vibrer('light')
              suivante()
            }}
          >
            {i < ms.length - 1 ? 'Show me the next one' : 'Show me all of it'}
          </Bouton>
        </Entree>
      ) : null}
      {fin ? (
        <Entree fondu duree={530} reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
          <Bouton
            onPress={() => {
              vibrer('medium')
              ctx.suivant()
            }}
          >
            I don’t want that
          </Bouton>
        </Entree>
      ) : null}
    </View>
  )
}

// ——— 8 · La pensée ———

function Mot({ texte, couleur, visible, reduit }: { texte: string; couleur: string; visible: boolean; reduit: boolean }) {
  const p = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!visible) return
    return lancer(Animated.timing(p, { toValue: 1, duration: reduit ? 420 : 90, easing: SORTIE, useNativeDriver: true }))
  }, [p, reduit, visible])
  return (
    <Animated.Text
      style={{
        color: couleur,
        fontFamily: GEIST.demi,
        fontSize: 40,
        lineHeight: 46,
        letterSpacing: -1,
        opacity: p,
        transform: [{ scale: reduit ? 1 : p.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }],
      }}
    >
      {texte}
    </Animated.Text>
  )
}

export function EcranPensee({ ctx }: { ctx: Ctx }) {
  const apres = useMinuteries()
  const [w, setW] = useState(0)
  const [ligne, setLigne] = useState(false)
  const [btn, setBtn] = useState(false)
  const secousse = useRef(new Animated.Value(0)).current
  const ms = mesures(ctx.e, ctx.maintenant)
  const fq = frequence(ctx.e)
  const fois = Math.round(fq.pw * Math.max(...ms.map((m) => m.weeks)))
  useEffect(() => {
    if (ctx.reduit) {
      apres(400, () => {
        setW(3)
        vibrer('heavy')
      })
      apres(1100, () => setLigne(true))
      apres(2900, () => setBtn(true))
      return
    }
    ;[0, 1, 2].forEach((j) =>
      apres(400 + j * 420, () => {
        setW(j + 1)
        vibrer('heavy')
      }),
    )
    apres(1330, () => {
      vibrer('error')
      Animated.sequence(
        [6, -6, 6, -6, 6, 0].map((v) =>
          Animated.timing(secousse, { toValue: v, duration: 50, easing: Easing.linear, useNativeDriver: true }),
        ),
      ).start()
    })
    apres(1940, () => setLigne(true))
    apres(3740, () => setBtn(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const mots = ['“I’ll', 'start', 'tomorrow.”']
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: 0, bottom: 140, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          accessible
          accessibilityLabel="I’ll start tomorrow."
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, transform: [{ translateX: secousse }] }}
        >
          {mots.map((t, j) => (
            <Mot key={t} texte={t} couleur={j === 2 ? ctx.ink : C.t1} visible={w > j} reduit={ctx.reduit} />
          ))}
        </Animated.View>
        <View style={{ minHeight: 84, marginTop: 24 }}>
          {ligne ? (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Entree reduit={ctx.reduit}>
                <Text style={{ color: C.t2, fontFamily: GEIST.normal, fontSize: 20, lineHeight: 28, textAlign: 'center' }}>
                  {`You’ve said it ${fois <= 1 ? 'once' : `${fois} times`}.`}
                </Text>
              </Entree>
              <Entree dl={700} reduit={ctx.reduit}>
                <Text style={{ color: C.t1, fontFamily: GEIST.demi, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, textAlign: 'center' }}>
                  Tomorrow never came.
                </Text>
              </Entree>
            </View>
          ) : null}
        </View>
      </View>
      {btn ? (
        <Entree reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
          <Bouton
            onPress={() => {
              vibrer('medium')
              ctx.suivant()
            }}
          >
            Not this time.
          </Bouton>
        </Entree>
      ) : null}
    </View>
  )
}

// ——— 9 · La bascule ———

export function EcranBascule({ ctx }: { ctx: Ctx }) {
  const apres = useMinuteries()
  const { width } = useWindowDimensions()
  const y = useMemo(() => annee(frequence(ctx.e).pw, ctx.maintenant), [ctx.e, ctx.maintenant])
  const [b, setB] = useState(false)
  const [cap, setCap] = useState(false)
  const [fade, setFade] = useState(false)
  const cA = useCompte(y.M, { duree: 1400, delai: 700, reduit: ctx.reduit })
  const cB = useCompte(y.K, { de: y.M, duree: 2200, delai: 100, actif: b, reduit: ctx.reduit })
  const REVELE = 200 + 18 * 70 + 19 * 6 + 300
  const revele = useHorloge(REVELE, !ctx.reduit)
  const vague = useHorloge(1800 + 420, b && !ctx.reduit)
  useEffect(() => {
    apres(700, () => vibrer('light'))
    apres(2400, () => vibrer('heavy'))
    apres(4200, () => {
      setB(true)
      vibrer('light')
      for (let k = 1; k <= 6; k++) apres(k * 300, () => vibrer('light'))
    })
    apres(6400, () => setCap(true))
    apres(9400, () => setFade(true))
    apres(10900, ctx.suivant)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const tout = useVers(fade ? 0 : 1, 1200)
  const aO = useVers(b ? 0 : 1)
  const bO = useVers(b ? 1 : 0)
  const capO = useVers(cap ? 1 : 0, 700, SORTIE, cap && !ctx.reduit ? 350 : 0)
  const grilleO = useVers(cap && !ctx.reduit ? 0 : 1, 450)
  const cote = (Math.min(345, width - 48) - 19 * 4) / 20
  const fin = ajouter(midi(ctx.maintenant), 364)
  return (
    <Animated.View style={{ flex: 1, opacity: tout }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: ctx.haut }}>
        <View style={{ height: 21 }}>
          <Entree fondu duree={530} dl={200} reduit={ctx.reduit} style={{ position: 'absolute', inset: 0 }}>
            <Animated.Text style={[T.gris, { opacity: aO }]}>The next 365 days, if nothing changes.</Animated.Text>
          </Entree>
          <Animated.Text style={[T.gris, { position: 'absolute', opacity: bO }]}>With Vethos, it can drop to</Animated.Text>
        </View>
        <View style={{ height: 84, marginTop: 12 }}>
          <Entree dl={300} reduit={ctx.reduit} style={{ position: 'absolute', left: 0, top: 0 }}>
            <Animated.View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, opacity: aO }}>
              <Text style={{ color: ctx.ink, fontFamily: GEIST.demi, fontSize: 80, lineHeight: 84, letterSpacing: -2.5, fontVariant: ['tabular-nums'] }}>
                {cA}
              </Text>
              <Text style={{ color: C.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28 }}>days</Text>
            </Animated.View>
          </Entree>
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'baseline', gap: 10, opacity: bO }}>
            <Text style={{ color: C.t1, fontFamily: GEIST.demi, fontSize: 80, lineHeight: 84, letterSpacing: -2.5, fontVariant: ['tabular-nums'] }}>
              {b ? cB : y.M}
            </Text>
            <Text style={{ color: C.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28 }}>days</Text>
          </Animated.View>
        </View>
        <View style={{ height: 34, marginTop: 2 }}>
          <Entree dl={400} reduit={ctx.reduit} style={{ position: 'absolute', inset: 0 }}>
            <Animated.Text style={[PHRASE, { opacity: aO }]}>pushed to “tomorrow”.</Animated.Text>
          </Entree>
          <Animated.Text style={[PHRASE, { position: 'absolute', opacity: bO }]}>{`instead of ${y.M}.`}</Animated.Text>
        </View>
        <Animated.View style={{ opacity: grilleO }}>
        <View
          accessible
          accessibilityLabel={`${y.M} evenings pushed in the next year if nothing changes. With Vethos, ${y.K}.`}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 32 }}
        >
          {y.cells.map((c, i) => {
            const dl = 200 + Math.floor(i / 20) * 70 + (i % 20) * 6
            const wd = Math.round((i / 365) * 1800)
            return (
              <Animated.View
                key={i}
                style={{
                  width: cote,
                  height: cote,
                  opacity: ctx.reduit ? 1 : revele.interpolate({ inputRange: [dl, dl + 300], outputRange: [0, 1], extrapolate: 'clamp' }),
                }}
              >
                <View style={{ position: 'absolute', inset: 0, borderRadius: 3, backgroundColor: c.p ? ctx.acc : C.s2 }} />
                {c.p && !c.keep ? (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 3,
                      backgroundColor: C.t1,
                      opacity: !b ? 0 : ctx.reduit ? 1 : vague.interpolate({ inputRange: [wd, wd + 420], outputRange: [0, 1], extrapolate: 'clamp' }),
                    }}
                  />
                ) : null}
                {c.today ? (
                  <View style={{ position: 'absolute', left: -3, top: -3, right: -3, bottom: -3, borderRadius: 5, borderWidth: 1.5, borderColor: C.t1 }} />
                ) : null}
              </Animated.View>
            )
          })}
        </View>
        <Entree fondu dl={900} reduit={ctx.reduit} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ color: C.t3, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 16 }}>Today</Text>
          <Text style={{ color: C.t3, fontFamily: GEIST.normal, fontSize: 12, lineHeight: 16 }}>{`${MOIS[fin.getMonth()]} ${fin.getFullYear()}`}</Text>
        </Entree>
        </Animated.View>
        {/* Les jours s'en vont ; la phrase prend leur place, seule. */}
        <Animated.Text style={[PHRASE, { position: 'absolute', left: 0, right: 0, top: 260, fontSize: 30, lineHeight: 36, letterSpacing: -0.7, opacity: capO }]}>
          From today, those evenings are yours again.
        </Animated.Text>
      </View>
    </Animated.View>
  )
}

// ——— 10 · Vethos ———

export function EcranVethos({ ctx }: { ctx: Ctx }) {
  const logo = useRef(new Animated.Value(0)).current
  useEffect(() => lancer(Animated.timing(logo, { toValue: 1, duration: 900, delay: 200, easing: SORTIE, useNativeDriver: true })), [logo])
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', left: 24, right: 24, top: 0, bottom: 130, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 168,
            height: 168,
            opacity: logo,
            transform: [{ scale: ctx.reduit ? 1 : logo.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
          }}
        >
          <Image
            source={require('../../assets/vethos-logo-argent.png')}
            accessibilityLabel="Vethos"
            style={{ width: 168, height: 168 }}
            resizeMode="contain"
          />
        </Animated.View>
        <Entree dl={1100} reduit={ctx.reduit} style={{ marginTop: 24 }}>
          <Text
            style={{
              color: C.t1,
              opacity: 0.94,
              fontFamily: GEIST.moyen,
              fontSize: 19,
              lineHeight: 26,
              textAlign: 'center',
              // Lisible même posé sur la lueur du jour.
              textShadowColor: 'rgba(0,0,0,0.55)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 12,
            }}
          >
            You already know what matters.
          </Text>
        </Entree>
        <Entree dl={1500} reduit={ctx.reduit} style={{ marginTop: 12 }}>
          <Titre style={{ textAlign: 'center' }}>Vethos makes sure your day respects it.</Titre>
        </Entree>
      </View>
      <Entree dl={2100} reduit={ctx.reduit} style={{ position: 'absolute', left: 24, right: 24, bottom: ctx.bas }}>
        <Bouton
          onPress={() => {
            vibrer('light')
            ctx.suivant()
          }}
        >
          Give Vethos one thing
        </Bouton>
      </Entree>
    </View>
  )
}

