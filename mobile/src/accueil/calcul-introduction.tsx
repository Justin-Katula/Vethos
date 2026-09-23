/**
 * Le calcul, montré comme une image, jamais comme des maths : pour chaque
 * problème, ses douze prochains mois s'allument soir par soir, les heures
 * tombent, et le jour où ce sera fini (à son rythme) est entouré. Puis le
 * suivant démarre seul. À la fin, tout se range en cartes qu'on peut rouvrir.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { GEIST, MONO } from '@/ui/primitives'
import { equivalenceTotale, formatHeures, type Bilan } from './choix-introduction'
import { encre, LENTEUR, morpher, SORTIE, toucher } from './experience-introduction'
import { Compteur } from './recit-introduction'

const lent = (ms: number) => Math.round(ms * LENTEUR)
/** L'ordre dans lequel on allume les soirs d'une semaine : étalés, pas collés. */
const ORDRE_SOIRS = [3, 1, 5, 2, 4, 6, 0]

/**
 * Quels soirs de la semaine s'allument. « 2,5 par semaine » = 2 soirs chaque
 * semaine, et un troisième une semaine sur deux.
 */
function soirsPerdus(parSemaine: number) {
  const entiers = Math.min(7, Math.floor(parSemaine))
  return {
    toujours: ORDRE_SOIRS.slice(0, entiers),
    uneSurDeux: parSemaine - entiers >= 0.5 && entiers < 7 ? ORDRE_SOIRS[entiers]! : null,
  }
}

/** Ses douze prochains mois, un mois par ligne. */
export function CalendrierAnnee({
  parSemaine,
  fin,
  reduit,
  anime = true,
  surFin,
}: {
  parSemaine: number
  fin: Date | null
  reduit: boolean
  anime?: boolean
  surFin?: () => void
}) {
  const [largeur, setLargeur] = useState(0)
  const mois = useMemo(() => {
    const aujourdHui = new Date()
    aujourdHui.setHours(12, 0, 0, 0)
    const { toujours, uneSurDeux } = soirsPerdus(parSemaine)
    const cleFin = fin ? fin.toDateString() : ''
    return Array.from({ length: 12 }, (_, m) => {
      const premier = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() + m, 1, 12)
      const nb = new Date(premier.getFullYear(), premier.getMonth() + 1, 0).getDate()
      return {
        nom: premier.toLocaleDateString('en-US', { month: 'short' }),
        jours: Array.from({ length: nb }, (_, d) => {
          const date = new Date(premier.getFullYear(), premier.getMonth(), d + 1, 12)
          const semaine = Math.floor((date.getTime() - aujourdHui.getTime()) / (7 * 86_400_000))
          const avenir = date >= aujourdHui
          const perdu =
            avenir &&
            (!fin || date <= fin) &&
            (toujours.includes(date.getDay()) || (uneSurDeux === date.getDay() && semaine % 2 === 0))
          return { passe: !avenir, perdu, fin: date.toDateString() === cleFin }
        }),
      }
    })
  }, [fin, parSemaine])
  const p = useRef(mois.map(() => new Animated.Value(reduit || !anime ? 1 : 0))).current
  const finRef = useRef(surFin)
  finRef.current = surFin
  useEffect(() => {
    if (!largeur) return
    if (reduit || !anime) {
      finRef.current?.()
      return
    }
    const a = Animated.stagger(
      lent(110),
      p.map((v) => Animated.timing(v, { toValue: 1, duration: lent(240), easing: SORTIE, useNativeDriver: true })),
    )
    a.start(({ finished }) => {
      if (!finished) return
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined)
      finRef.current?.()
    })
    return () => a.stop()
  }, [anime, largeur, p, reduit])
  const etiquette = 32
  const cellule = largeur ? (largeur - etiquette) / 31 : 0
  const point = Math.max(3, cellule - 2.5)
  const perdus = mois.reduce((s, m) => s + m.jours.filter((j) => j.perdu).length, 0)
  return (
    <View
      onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Your next twelve months: ${perdus} evenings lost if nothing changes.${fin ? ` Done on ${fin.toDateString()}.` : ''}`}
      style={{ gap: 3 }}
    >
      {largeur > 0
        ? mois.map((m, r) => (
            <Animated.View
              key={m.nom + r}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: cellule,
                opacity: p[r]!.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] }),
              }}
            >
              <Text style={{ width: etiquette, color: encre.text3, fontFamily: MONO.normal, fontSize: 10 }}>
                {m.nom}
              </Text>
              {m.jours.map((j, d) => (
                <View key={d} style={{ width: cellule, height: cellule, alignItems: 'center', justifyContent: 'center' }}>
                  <View
                    style={{
                      width: point,
                      height: point,
                      borderRadius: point * 0.28,
                      backgroundColor: j.fin
                        ? encre.text
                        : j.perdu
                          ? encre.accentEncre
                          : j.passe
                            ? 'transparent'
                            : encre.surface2,
                    }}
                  />
                </View>
              ))}
            </Animated.View>
          ))
        : null}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 8, marginLeft: etiquette }}>
        <Legende couleur={encre.accentEncre} texte="Lost to “tomorrow”" />
        {fin ? <Legende couleur={encre.text} texte="Done, at your pace" /> : null}
      </View>
    </View>
  )
}

function Legende({ couleur, texte }: { couleur: string; texte: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: couleur }} />
      <Text style={{ color: encre.text3, fontFamily: GEIST.normal, fontSize: 11 }}>{texte}</Text>
    </View>
  )
}

export function CalculEnDirect({
  bilans,
  reduit,
  surFin,
}: {
  bilans: Bilan[]
  reduit: boolean
  surFin: () => void
}) {
  const [i, setI] = useState(reduit ? bilans.length : 0)
  const [etape, setEtape] = useState(0)
  const fin = useRef(surFin)
  fin.current = surFin
  const courant = bilans[i]
  useEffect(() => {
    if (!courant) {
      const t = setTimeout(() => fin.current(), reduit ? 0 : lent(2600))
      return () => clearTimeout(t)
    }
    setEtape(0)
  }, [courant, reduit])
  // Une fois le calendrier rempli : ce qui aurait dû être, où il va — puis le suivant, seul.
  const calendrierRempli = () => {
    const a = setTimeout(() => {
      toucher('leger')
      setEtape(1)
    }, lent(500))
    const b = setTimeout(() => {
      toucher('leger')
      setEtape(2)
    }, lent(1500))
    const c = setTimeout(() => setI((x) => x + 1), lent(1500) + lent(3200))
    minuteurs.current.push(a, b, c)
  }
  const minuteurs = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const liste = minuteurs.current
    return () => liste.forEach(clearTimeout)
  }, [])

  if (courant)
    return (
      <View key={courant.chose.id} style={{ gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 14 }}>
            {bilans.length > 1 ? `${i + 1} of ${bilans.length} · ` : ''}
            {courant.chose.bouton}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Compteur
              cible={courant.heuresPerdues}
              reduit={reduit}
              style={{
                color: encre.accentEncre,
                fontFamily: GEIST.demi,
                fontSize: 64,
                lineHeight: 70,
                letterSpacing: -2.5,
                fontVariant: ['tabular-nums'],
              }}
            />
            <Text style={{ color: encre.text, fontFamily: GEIST.demi, fontSize: 22 }}>hours</Text>
          </View>
          <Text style={{ color: encre.text2, fontFamily: GEIST.moyen, fontSize: 16 }}>
            already lost since you first decided.
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Text style={{ color: encre.text3, fontFamily: GEIST.moyen, fontSize: 13 }}>
            Your next 12 months, if nothing changes.
          </Text>
          <CalendrierAnnee
            parSemaine={courant.parSemaine}
            fin={courant.fin}
            reduit={reduit}
            surFin={calendrierRempli}
          />
        </View>
        <View style={{ gap: 8, minHeight: 70 }}>
          {etape >= 1 ? (
            <Apparition reduit={reduit}>
              <Text style={{ color: encre.text2, fontFamily: GEIST.normal, fontSize: 17, lineHeight: 24 }}>
                {courant.passe}
              </Text>
            </Apparition>
          ) : null}
          {etape >= 2 ? (
            <Apparition reduit={reduit}>
              <Text style={{ color: encre.text, fontFamily: GEIST.demi, fontSize: 18, lineHeight: 25 }}>
                {courant.futur}
              </Text>
            </Apparition>
          ) : null}
        </View>
      </View>
    )

  const total = bilans.reduce((s, b) => s + b.heuresPerdues, 0)
  const max = Math.max(...bilans.map((b) => b.heuresPerdues))
  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: encre.text2, fontFamily: GEIST.moyen, fontSize: 18 }}>
          {bilans.length > 1 ? 'All together, since you first decided,' : 'Since you first decided,'}
        </Text>
        <Compteur
          cible={total}
          reduit={reduit}
          style={{
            color: encre.text,
            fontFamily: GEIST.demi,
            fontSize: 88,
            lineHeight: 96,
            letterSpacing: -3.5,
            fontVariant: ['tabular-nums'],
          }}
        />
        <Text
          style={{ color: encre.text, fontFamily: GEIST.demi, fontSize: 24, lineHeight: 30, letterSpacing: -0.7 }}
        >
          hours went to “tomorrow”.
        </Text>
        <Apparition reduit={reduit} delai={lent(1900)}>
          <Text
            style={{ color: encre.text2, fontFamily: GEIST.normal, fontSize: 17, lineHeight: 24, marginTop: 8 }}
          >
            {equivalenceTotale(total)}
          </Text>
        </Apparition>
      </View>
      <View style={{ gap: 10 }}>
        {bilans.map((b, k) => (
          <CarteBilan key={b.chose.id} b={b} max={max} reduit={reduit} delai={lent(2300) + k * lent(250)} />
        ))}
        <Apparition reduit={reduit} delai={lent(2300) + bilans.length * lent(250)}>
          <Text style={{ color: encre.text3, fontFamily: GEIST.normal, fontSize: 13 }}>
            Tap one to see its year.
          </Text>
        </Apparition>
      </View>
    </View>
  )
}

function Apparition({ children, reduit, delai = 0 }: { children: ReactNode; reduit: boolean; delai?: number }) {
  const p = useRef(new Animated.Value(reduit ? 1 : 0)).current
  useEffect(() => {
    if (reduit) return
    const a = Animated.timing(p, {
      toValue: 1,
      duration: lent(380),
      delay: delai,
      easing: SORTIE,
      useNativeDriver: true,
    })
    a.start()
    return () => a.stop()
  }, [delai, p, reduit])
  return (
    <Animated.View
      style={{
        opacity: p,
        transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [reduit ? 0 : 8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  )
}

/**
 * Un problème, rangé. Fermé : son nom, ses heures, une barre qui compare au
 * plus lourd. Ouvert : son année, allumée.
 */
function CarteBilan({ b, max, reduit, delai }: { b: Bilan; max: number; reduit: boolean; delai: number }) {
  const [ouvert, setOuvert] = useState(false)
  const part = max > 0 ? Math.max(0.06, b.heuresPerdues / max) : 0
  return (
    <Apparition reduit={reduit} delai={delai}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: ouvert }}
        accessibilityLabel={`${b.chose.bouton}, ${formatHeures(b.heuresPerdues)}. ${ouvert ? 'Hide' : 'Show'} its year.`}
        onPress={() => {
          toucher()
          morpher(reduit)
          setOuvert((v) => !v)
        }}
        style={({ pressed }) => ({
          padding: 16,
          gap: 10,
          borderRadius: 16,
          backgroundColor: pressed ? encre.surface2 : encre.surface,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ flex: 1, color: encre.text, fontFamily: GEIST.demi, fontSize: 16 }}>{b.chose.bouton}</Text>
          <Text style={{ color: encre.accentEncre, fontFamily: MONO.normal, fontSize: 14 }}>
            {formatHeures(b.heuresPerdues)}
          </Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: encre.surface2, overflow: 'hidden' }}>
          <View style={{ width: `${part * 100}%`, height: 6, borderRadius: 3, backgroundColor: encre.accent }} />
        </View>
        <Text style={{ color: encre.text2, fontFamily: GEIST.normal, fontSize: 14, lineHeight: 20 }}>{b.passe}</Text>
        {ouvert ? (
          <View style={{ paddingTop: 6 }}>
            <CalendrierAnnee parSemaine={b.parSemaine} fin={b.fin} reduit={reduit} anime={false} />
          </View>
        ) : null}
        <Text style={{ color: encre.text, fontFamily: GEIST.moyen, fontSize: 14, lineHeight: 20 }}>{b.futur}</Text>
      </Pressable>
    </Apparition>
  )
}
