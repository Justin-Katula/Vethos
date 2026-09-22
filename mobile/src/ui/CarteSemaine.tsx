import { useMemo } from 'react'
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg'
import type { JourTemps, NatureTemps, SegmentTemps } from '@/plan/lecture'
import { dateLocale } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'
import {
  calculerBornesCarte,
  heuresPaliers,
  positionMinute,
  projectionIntervalle,
} from './carte-semaine'
import { couleurEncreBloc, couleurFondBloc, couleurSegment, couleurTemps, nomsTemps } from './temps-visuel'

const HAUTEUR_ENTETE = 52
const LARGEUR_HEURES = 36

/**
 * La carte temporelle principale de Vethos.
 *
 * Présentée dans une boîte à contour arrondi (box wrapper) agrandie et généreuse.
 * Calée sur les heures d'éveil (du réveil au coucher).
 * Saut d'une heure à la fois (repères toutes les 2 heures).
 */
export function CarteSemaine({
  jours,
  selection,
  surSelection,
  aujourdHui,
  minute,
  lever,
  coucher,
  surChoisirSegment,
}: {
  jours: readonly JourTemps[]
  selection: string
  surSelection: (date: string) => void
  aujourdHui: string
  minute: number
  lever?: string
  coucher?: string
  surChoisirSegment?: (segment: SegmentTemps) => void
}) {
  const j = useJetons()
  const { width } = useWindowDimensions()
  const large = width >= 760

  const { debut, fin, debutHeure, finHeure } = useMemo(
    () => calculerBornesCarte(lever, coucher),
    [lever, coucher],
  )

  const amplitudeHeures = Math.max(1, finHeure - debutHeure)
  // Hauteur généreuse remplissant bien l'espace vertical (~28.5px par heure)
  const hauteurGrille = large ? 480 : Math.max(360, Math.min(500, Math.round(amplitudeHeures * 28.5)))

  const heures = useMemo(
    () => heuresPaliers(debutHeure, finHeure, 1),
    [debutHeure, finHeure],
  )

  const largeurJour = large
    ? Math.max(110, Math.floor((width - 88 - LARGEUR_HEURES) / Math.max(jours.length, 1)))
    : 118
  const largeurCarte = largeurJour * jours.length

  const natures = ['task', 'objective', 'ancre', 'fixed'] as NatureTemps[]

  return (
    <View style={{ marginTop: 14, marginHorizontal: large ? 0 : -12 }}>
      {/* Boîte principale avec contour arrondi élargie jusqu'aux bords */}
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: j.line,
          backgroundColor: j.surface,
          paddingTop: 12,
          paddingBottom: 16,
          paddingLeft: 4,
          paddingRight: 4,
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          {/* Colonne des heures sur le côté gauche */}
          <View style={{ width: LARGEUR_HEURES, paddingTop: HAUTEUR_ENTETE }}>
            <View style={{ height: hauteurGrille }}>
              {heures.map((heure) => (
                <Text
                  key={heure}
                  style={{
                    position: 'absolute',
                    top: positionMinute(heure * 60, debut, fin, hauteurGrille) - 7,
                    right: 8,
                    color: heure % 2 === 0 ? j.text2 : j.text3,
                    opacity: heure % 2 === 0 ? 0.9 : 0.65,
                    fontFamily: MONO.demi,
                    fontSize: 9.5,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {String(heure).padStart(2, '0')}
                </Text>
              ))}
            </View>
          </View>

          {/* Grille des jours défilable horizontalement */}
          <ScrollView
            horizontal
            bounces={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ width: largeurCarte }}
            style={{ flex: 1 }}
          >
            {jours.map((jour) => {
              const date = dateLocale(jour.date)
              const choisi = selection === jour.date
              const maintenant = aujourdHui === jour.date
              // Les segments diurnes actifs (le sommeil est hors cadre)
              const segmentsDiurnes = jour.segments.filter((segment) => segment.nature !== 'sleep')
              const engagements = segmentsDiurnes.length

              return (
                <View
                  key={jour.date}
                  style={{
                    width: largeurJour,
                    backgroundColor: choisi ? j.surface2 : 'transparent',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: choisi ? j.lineForte : 'transparent',
                    borderRightWidth: 1,
                    borderRightColor: choisi ? j.lineForte : j.line,
                    overflow: 'hidden',
                  }}
                >
                  {/* En-tête du jour */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: choisi }}
                    accessibilityLabel={`${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${engagements} engagements`}
                    onPress={() => surSelection(jour.date)}
                    style={({ pressed }) => ({
                      height: HAUTEUR_ENTETE,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      opacity: pressed ? 0.65 : 1,
                    })}
                  >
                    <Text style={{ color: maintenant ? j.text : j.text2, fontFamily: GEIST.moyen, fontSize: 12 }}>
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </Text>
                    <Text
                      style={{
                        color: maintenant ? j.accentEncre : choisi ? j.text : j.text3,
                        fontFamily: MONO.demi,
                        fontSize: 12.5,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {String(date.getDate()).padStart(2, '0')}
                    </Text>
                  </Pressable>

                  {/* Corps de la journée avec repères d'heures et blocs */}
                  <View style={{ height: hauteurGrille, overflow: 'hidden' }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}`}
                      onPress={() => surSelection(jour.date)}
                      style={({ pressed }) => ({ position: 'absolute', inset: 0, opacity: pressed ? 0.76 : 1 })}
                    />
                    {heures.map((heure) => (
                      <View
                        key={heure}
                        style={{
                          position: 'absolute',
                          top: positionMinute(heure * 60, debut, fin, hauteurGrille),
                          left: 0,
                          right: 0,
                          height: 1,
                          backgroundColor: j.line,
                          opacity: heure % 2 === 0 ? 0.42 : 0.22,
                        }}
                      />
                    ))}

                    {segmentsDiurnes.map((segment) => (
                      <BlocCarte
                        key={`${segment.nature}-${segment.id}`}
                        segment={segment}
                        largeur={largeurJour}
                        debutCarte={debut}
                        finCarte={fin}
                        hauteurGrille={hauteurGrille}
                        surPression={surChoisirSegment}
                      />
                    ))}

                    {/* Ligne rouge du moment présent */}
                    {maintenant && minute >= debut && minute <= fin ? (
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          top: positionMinute(minute, debut, fin, hauteurGrille),
                          left: 0,
                          right: 0,
                          height: 1.5,
                          backgroundColor: j.accentEncre,
                          zIndex: 10,
                        }}
                      >
                        <View
                          style={{
                            position: 'absolute',
                            left: -2,
                            top: -2.5,
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: j.accentEncre,
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              )
            })}
          </ScrollView>
        </View>
      </View>

      {/* Légende minimale des natures d'engagements */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: 16,
          rowGap: 8,
          marginTop: 14,
          paddingLeft: LARGEUR_HEURES,
        }}
      >
        {natures
          .filter((nature) =>
            jours.some((jour) => jour.segments.some((segment) => segment.nature === nature)),
          )
          .map((nature) => (
            <View key={nature} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={{ width: 10, height: 3, borderRadius: 1.5, backgroundColor: couleurTemps(nature, j) }} />
              <Text style={{ color: j.text2, fontFamily: GEIST.normal, fontSize: 11 }}>
                {nomsTemps[nature]}
              </Text>
            </View>
          ))}
      </View>
    </View>
  )
}

function BlocCarte({
  segment,
  largeur,
  debutCarte,
  finCarte,
  hauteurGrille,
  surPression,
}: {
  segment: SegmentTemps
  largeur: number
  debutCarte: number
  finCarte: number
  hauteurGrille: number
  surPression?: (segment: SegmentTemps) => void
}) {
  const j = useJetons()
  const proj = projectionIntervalle(segment.debut, segment.fin, debutCarte, finCarte, hauteurGrille)
  if (!proj || proj.height < 2) return null

  const { top, height } = proj
  const couleur = couleurSegment(segment, j)
  const hauteur = Math.max(6, height)
  const afficherTitre = hauteur >= 16
  const afficherHeures = hauteur >= 34 && largeur >= 85

  // Loi E.1 : micro-pause fermant le bloc (hachurée seulement si pauseVisible)
  const dureeTotale = Math.max(1, segment.fin - segment.debut)
  const pauseMinutes = segment.pause ?? 0
  const montrerPause = Boolean(segment.pauseVisible && pauseMinutes > 0)
  const pauseHauteur = montrerPause ? Math.max(4, Math.round(hauteur * (pauseMinutes / dureeTotale))) : 0

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${segment.titre}, ${heureCourte(segment.debut)} to ${heureCourte(segment.fin)}`}
      onPress={() => surPression?.(segment)}
      style={({ pressed }) => ({
        position: 'absolute',
        zIndex: 2,
        top,
        left: 3,
        right: 3,
        height: hauteur,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: j.surface2,
        borderLeftWidth: 3.5,
        borderLeftColor: couleur,
        borderWidth: 1,
        borderColor: j.line,
        paddingHorizontal: afficherTitre ? 6 : 0,
        paddingVertical: afficherTitre ? 3 : 0,
        justifyContent: 'flex-start',
        opacity: pressed ? 0.72 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {afficherTitre ? (
        <Text
          numberOfLines={1}
          style={{
            color: j.text,
            fontFamily: GEIST.demi,
            fontSize: 10.5,
            letterSpacing: -0.2,
          }}
        >
          {segment.titre}
        </Text>
      ) : null}
      {afficherHeures ? (
        <Text
          numberOfLines={1}
          style={{
            marginTop: 1,
            color: j.text3,
            fontFamily: MONO.normal,
            fontSize: 9,
            fontVariant: ['tabular-nums'],
          }}
        >
          {heureCourte(segment.debut)}–{heureCourte(segment.fin)}
        </Text>
      ) : null}

      {/* Repos (Loi E.1) : voile sombre + hachures -45° nettes et propres */}
      {pauseHauteur > 0 ? (
        <View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: pauseHauteur,
              backgroundColor: j.pauseVoile,
              borderTopWidth: 1,
              borderTopColor: j.pauseBordure,
              overflow: 'hidden',
              pointerEvents: 'none',
            },
            Platform.select({
              web: {
                backgroundImage: `repeating-linear-gradient(-45deg, ${j.pauseHachure} 0 2px, transparent 2px 5px)`,
              } as any,
            }),
          ]}
        >
          {Platform.OS !== 'web' ? (
            <Svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <Defs>
                <Pattern
                  id={`pause-hatch-${segment.id}`}
                  width="5"
                  height="5"
                  patternUnits="userSpaceOnUse"
                >
                  <Path
                    d="M-1,1 l2,-2 M0,5 l5,-5 M4,6 l2,-2"
                    stroke={j.pauseHachure}
                    strokeWidth="2"
                    strokeLinecap="square"
                  />
                </Pattern>
              </Defs>
              <Rect width="100%" height="100%" fill={`url(#pause-hatch-${segment.id})`} />
            </Svg>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  )
}

function heureCourte(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}
