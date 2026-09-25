/**
 * Les roues de Vethos : une heure, une durée ou un jour se règle au pouce,
 * jamais au clavier. Un cran = une vibration.
 *
 * Écrite ici plutôt qu'empruntée : le paquet essayé ouvrait parfois la roue sur
 * le mauvais cran sur iPhone, puis RENVOYAIT ce cran comme une vraie valeur
 * (un coucher à 00:00, une tâche de 60 h). Ici, rien n'est émis tant que la
 * roue n'est pas posée sur sa valeur de départ, et les heures tournent en
 * boucle : 23 est au-dessus de 00, 01 en dessous.
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  Animated,
  Platform,
  Pressable,
  View,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'

const HAUTEUR = 36
const VISIBLES = 5
/** Copies d'une liste cyclique : assez pour tourner longtemps avant un recentrage invisible. */
const COPIES = 9

const deux = (n: number) => String(n).padStart(2, '0')
function cran() {
  void Haptics.selectionAsync().catch(() => undefined)
}
type ScrollViewRef = { scrollTo: (o: { y: number; animated: boolean }) => void }

/**
 * Une colonne. `index` est contrôlé ; `changer` n'est appelé que lorsqu'une
 * main l'a posée sur un autre cran.
 */
function Colonne({
  libelles,
  index,
  changer,
  cyclique = false,
  largeur,
  etiquette,
  unite,
  alignement = 'center',
  taillePolice = 21,
  mono = false,
}: {
  libelles: string[]
  index: number
  changer: (i: number) => void
  cyclique?: boolean
  largeur?: number
  etiquette: string
  unite?: string
  alignement?: 'center' | 'left' | 'right'
  taillePolice?: number
  mono?: boolean
}) {
  const j = useJetons()
  const L = libelles.length
  const milieu = cyclique ? Math.floor(COPIES / 2) * L : 0
  const rangs = useMemo(
    () => Array.from({ length: cyclique ? L * COPIES : L }, (_, k) => k),
    [L, cyclique],
  )
  const liste = useRef<ScrollViewRef>(null)
  const y = useRef(new Animated.Value((milieu + index) * HAUTEUR)).current
  const pret = useRef(false)
  const courant = useRef(milieu + index)
  const dernierCran = useRef(milieu + index)
  const attente = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emis = useRef(index)
  const changerRef = useRef(changer)
  changerRef.current = changer

  const aller = (rang: number, anime: boolean) => {
    courant.current = rang
    liste.current?.scrollTo({ y: rang * HAUTEUR, animated: anime })
    if (!anime) y.setValue(rang * HAUTEUR)
  }

  // Une valeur venue de l'extérieur — ou un choix refusé par une règle — : la
  // roue s'y replace, par le chemin le plus court. À chaque rendu, exprès.
  useEffect(() => {
    if (emis.current === index) return
    emis.current = index
    const actuel = Math.round(courant.current)
    let cible = milieu + index
    if (cyclique) {
      const base = actuel - (((actuel % L) + L) % L)
      const candidats = [base - L + index, base + index, base + L + index]
      cible = candidats.reduce((a, b) => (Math.abs(b - actuel) < Math.abs(a - actuel) ? b : a))
    }
    aller(cible, pret.current)
  })

  const poser = () => {
    if (!pret.current) return
    const rang = Math.max(0, Math.min(rangs.length - 1, Math.round(courant.current)))
    const valeur = cyclique ? ((rang % L) + L) % L : rang
    // Recentrage invisible quand on approche du bord de la boucle.
    if (cyclique && (rang < L * 2 || rang > L * (COPIES - 2))) aller(milieu + valeur, false)
    else if (Math.abs(courant.current - rang) > 0.02) aller(rang, true)
    if (valeur !== emis.current) {
      emis.current = valeur
      changerRef.current(valeur)
    }
  }
  const poserRef = useRef(poser)
  poserRef.current = poser

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const pos = e.nativeEvent.contentOffset.y / HAUTEUR
          courant.current = pos
          const rang = Math.round(pos)
          if (pret.current && rang !== dernierCran.current) {
            dernierCran.current = rang
            cran()
          }
          // Le web n'a pas de fin d'élan fiable : on pose après un court silence.
          if (attente.current) clearTimeout(attente.current)
          attente.current = setTimeout(() => poserRef.current(), Platform.OS === 'web' ? 140 : 300)
        },
      }),
    [y],
  )
  useEffect(
    () => () => {
      if (attente.current) clearTimeout(attente.current)
    },
    [],
  )

  const valeurLue = libelles[((index % L) + L) % L]
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={etiquette}
      accessibilityValue={{ text: `${valeurLue}${unite ? ` ${unite}` : ''}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e: AccessibilityActionEvent) => {
        const sens = e.nativeEvent.actionName === 'increment' ? 1 : -1
        const suivant = cyclique
          ? (((index + sens) % L) + L) % L
          : Math.max(0, Math.min(L - 1, index + sens))
        if (suivant !== index) {
          cran()
          changerRef.current(suivant)
        }
      }}
      style={{ ...(largeur ? { width: largeur } : { flex: 1 }), height: HAUTEUR * VISIBLES, overflow: 'hidden' }}
    >
      <Animated.ScrollView
        ref={liste as never}
        showsVerticalScrollIndicator={false}
        snapToInterval={HAUTEUR}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: (milieu + index) * HAUTEUR }}
        contentContainerStyle={{ paddingVertical: ((VISIBLES - 1) / 2) * HAUTEUR }}
        onLayout={() => {
          // iOS peut monter la liste décalée : on se pose d'abord, on écoute ensuite.
          aller(courant.current, false)
          setTimeout(() => {
            aller(Math.round(courant.current), false)
            dernierCran.current = Math.round(courant.current)
            pret.current = true
          }, 60)
        }}
        onScroll={onScroll}
        onMomentumScrollEnd={() => poserRef.current()}
      >
        {rangs.map((rang) => {
          const ecart = [rang - 2, rang - 1, rang, rang + 1, rang + 2].map((r) => r * HAUTEUR)
          return (
            <Pressable
              key={rang}
              accessible={false}
              onPress={() => {
                if (Math.round(courant.current) === rang) return
                aller(rang, true)
                setTimeout(() => poserRef.current(), 360)
              }}
              style={{ height: HAUTEUR, justifyContent: 'center' }}
            >
              <Animated.Text
                numberOfLines={1}
                style={{
                  textAlign: alignement,
                  color: j.text,
                  fontFamily: mono ? MONO.normal : GEIST.moyen,
                  fontWeight: '500',
                  fontSize: taillePolice,
                  fontVariant: ['tabular-nums'],
                  opacity: y.interpolate({
                    inputRange: ecart,
                    outputRange: [0.35, 0.67, 1, 0.67, 0.35],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: y.interpolate({
                        inputRange: ecart,
                        outputRange: [0.92, 0.96, 1, 0.96, 0.92],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                }}
              >
                {libelles[rang % L]}
              </Animated.Text>
            </Pressable>
          )
        })}
      </Animated.ScrollView>
    </View>
  )
}

/** La bande de sélection : derrière les chiffres, jamais dessus. */
function Cadre({ children, bande }: { children: React.ReactNode; bande?: string }) {
  const j = useJetons()
  return (
    <View style={{ width: '100%', height: HAUTEUR * VISIBLES, justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: HAUTEUR,
          borderRadius: 8,
          backgroundColor: bande ?? j.surface,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{children}</View>
    </View>
  )
}

function lireHeure(v: string): { h: number; m: number } {
  const r = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  const h = r ? Number(r[1]) : 0
  const m = r ? Number(r[2]) : 0
  return { h: h <= 23 ? h : 0, m: m <= 59 ? m : 0 }
}

/**
 * Une heure de la journée. Les deux colonnes tournent en boucle : 24 h est un
 * cycle, pas une liste qui commence à minuit.
 */
export function RoueHeure({
  valeur,
  changer,
  etiquette,
  pasMinutes = 5,
  bande,
}: {
  valeur: string
  changer: (v: string) => void
  etiquette: string
  pasMinutes?: number
  /** Couleur de la bande de sélection (surface du dessous). */
  bande?: string
  /** Conservé pour compatibilité : les roues ont toujours cinq crans visibles. */
  compact?: boolean
}) {
  const { h, m } = lireHeure(valeur)
  const heures = useMemo(() => Array.from({ length: 24 }, (_, i) => deux(i)), [])
  const minutes = useMemo(
    () => Array.from({ length: Math.floor(60 / pasMinutes) }, (_, i) => deux(i * pasMinutes)),
    [pasMinutes],
  )
  const iMin = Math.round(m / pasMinutes) % minutes.length
  // Les deux colonnes lisent la DERNIÈRE valeur, pas celle du rendu où elles ont été créées.
  const derniere = useRef({ h, iMin })
  derniere.current = { h, iMin }
  return (
    <Cadre bande={bande}>
      <Colonne
        libelles={heures}
        index={h}
        cyclique
        changer={(nh) => changer(`${deux(nh)}:${deux(derniere.current.iMin * pasMinutes)}`)}
        etiquette={`${etiquette}, hours`}
      />
      <Colonne
        libelles={minutes}
        index={iMin}
        cyclique
        changer={(ni) => changer(`${deux(derniere.current.h)}:${deux(ni * pasMinutes)}`)}
        etiquette={`${etiquette}, minutes`}
      />
    </Cadre>
  )
}

/** Une durée : « 8 h » | « 15 min », de `minimum` à `maxHeures` (150 h par défaut). */
export function RoueDuree({
  minutes,
  changer,
  etiquette,
  maxHeures = 150,
  pasMinutes = 15,
  minimum = 0,
  bande,
}: {
  minutes: number
  changer: (v: number) => void
  etiquette: string
  maxHeures?: number
  pasMinutes?: number
  minimum?: number
  bande?: string
  compact?: boolean
}) {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0
  const h = Math.min(maxHeures, Math.floor(total / 60))
  const nbMin = Math.floor(60 / pasMinutes)
  const iMin = Math.round((total % 60) / pasMinutes) % nbMin
  const heures = useMemo(
    () => Array.from({ length: maxHeures + 1 }, (_, i) => `${i} h`),
    [maxHeures],
  )
  const mins = useMemo(
    () => Array.from({ length: nbMin }, (_, i) => `${i * pasMinutes} min`),
    [nbMin, pasMinutes],
  )
  const derniere = useRef({ h, iMin })
  derniere.current = { h, iMin }
  const poser = (nh: number, ni: number) => changer(Math.max(minimum, nh * 60 + ni * pasMinutes))
  return (
    <Cadre bande={bande}>
      <Colonne
        libelles={heures}
        index={h}
        changer={(nh) => poser(nh, derniere.current.iMin)}
        etiquette={`${etiquette}, hours`}
        unite="hours"
      />
      <Colonne
        libelles={mins}
        index={iMin}
        changer={(ni) => poser(derniere.current.h, ni)}
        etiquette={`${etiquette}, minutes`}
        unite="minutes"
      />
    </Cadre>
  )
}

const JOURS_COURTS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MOIS_COURTS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Un jour parmi les prochains : « Wed 30 Sep ». */
export function RoueJour({
  valeur,
  changer,
  jours,
  depuis = 1,
  etiquette,
  bande,
}: {
  valeur: string
  changer: (v: string) => void
  /** Le dernier jour proposé, en jours à partir d'aujourd'hui. */
  jours: number
  depuis?: number
  etiquette: string
  bande?: string
}) {
  const dates = useMemo(() => {
    const aujourdHui = new Date()
    return Array.from({ length: jours - depuis + 1 }, (_, i) => {
      const d = new Date(aujourdHui)
      d.setHours(12, 0, 0, 0)
      d.setDate(d.getDate() + depuis + i)
      const cle = `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
      return { cle, libelle: `${JOURS_COURTS[d.getDay()]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}` }
    })
  }, [depuis, jours])
  const index = Math.max(0, dates.findIndex((d) => d.cle === valeur))
  return (
    <Cadre bande={bande}>
      <Colonne
        libelles={dates.map((d) => d.libelle)}
        index={index}
        changer={(i) => changer(dates[i]!.cle)}
        etiquette={etiquette}
      />
    </Cadre>
  )
}

/** @deprecated Remplacée par `RoueJour` (une date se choisit parmi des jours proches). */
export function RoueDate({
  valeur,
  changer,
  min,
}: {
  valeur: string
  changer: (v: string) => void
  min?: string
  compact?: boolean
}) {
  void min
  return <RoueJour valeur={valeur} changer={changer} jours={365} depuis={0} etiquette="Date" />
}
