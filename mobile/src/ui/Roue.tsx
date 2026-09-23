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
  Text,
  View,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'

const HAUTEUR = 44
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
  taillePolice = 24,
  mono = true,
}: {
  libelles: string[]
  index: number
  changer: (i: number) => void
  cyclique?: boolean
  largeur: number
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
      style={{ width: largeur, height: HAUTEUR * VISIBLES, overflow: 'hidden' }}
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
                  fontSize: taillePolice,
                  fontVariant: ['tabular-nums'],
                  opacity: y.interpolate({
                    inputRange: ecart,
                    outputRange: [0.14, 0.38, 1, 0.38, 0.14],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    { perspective: 600 },
                    {
                      rotateX: y.interpolate({
                        inputRange: ecart,
                        outputRange: ['52deg', '26deg', '0deg', '-26deg', '-52deg'],
                        extrapolate: 'clamp',
                      }),
                    },
                    {
                      scale: y.interpolate({
                        inputRange: ecart,
                        outputRange: [0.84, 0.92, 1, 0.92, 0.84],
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
function Cadre({ children }: { children: React.ReactNode }) {
  const j = useJetons()
  return (
    <View style={{ height: HAUTEUR * VISIBLES, justifyContent: 'center', alignItems: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: HAUTEUR,
          borderRadius: 12,
          backgroundColor: j.surface2,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>{children}</View>
    </View>
  )
}

function Unite({ texte }: { texte: string }) {
  const j = useJetons()
  return (
    <Text style={{ width: 40, color: j.text3, fontFamily: GEIST.moyen, fontSize: 15, paddingLeft: 6 }}>
      {texte}
    </Text>
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
}: {
  valeur: string
  changer: (v: string) => void
  etiquette: string
  pasMinutes?: number
  /** Conservé pour compatibilité : les roues ont toujours cinq crans visibles. */
  compact?: boolean
}) {
  const j = useJetons()
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
    <Cadre>
      <Colonne
        libelles={heures}
        index={h}
        cyclique
        changer={(nh) => changer(`${deux(nh)}:${deux(derniere.current.iMin * pasMinutes)}`)}
        largeur={58}
        etiquette={`${etiquette}, hours`}
        alignement="right"
      />
      <Text
        style={{ color: j.text3, fontFamily: MONO.normal, fontSize: 22, width: 20, textAlign: 'center' }}
      >
        :
      </Text>
      <Colonne
        libelles={minutes}
        index={iMin}
        cyclique
        changer={(ni) => changer(`${deux(derniere.current.h)}:${deux(ni * pasMinutes)}`)}
        largeur={58}
        etiquette={`${etiquette}, minutes`}
        alignement="left"
      />
    </Cadre>
  )
}

/** Une durée : heures | minutes, de `minimum` à `maxHeures` (150 h par défaut). */
export function RoueDuree({
  minutes,
  changer,
  etiquette,
  maxHeures = 150,
  pasMinutes = 5,
  minimum = 0,
}: {
  minutes: number
  changer: (v: number) => void
  etiquette: string
  maxHeures?: number
  pasMinutes?: number
  minimum?: number
  compact?: boolean
}) {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0
  const h = Math.min(maxHeures, Math.floor(total / 60))
  const nbMin = Math.floor(60 / pasMinutes)
  const iMin = Math.round((total % 60) / pasMinutes) % nbMin
  const heures = useMemo(
    () => Array.from({ length: maxHeures + 1 }, (_, i) => String(i)),
    [maxHeures],
  )
  const mins = useMemo(
    () => Array.from({ length: nbMin }, (_, i) => deux(i * pasMinutes)),
    [nbMin, pasMinutes],
  )
  const derniere = useRef({ h, iMin })
  derniere.current = { h, iMin }
  const poser = (nh: number, ni: number) => changer(Math.max(minimum, nh * 60 + ni * pasMinutes))
  return (
    <Cadre>
      <Colonne
        libelles={heures}
        index={h}
        changer={(nh) => poser(nh, derniere.current.iMin)}
        largeur={64}
        etiquette={`${etiquette}, hours`}
        unite="hours"
        alignement="right"
      />
      <Unite texte="h" />
      <Colonne
        libelles={mins}
        index={iMin}
        cyclique
        changer={(ni) => poser(derniere.current.h, ni)}
        largeur={50}
        etiquette={`${etiquette}, minutes`}
        unite="minutes"
        alignement="right"
      />
      <Unite texte="min" />
    </Cadre>
  )
}

/** Un jour parmi les prochains, écrit en toutes lettres. */
export function RoueJour({
  valeur,
  changer,
  jours,
  depuis = 1,
  etiquette,
}: {
  valeur: string
  changer: (v: string) => void
  /** Le dernier jour proposé, en jours à partir d'aujourd'hui. */
  jours: number
  depuis?: number
  etiquette: string
}) {
  const dates = useMemo(() => {
    const aujourdHui = new Date()
    return Array.from({ length: jours - depuis + 1 }, (_, i) => {
      const d = new Date(aujourdHui)
      d.setHours(12, 0, 0, 0)
      d.setDate(d.getDate() + depuis + i)
      const cle = `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
      const jour = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      return { cle, libelle: depuis + i === 1 ? `Tomorrow · ${jour}` : jour }
    })
  }, [depuis, jours])
  const index = Math.max(0, dates.findIndex((d) => d.cle === valeur))
  return (
    <Cadre>
      <Colonne
        libelles={dates.map((d) => d.libelle)}
        index={index}
        changer={(i) => changer(dates[i]!.cle)}
        largeur={260}
        etiquette={etiquette}
        taillePolice={20}
        mono={false}
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
