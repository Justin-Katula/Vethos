import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg'
import { useReduit } from '@/accueil/briques-introduction'
import { SCHEMA_RETOUR } from '@/blocage/bouclier'
import { pontEcran } from '@/blocage/ecran-natif'
import { usePlan } from '@/plan/Plan'
import { A, fmt, GEIST, MONO, useLumiere } from '@/ui/app-briques'
import { FondLumiere } from '@/ui/FondLumiere'
import { accentIntro, encreSur } from '@/ui/lumiere'
import { arc, avancementZoom, etiquette, GRADUATIONS, HAUTEUR, LARGEUR, MINUTES, point, sablier, vue, ZOOM_DEBUT, ZOOM_DUREE } from './cadran-zoom'

/**
 * Le retour du bouclier — l'écran « Shield » de
 * `build/Vethos Block Overlay.dc.html`, là où iOS le permet.
 *
 * Le bouclier d'iOS lui-même n'accepte qu'une image fixe, un titre et deux
 * boutons : aucune animation. Le cadran qui zoome sur la séance vit donc ici,
 * dans Vethos, à l'instant où l'on y revient juste après s'être heurté au
 * bouclier — par « Open Vethos » ou en ouvrant Vethos soi-même.
 */

/** Une tentative plus vieille que ça ne ramène plus le cadran. */
const FRAICHEUR_MS = 3 * 60_000

const COULEUR_GRADUATION = { six: A.t1, heure: A.t3, quart: '#3a3a3a' } as const
const EPAISSEUR_GRADUATION = { six: 2, heure: 1.5, quart: 1 } as const

export function ZoomSeance() {
  const marges = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { H, lueur } = useLumiere()
  const reduit = useReduit()
  const { seanceActive, resultat, minute, enAttente } = usePlan()
  const [ouvert, setOuvert] = useState(false)
  const [z, setZ] = useState(0)
  const dejaVue = useRef(0)

  const actif = seanceActive !== null
  const montrer = useCallback(() => {
    if (actif) setOuvert(true)
  }, [actif])

  // Revenu dans Vethos juste après un bouclier : la dernière tentative est fraîche.
  useEffect(() => {
    const verifier = () => {
      if (!actif) return
      const derniere = Math.max(0, ...pontEcran().lireTentatives())
      if (derniere > dejaVue.current && Date.now() - derniere < FRAICHEUR_MS) {
        dejaVue.current = derniere
        setOuvert(true)
      }
    }
    verifier()
    const s = AppState.addEventListener('change', (e) => e === 'active' && verifier())
    return () => s.remove()
  }, [actif])

  // « Open Vethos » sur le bouclier ouvre `device-activity://`.
  useEffect(() => {
    const viaBouclier = (url: string | null) => !!url && url.startsWith(`${SCHEMA_RETOUR}:`)
    void Linking.getInitialURL().then((u) => viaBouclier(u) && montrer())
    const s = Linking.addEventListener('url', ({ url }) => viaBouclier(url) && montrer())
    return () => s.remove()
  }, [montrer])

  // Le zoom : immobile 650 ms, puis 1,6 s. Reduce Motion : directement serré.
  useEffect(() => {
    if (!ouvert) return
    if (reduit) {
      setZ(1)
      return
    }
    setZ(0)
    const t0 = Date.now()
    let image = 0
    const pas = () => {
      const ms = Date.now() - t0
      setZ(avancementZoom(ms))
      if (ms < ZOOM_DEBUT + ZOOM_DUREE) image = requestAnimationFrame(pas)
    }
    image = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(image)
  }, [ouvert, reduit])

  // La séance s'est finie pendant qu'on regardait : rien à montrer.
  useEffect(() => {
    if (!actif) setOuvert(false)
  }, [actif])

  if (!ouvert || !seanceActive || enAttente) return null

  const debut = seanceActive.startMinute
  const fin = Math.max(seanceActive.endMinute, debut + 1)
  const maintenant = Math.min(Math.max(minute, debut), fin)
  const avancement = (maintenant - debut) / (fin - debut)
  const titre = resultat.blocks.find((b) => b.id === seanceActive.blockId)?.label ?? ''
  const acc = accentIntro(H)
  const v = vue(debut, fin, z)
  const largeur = Math.min(LARGEUR, width - 48)
  const echelle = largeur / LARGEUR
  const [mx, my] = point(maintenant, 168)
  const sable = sablier(avancement)
  const heures = [
    { m: debut, couleur: A.t3 },
    { m: fin, couleur: A.t1 },
  ]

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => setOuvert(false)}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FondLumiere lueur={lueur} reduit={reduit} />

        <View style={{ position: 'absolute', left: 24, right: 24, top: marges.top + 6, bottom: marges.bottom + 130, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={acc} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <Polygon points={sable.haut} fill={acc} fillOpacity={0.85} stroke="none" />
            {sable.filet !== null ? <Line x1={12} y1={12} x2={12} y2={sable.filet} stroke={acc} strokeWidth={0.6} strokeOpacity={0.8} /> : null}
            <Polygon points={sable.bas} fill={acc} fillOpacity={0.85} stroke="none" />
            <Path d="M5 22h14" />
            <Path d="M5 2h14" />
            <Path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
            <Path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
          </Svg>

          <Text style={{ marginTop: 28, color: A.t1, fontFamily: GEIST.demi, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, textAlign: 'center' }}>{titre}</Text>
          <Text style={{ marginTop: 8, color: A.t2, fontFamily: GEIST.normal, fontSize: 16, lineHeight: 22, fontVariant: ['tabular-nums'] }}>{`Until ${fmt(fin % 1440)}`}</Text>

          <View style={{ marginTop: 28, width: largeur, height: HAUTEUR * echelle }}>
            <Svg width={largeur} height={HAUTEUR * echelle} viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}>
              {z > 0
                ? MINUTES.map((t) => <Line key={t.m} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={A.t3} strokeOpacity={0.5 * z} strokeWidth={1} vectorEffect="non-scaling-stroke" />)
                : null}
              {GRADUATIONS.map((t, i) => (
                <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={COULEUR_GRADUATION[t.sorte]} strokeWidth={EPAISSEUR_GRADUATION[t.sorte]} vectorEffect="non-scaling-stroke" />
              ))}
              <Circle cx={200} cy={200} r={168} fill="none" stroke="rgba(242,242,242,0.12)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <Path d={arc(debut, fin, 168)} fill="none" stroke={acc} strokeWidth={3 + 7 * z} vectorEffect="non-scaling-stroke" />
              <Path d={arc(debut, maintenant, 168)} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={3 + 7 * z} vectorEffect="non-scaling-stroke" />
              <Line x1={200} y1={200} x2={mx} y2={my} stroke={A.t3} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <Circle cx={mx} cy={my} r={7 / v.parUnite} fill={acc} stroke="#000" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            </Svg>
            {heures.map(({ m, couleur }) => {
              const e = etiquette(m, v)
              return (
                <Text
                  key={m}
                  style={{ position: 'absolute', left: e.x * echelle - 30, top: e.y * echelle - 8, width: 60, textAlign: 'center', color: couleur, fontFamily: MONO.normal, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] }}
                >
                  {fmt(m % 1440)}
                </Text>
              )
            })}
          </View>
        </View>

        <View style={{ position: 'absolute', left: 24, right: 24, bottom: marges.bottom + 10 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOuvert(false)}
            style={({ pressed }) => ({ height: 52, borderRadius: 12, backgroundColor: acc, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
          >
            <Text style={{ color: encreSur(acc), fontFamily: GEIST.demi, fontSize: 17 }}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
