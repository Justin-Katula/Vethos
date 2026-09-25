/**
 * L'introduction de Vethos, telle que l'auteur l'a dessinée (`build/Vethos.html`).
 *
 * Trois actes. ÉCOUTER : son prénom, ce qui compte, combien de soirs finissent
 * sans ce qui était prévu, ce qui est repoussé, depuis quand, pour quoi, à
 * quel rythme réel, ce qui l'arrête. LE COÛT : chaque chose sur son calendrier,
 * la pensée qui a tout coûté, l'année qui vient et ce que Vethos en rend.
 * LA PLACE : ce que Vethos prend en charge, sa nature, ses réglages, la
 * protection, la nuit, les heures fixes — puis le vrai moteur le pose, et la
 * vraie semaine apparaît. « Enter Vethos » l'enregistre pour de vrai.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, BackHandler, KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDonnees } from '@/donnees/magasin'
import { useBlocage } from '@/blocage/etat'
import { SelecteurApplications } from '@/blocage/SelecteurApplications'
import { selectionEstVide } from '@/blocage/contrat'
import { FournisseurTheme } from '@/theme/Theme'
import { FondLumiere, type Lueur } from '@/ui/FondLumiere'
import { accentIntro, accentRvbIntro, encreIntro, heureDecimale, jourDe, teinteIntro } from '@/ui/lumiere'
import { dateDans, preparerIntroduction } from './modele-introduction'
import {
  brouillonsDepuis,
  etatInitial,
  indexDe,
  parcours,
  type Ctx,
  type Etape,
  type EtatIntro,
} from './etat-introduction'
import { C, DEPLACEMENT, SORTIE, useReduit, useVers } from './briques-introduction'
import {
  EcranBonjour,
  EcranDetail,
  EcranFreins,
  EcranFrequence,
  EcranNom,
  EcranPriorites,
  EcranRepousse,
} from './ecrans-ecoute'
import { EcranBascule, EcranCout, EcranPensee, EcranVethos } from './ecrans-cout'
import {
  EcranFixes,
  EcranNuit,
  EcranPlace,
  EcranProtection,
  EcranReglage,
  EcranSemaine,
  EcranUne,
  type Placement,
} from './ecrans-place'

/** La lueur de chaque écran : x, y (vers le haut), intensité, étroitesse, dérive, teinte. */
type Mode = 'h' | 'a' | 'n' | 'd'
const SCN: Record<string, [number, number, number, number, number, Mode]> = {
  '1': [0.18, 0.9, 0.9, 2.2, 0.05, 'h'],
  '1b': [0.5, 0.62, 1.1, 3, 0.03, 'h'],
  '2': [0.85, 0.82, 0.8, 2.4, 0.05, 'h'],
  '3': [0.5, 1.02, 0.75, 2.6, 0.04, 'h'],
  '4': [0.12, 0.62, 0.8, 2.4, 0.05, 'h'],
  '5g': [0.82, 0.2, 0.8, 2.6, 0.05, 'h'],
  '5a': [0.88, 0.6, 0.75, 2.6, 0.05, 'h'],
  '5b': [0.12, 0.4, 0.75, 2.6, 0.05, 'h'],
  '5c': [0.5, 0.42, 0.55, 5, 0.02, 'h'],
  '6': [0.5, 0.02, 0.75, 2.6, 0.04, 'h'],
  '7': [0.5, -0.12, 1.05, 2.4, 0.03, 'a'],
  '8': [0.5, 0.54, 0.35, 9, 0.01, 'a'],
  '9': [0.5, 0.18, 1.2, 2.2, 0.02, 'h'],
  '10': [0.5, 0.56, 1.35, 5.5, 0.015, 'h'],
  '11': [0.82, 0.92, 0.8, 2.4, 0.05, 'h'],
  '12a': [0.18, 0.92, 0.8, 2.4, 0.05, 'h'],
  '12b': [0.82, 0.1, 0.8, 2.6, 0.05, 'h'],
  '13': [0.5, 0.5, 0.85, 3.5, 0.03, 'h'],
  '14': [0.5, 0.85, 0.9, 2.4, 0.03, 'n'],
  '15': [0.12, 0.3, 0.8, 2.4, 0.05, 'h'],
  '16': [0, 0, 1, 2.4, 0, 'd'],
  '17': [0.5, 1.05, 1.1, 1.8, 0.03, 'h'],
}
function lueurDe(k: string, H: number): Lueur {
  const g = SCN[k] ?? [0.5, 0.9, 0.8, 2.4, 0.04, 'h']
  let [x, y] = g
  const [, , i, lt, derive, m] = g
  if (m === 'd') {
    const th = (H / 24) * 2 * Math.PI
    x = 0.5 + Math.sin(th) * 0.62
    y = 0.56 + Math.cos(th) * 0.52
  }
  const tc = m === 'a' ? accentRvbIntro(H) : m === 'n' ? teinteIntro(2) : teinteIntro(H)
  const I = i * (m === 'h' || m === 'd' ? 0.35 + 0.65 * jourDe(H) : 1)
  return { x, y, i: I, lt, tc, derive }
}

export function Introduction() {
  return (
    <FournisseurTheme force="sombre">
      <IntroductionSombre />
    </FournisseurTheme>
  )
}

const cle = (st: Etape) => `${st.k}-${st.t ?? 0}`

/** Un écran qui entre de 12 pt à droite, ou sort de 12 pt à gauche, en 530 ms. */
function Scene({ sortant, glisse, reduit, children }: { sortant: boolean; glisse: boolean; reduit: boolean; children: React.ReactNode }) {
  const p = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(p, { toValue: sortant ? 2 : 1, duration: 530, easing: SORTIE, useNativeDriver: true }).start()
  }, [p, sortant])
  const d = reduit || !glisse ? 0 : 12
  return (
    <Animated.View
      pointerEvents={sortant ? 'none' : 'auto'}
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: p.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: [{ translateX: p.interpolate({ inputRange: [0, 1, 2], outputRange: [d, 0, -d] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

function IntroductionSombre() {
  const marges = useSafeAreaInsets()
  const { chargees, reglages, finaliserIntroduction } = useDonnees()
  const reduit = useReduit()
  const [sortie, setSortie] = useState(false)
  const visible = chargees && (!reglages.introductionFaite || sortie)
  const maintenant = useMemo(() => new Date(), [visible]) // eslint-disable-line react-hooks/exhaustive-deps
  const H = heureDecimale(maintenant)
  const acc = accentIntro(H)
  const ink = encreIntro(H)
  const [e, setE] = useState<EtatIntro>(() => etatInitial(reglages.prenom, dateDans(14)))
  const [scenes, setScenes] = useState<{ st: Etape; sortant: boolean }[]>([{ st: { k: '1' }, sortant: false }])
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [selecteur, setSelecteur] = useState(false)
  const [dansApp, setDansApp] = useState(false)
  const fermeture = useRef<((ok: boolean) => void) | null>(null)
  const eRef = useRef(e)
  eRef.current = e
  const monde = useRef(new Animated.Value(1)).current
  const visibleAvant = useRef(false)
  const courant = scenes[scenes.length - 1]!.st

  useEffect(() => {
    if (visible && !visibleAvant.current) {
      setE(etatInitial(useDonnees.getState().reglages.prenom, dateDans(14)))
      setScenes([{ st: { k: '1' }, sortant: false }])
      setPlacement(null)
      setDansApp(false)
      monde.setValue(1)
    }
    visibleAvant.current = visible
  }, [monde, visible])

  const aller = (st: Etape) => {
    if (st.k === '16' || st.k === '17') setPlacement((p) => (st.k === '16' || !p ? placer(eRef.current) : p))
    setScenes((s) => {
      const actuel = s[s.length - 1]!
      if (cle(actuel.st) === cle(st)) return s
      return [{ st: actuel.st, sortant: true }, { st, sortant: false }]
    })
  }
  const suivant = () => {
    const fl = parcours(eRef.current, maintenant)
    const i = indexDe(fl, scenesRef.current[scenesRef.current.length - 1]!.st)
    if (i >= 0 && i < fl.length - 1) aller(fl[i + 1]!)
  }
  const scenesRef = useRef(scenes)
  scenesRef.current = scenes
  // Les écrans sortis disparaissent une fois leur fondu fini.
  useEffect(() => {
    if (!scenes.some((s) => s.sortant)) return
    const t = setTimeout(() => setScenes((s) => s.filter((x) => !x.sortant)), 560)
    return () => clearTimeout(t)
  }, [scenes])

  const retour = () => {
    const fl = parcours(eRef.current, maintenant)
    const i = indexDe(fl, courant)
    // Les écrans qui se jouent seuls ne se rejouent pas à l'envers.
    let j = i - 1
    while (j > 0 && ['1b', '7', '8', '9', '16'].includes(fl[j]!.k)) j--
    if (j >= 0) aller(fl[j]!)
    return true
  }
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return
    const s = BackHandler.addEventListener('hardwareBackPress', retour)
    return () => s.remove()
  })

  function placer(etat: EtatIntro): Placement {
    const { b, autres } = brouillonsDepuis(etat, maintenant, dateDans)
    try {
      const r = preparerIntroduction(useDonnees.getState(), b, maintenant, autres)
      const principal = new Set([...r.ids].filter((id) => id.startsWith(b.id)))
      return { jours: r.jours, principal, crees: r.ids, erreur: '' }
    } catch (cause) {
      return { jours: [], principal: new Set(), crees: new Set(), erreur: cause instanceof Error ? cause.message : 'Check your commitment and fixed hours.' }
    }
  }

  const proteger = async () => {
    const blocage = useBlocage.getState()
    // Hors iPhone (web, Expo Go), Temps d'écran n'existe pas : on montre ce qui se passera.
    if (blocage.simule) return true
    try {
      if (blocage.autorisation !== 'accordee') await blocage.demanderAutorisation()
      if (useBlocage.getState().autorisation !== 'accordee') return false
    } catch {
      return false
    }
    return new Promise<boolean>((resoudre) => {
      fermeture.current = resoudre
      setSelecteur(true)
    })
  }

  const enregistrement = useRef(false)
  const entrer = () => {
    if (enregistrement.current) return
    enregistrement.current = true
    setDansApp(true)
    const { b, autres } = brouillonsDepuis(eRef.current, maintenant, dateDans)
    setTimeout(async () => {
      try {
        const r = preparerIntroduction(useDonnees.getState(), b, new Date(), autres)
        setSortie(true)
        await finaliserIntroduction(r.ajouts, eRef.current.name.trim())
        // Pas de noir entre l'introduction et l'app : la vraie interface apparaît dessous.
        router.replace('/')
        Animated.timing(monde, { toValue: 0, duration: reduit ? 200 : 650, easing: SORTIE, useNativeDriver: true }).start(() => {
          enregistrement.current = false
          setSortie(false)
        })
      } catch (cause) {
        enregistrement.current = false
        setDansApp(false)
        setPlacement({
          jours: [],
          principal: new Set(),
          crees: new Set(),
          erreur: cause instanceof Error ? cause.message : 'Your plan could not be saved. Please try again.',
        })
      }
    }, 900)
  }

  const fl = parcours(e, maintenant)
  const fi = Math.max(0, indexDe(fl, courant))
  const barreX = useVers(fi / Math.max(1, fl.length - 1), 530, DEPLACEMENT)
  const barreO = useVers(['8', '9', '10'].includes(courant.k) || dansApp ? 0 : 1)
  const haut = marges.top + 40
  const bas = Math.max(marges.bottom, 12) + 8
  const lueur = lueurDe(courant.k, H)

  if (!visible) return null
  const ecran = (st: Etape) => {
    const ctx: Ctx = {
      e,
      maj: (f) => {
        // Synchrone : un `suivant()` juste après lit déjà la réponse.
        const n = { ...eRef.current, ...f(eRef.current) }
        eRef.current = n
        setE(n)
      },
      suivant,
      aller,
      etape: st,
      reduit,
      haut,
      bas,
      acc,
      ink,
      maintenant,
    }
    switch (st.k) {
      case '1':
        return <EcranNom ctx={ctx} />
      case '1b':
        return <EcranBonjour ctx={ctx} />
      case '2':
        return <EcranPriorites ctx={ctx} />
      case '3':
        return <EcranFrequence ctx={ctx} />
      case '4':
        return <EcranRepousse ctx={ctx} />
      case '5a':
      case '5b':
      case '5g':
      case '5c':
        return <EcranDetail ctx={ctx} />
      case '6':
        return <EcranFreins ctx={ctx} />
      case '7':
        return <EcranCout ctx={ctx} />
      case '8':
        return <EcranPensee ctx={ctx} />
      case '9':
        return <EcranBascule ctx={ctx} />
      case '10':
        return <EcranVethos ctx={ctx} />
      case '11':
        return <EcranUne ctx={ctx} />
      case '12a':
      case '12b':
        return <EcranReglage ctx={ctx} />
      case '13':
        return <EcranProtection ctx={ctx} proteger={proteger} />
      case '14':
        return <EcranNuit ctx={ctx} />
      case '15':
        return <EcranFixes ctx={ctx} />
      case '16':
        return placement ? <EcranPlace ctx={ctx} placement={placement} /> : null
      case '17':
        return placement ? <EcranSemaine ctx={ctx} placement={placement} entrer={entrer} /> : null
      default:
        return null
    }
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={retour}>
      <StatusBar style="light" />
      <Animated.View style={{ flex: 1, opacity: monde, backgroundColor: C.bg }}>
        <FondLumiere lueur={lueur} reduit={reduit} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 540, alignSelf: 'center' }}>
            {scenes.map((s) => (
              <Scene key={cle(s.st)} sortant={s.sortant} glisse={s.st.k !== '10'} reduit={reduit}>
                {ecran(s.st)}
              </Scene>
            ))}
          </View>
        </KeyboardAvoidingView>
        {/* La progression : un fil sous l'île, rempli à la couleur de l'heure. */}
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          style={{ position: 'absolute', left: 0, right: 0, top: marges.top, height: 2, backgroundColor: C.s1, opacity: barreO }}
        >
          <Animated.View
            style={{
              height: 2,
              width: '100%',
              backgroundColor: acc,
              transformOrigin: 'left',
              transform: [{ scaleX: barreX }],
            }}
          />
        </Animated.View>
      </Animated.View>
      <SelecteurApplications
        ouvert={selecteur}
        surFermeture={() => {
          setSelecteur(false)
          const s = useBlocage.getState().selection
          fermeture.current?.(!!s && !selectionEstVide(s))
          fermeture.current = null
        }}
      />
    </Modal>
  )
}

