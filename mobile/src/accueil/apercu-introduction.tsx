/**
 * Le temps de l'introduction, dessiné avec les composants de l'app elle-même :
 * le cadran 24 h de l'accueil (`Horloge`) reçoit le sommeil, puis le fixe,
 * puis l'engagement qui y cherche sa place ; la semaine finale est la vraie
 * `CarteSemaine` de Mon temps, avec l'agenda du jour choisi.
 *
 * Tout ce qui est placé ici sort du vrai moteur, vide compris.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Horloge } from '@/ui/Horloge'
import { CarteSemaine } from '@/ui/CarteSemaine'
import { AgendaJour } from '@/ui/AgendaJour'
import { couleurTemps } from '@/ui/temps-visuel'
import { GEIST, MONO } from '@/ui/primitives'
import { useJetons } from '@/theme/Theme'
import { cleDate } from '@/plan/moteur'
import { duree, enHeure, type JourTemps, type SegmentTemps } from '@/plan/lecture'
import {
  minuteValide,
  type BrouillonIntroduction,
  type preparerIntroduction,
} from './modele-introduction'
import { DEPLACEMENT, DUREE, encre, SORTIE, toucher } from './experience-introduction'
import { libreDansLaJournee } from './temps-libre'

export { libreDansLaJournee }

export type Apercu = ReturnType<typeof preparerIntroduction>

const maintenantMinute = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** Le sommeil et le fixe tels que l'utilisateur les déclare, avant tout calcul. */
export function journeeDeclaree(b: BrouillonIntroduction): JourTemps {
  const date = cleDate(new Date())
  const segments: SegmentTemps[] = []
  const pousser = (id: string, debut: number, fin: number, nature: 'sleep' | 'fixed', titre: string) =>
    segments.push({ id, date, debut, fin, titre, nature, travail: 0 })
  const coucher = minuteValide(b.coucher)
  const lever = minuteValide(b.lever)
  if (coucher !== null && lever !== null && coucher !== lever) {
    if (coucher > lever) {
      pousser('nuit-matin', 0, lever, 'sleep', 'Sleep')
      pousser('nuit-soir', coucher, 1440, 'sleep', 'Sleep')
    } else pousser('nuit', coucher, lever, 'sleep', 'Sleep')
  }
  for (const activite of ['work', 'school'] as const) {
    if (!b.activites.includes(activite)) continue
    const h = b.fixes[activite]
    const debut = minuteValide(h.debut)
    const fin = minuteValide(h.fin)
    if (debut === null || fin === null || debut === fin || !h.jours.length) continue
    const titre = activite === 'work' ? 'Work' : 'School'
    if (fin > debut) pousser(activite, debut, fin, 'fixed', titre)
    else {
      pousser(activite, debut, 1440, 'fixed', titre)
      pousser(`${activite}-matin`, 0, fin, 'fixed', titre)
    }
  }
  return { date, segments: segments.sort((x, y) => x.debut - y.debut), capacite: 0, travail: 0 }
}

function creneauxLibres(segments: readonly SegmentTemps[]) {
  const pris = segments
    .filter((s) => s.nature === 'sleep' || s.nature === 'fixed')
    .sort((a, b) => a.debut - b.debut)
  const libres: { debut: number; fin: number }[] = []
  let curseur = 0
  for (const p of pris) {
    if (p.debut - curseur >= 45) libres.push({ debut: curseur, fin: p.debut })
    curseur = Math.max(curseur, p.fin)
  }
  if (1440 - curseur >= 45) libres.push({ debut: curseur, fin: 1440 })
  return libres
}

function arc(rayon: number, debut: number, fin: number) {
  const a = (debut * Math.PI) / 180
  const b = (fin * Math.PI) / 180
  return `M ${180 + rayon * Math.cos(a)} ${180 + rayon * Math.sin(a)} A ${rayon} ${rayon} 0 ${fin - debut > 180 ? 1 : 0} 1 ${180 + rayon * Math.cos(b)} ${180 + rayon * Math.sin(b)}`
}

/**
 * Le cadran. Sommeil → activité : il se remplit de ce que l'utilisateur
 * déclare. Construction : l'arc de l'engagement tourne autour, visite des
 * créneaux libres, puis se verrouille dans celui que le moteur a choisi.
 */
export function CadranTemps({
  phase,
  b,
  aperçu,
  reduit,
  surPlace,
}: {
  phase: 'sommeil' | 'activite' | 'construction'
  b: BrouillonIntroduction
  aperçu: Apercu | null
  reduit: boolean
  surPlace: () => void
}) {
  const j = useJetons()
  const { width } = useWindowDimensions()
  const taille = Math.min(336, width - 56)
  const [place, setPlace] = useState(false)
  const premier = useMemo(
    () =>
      aperçu
        ? [...aperçu.blocs].sort(
            (x, y) => x.date.localeCompare(y.date) || x.startMinute - y.startMinute,
          )[0]
        : undefined,
    [aperçu],
  )
  const jourReel = aperçu && premier ? aperçu.jours.find((x) => x.date === premier.date) : undefined
  const jour: JourTemps = useMemo(() => {
    if (phase !== 'construction' || !jourReel) return journeeDeclaree(b)
    if (place) return jourReel
    return {
      ...jourReel,
      segments: jourReel.segments.filter((s) => !(s.ref && aperçu?.ids.has(s.ref))),
    }
  }, [aperçu, b, jourReel, phase, place])
  const libre = libreDansLaJournee(jour)

  // ——— Le placement ———
  const rotation = useRef(new Animated.Value(0)).current
  const presence = useRef(new Animated.Value(0)).current
  const verrou = useRef(new Animated.Value(1)).current
  const fin = useRef(surPlace)
  fin.current = surPlace
  const dureeBloc = premier ? premier.endMinute - premier.startMinute : 90
  useEffect(() => {
    if (phase !== 'construction') {
      setPlace(false)
      presence.setValue(0)
      return
    }
    const cible = premier?.startMinute ?? null
    const libres = creneauxLibres(jour.segments)
    const escales = libres
      .filter((l) => cible === null || cible < l.debut || cible >= l.fin)
      .map((l) => Math.max(l.debut, (l.debut + l.fin) / 2 - dureeBloc / 2))
    const chemin = [escales[0], escales[escales.length - 1]].filter(
      (v, i, t): v is number => v !== undefined && t.indexOf(v) === i,
    )
    const depart = chemin[0] ?? (cible ?? 0) - 180
    rotation.setValue(depart)
    let fini = false
    const terminer = () => {
      if (fini) return
      fini = true
      if (cible !== null) toucher('verrou')
      setPlace(true)
      setTimeout(() => fin.current(), reduit ? 500 : 650)
    }
    if (reduit) {
      rotation.setValue(cible ?? depart)
      const a = Animated.timing(presence, {
        toValue: 1,
        duration: DUREE.reduit,
        useNativeDriver: true,
      })
      a.start(({ finished }) => finished && terminer())
      return () => a.stop()
    }
    const aller = (vers: number) =>
      Animated.timing(rotation, {
        toValue: vers,
        duration: 360,
        easing: DEPLACEMENT,
        useNativeDriver: true,
      })
    const a = Animated.sequence([
      Animated.timing(presence, {
        toValue: 1,
        duration: DUREE.micro,
        easing: SORTIE,
        useNativeDriver: true,
      }),
      ...chemin.slice(1).map(aller),
      ...(cible !== null ? [aller(cible)] : []),
      Animated.timing(verrou, { toValue: 1.07, duration: 110, easing: SORTIE, useNativeDriver: true }),
      Animated.timing(verrou, { toValue: 1, duration: 220, easing: SORTIE, useNativeDriver: true }),
    ])
    a.start(({ finished }) => finished && terminer())
    return () => a.stop()
    // Le chemin se calcule une fois par construction ; `jour` change à la fin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, premier, reduit])

  const centre =
    phase === 'construction' ? (
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text
          numberOfLines={2}
          style={{
            color: encre.text,
            fontFamily: GEIST.demi,
            fontSize: 20,
            textAlign: 'center',
            letterSpacing: -0.4,
          }}
        >
          {b.nom.trim()}
        </Text>
        <Text style={{ color: encre.text2, fontFamily: MONO.normal, fontSize: 14 }}>
          {place && premier
            ? `${new Date(`${premier.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} · ${enHeure(premier.startMinute)} – ${enHeure(premier.endMinute)}`
            : premier
              ? ' '
              : 'No free slot'}
        </Text>
      </View>
    ) : (
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: encre.text,
            fontFamily: GEIST.normal,
            fontSize: 44,
            letterSpacing: -1.5,
            fontVariant: ['tabular-nums'],
          }}
        >
          {duree(libre)}
        </Text>
        <Text style={{ color: encre.text2, fontFamily: GEIST.moyen, fontSize: 14 }}>
          {b.activites.includes('work') && b.activites.includes('school')
            ? 'free on a busy day'
            : b.activites.includes('work')
              ? 'free on a work day'
              : b.activites.includes('school')
                ? 'free on a school day'
                : 'awake, and yours'}
        </Text>
      </View>
    )

  return (
    <View style={{ alignItems: 'center' }}>
      <Horloge jour={jour} minute={maintenantMinute()} centre={centre} />
      {phase === 'construction' && !place ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 12,
            width: taille,
            height: taille,
            opacity: presence,
            transform: [
              {
                rotate: rotation.interpolate({
                  inputRange: [0, 1440],
                  outputRange: ['0deg', '360deg'],
                }),
              },
              { scale: verrou },
            ],
          }}
        >
          <Svg width={taille} height={taille} viewBox="0 0 360 360">
            <Path
              d={arc(135, -90, -90 + (Math.max(20, dureeBloc) / 1440) * 360)}
              stroke={couleurTemps(premier?.kind ?? 'task', j)}
              strokeWidth={22}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
}

/** La vraie semaine de Vethos, puis la journée choisie telle que l'app la lira. */
export function SemaineReelle({
  aperçu,
  b,
  selection,
  choisir,
}: {
  aperçu: Apercu
  b: BrouillonIntroduction
  selection: string
  choisir: (d: string) => void
}) {
  const jour = aperçu.jours.find((x) => x.date === selection)
  const minutes = aperçu.blocs.reduce((s, x) => s + x.workMinutes, 0)
  return (
    <View style={{ gap: 18 }}>
      <CarteSemaine
        jours={aperçu.jours}
        selection={selection}
        surSelection={(d) => {
          toucher()
          choisir(d)
        }}
        aujourdHui={cleDate(new Date())}
        minute={maintenantMinute()}
        lever={b.lever}
        coucher={b.coucher}
      />
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: encre.text, fontFamily: GEIST.demi, fontSize: 17 }}>
            {new Date(`${selection}T12:00:00`).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
          <Text style={{ color: encre.text3, fontFamily: MONO.normal, fontSize: 12 }}>
            {duree(minutes)} this week
          </Text>
        </View>
        <AgendaJour segments={jour?.segments ?? []} vide="Nothing for this commitment that day." />
      </View>
      {!aperçu.blocs.length ? (
        <Text
          accessibilityRole="alert"
          style={{ color: encre.accentEncre, fontFamily: GEIST.normal, fontSize: 14, lineHeight: 20 }}
        >
          Nothing could be placed in the next seven days. It will still be saved if you continue.
        </Text>
      ) : null}
    </View>
  )
}
