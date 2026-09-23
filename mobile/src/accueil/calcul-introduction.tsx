/**
 * Le calcul, montré comme une image, jamais comme des maths : pour chaque
 * problème, sa frise se remplit — surtout son passé, soir repoussé après soir
 * repoussé, jusqu'à aujourd'hui — et les heures tombent. Puis le suivant
 * démarre seul. À la fin, tout se range en cartes qu'on peut rouvrir.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { GEIST, MONO } from '@/ui/primitives'
import { equivalenceTotale, formatHeures, type Bilan } from './choix-introduction'
import { encre, LENTEUR, morpher, SORTIE, toucher } from './experience-introduction'
import { Compteur } from './recit-introduction'
import { Frise } from './frise-introduction'

const lent = (ms: number) => Math.round(ms * LENTEUR)

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
          <Frise bilans={[courant]} reduit={reduit} surFin={calendrierRempli} />
        </View>
        <View style={{ gap: 8, minHeight: 70 }}>
          {etape >= 1 ? (
            <Apparition reduit={reduit}>
              <Text
                style={{
                  color: encre.text2,
                  fontFamily: GEIST.normal,
                  fontSize: 17,
                  lineHeight: 24,
                }}
              >
                {courant.passe}
              </Text>
            </Apparition>
          ) : null}
          {etape >= 2 ? (
            <Apparition reduit={reduit}>
              <Text
                style={{ color: encre.text, fontFamily: GEIST.demi, fontSize: 18, lineHeight: 25 }}
              >
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
          {bilans.length > 1
            ? 'All together, since you first decided,'
            : 'Since you first decided,'}
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
          style={{
            color: encre.text,
            fontFamily: GEIST.demi,
            fontSize: 24,
            lineHeight: 30,
            letterSpacing: -0.7,
          }}
        >
          hours went to “tomorrow”.
        </Text>
        <Apparition reduit={reduit} delai={lent(1900)}>
          <Text
            style={{
              color: encre.text2,
              fontFamily: GEIST.normal,
              fontSize: 17,
              lineHeight: 24,
              marginTop: 8,
            }}
          >
            {equivalenceTotale(total)}
          </Text>
        </Apparition>
      </View>
      <View style={{ gap: 10 }}>
        {bilans.map((b, k) => (
          <CarteBilan
            key={b.chose.id}
            b={b}
            max={max}
            reduit={reduit}
            delai={lent(2300) + k * lent(250)}
          />
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

function Apparition({
  children,
  reduit,
  delai = 0,
}: {
  children: ReactNode
  reduit: boolean
  delai?: number
}) {
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
        transform: [
          { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [reduit ? 0 : 8, 0] }) },
        ],
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
function CarteBilan({
  b,
  max,
  reduit,
  delai,
}: {
  b: Bilan
  max: number
  reduit: boolean
  delai: number
}) {
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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={{ flex: 1, color: encre.text, fontFamily: GEIST.demi, fontSize: 16 }}>
            {b.chose.bouton}
          </Text>
          <Text style={{ color: encre.accentEncre, fontFamily: MONO.normal, fontSize: 14 }}>
            {formatHeures(b.heuresPerdues)}
          </Text>
        </View>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: encre.surface2,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${part * 100}%`,
              height: 6,
              borderRadius: 3,
              backgroundColor: encre.accent,
            }}
          />
        </View>
        <Text
          style={{ color: encre.text2, fontFamily: GEIST.normal, fontSize: 14, lineHeight: 20 }}
        >
          {b.passe}
        </Text>
        {ouvert ? (
          <View style={{ paddingTop: 6 }}>
            <Frise bilans={[b]} reduit={reduit} anime={false} />
          </View>
        ) : null}
        <Text style={{ color: encre.text, fontFamily: GEIST.moyen, fontSize: 14, lineHeight: 20 }}>
          {b.futur}
        </Text>
      </Pressable>
    </Apparition>
  )
}
