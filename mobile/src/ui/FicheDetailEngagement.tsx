import { useMemo } from 'react'
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg'
import { explainBlock } from '@shared/planning/rest'
import type { SegmentTemps } from '@/plan/lecture'
import { duree, enHeure } from '@/plan/lecture'
import { useDonnees } from '@/donnees/magasin'
import { useJetons } from '@/theme/Theme'
import { GEIST, MONO } from './primitives'
import { Croix } from './icones'
import { couleurSegment, couleurTemps, nomsTemps } from './temps-visuel'

export function FicheDetailEngagement({
  segment,
  fermer,
}: {
  segment: SegmentTemps | null
  fermer: () => void
}) {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const donnees = useDonnees()

  const entite = useMemo(() => {
    if (!segment) return null
    if (segment.nature === 'task') {
      const tache = donnees.taches.find((t) => t.id === segment.ref || t.id === segment.id)
      return { type: 'task' as const, data: tache ?? null }
    }
    if (segment.nature === 'objective') {
      const objectif = donnees.objectifs.find((o) => o.id === segment.ref || o.id === segment.id)
      return { type: 'objective' as const, data: objectif ?? null }
    }
    if (segment.nature === 'ancre') {
      const ancre = donnees.ancres.find((a) => a.id === segment.ref || a.id === segment.id)
      return { type: 'ancre' as const, data: ancre ?? null }
    }
    if (segment.nature === 'fixed') {
      const obligation = donnees.obligations.find((o) => o.id === segment.id || o.id === segment.ref)
      return { type: 'fixed' as const, data: obligation ?? null }
    }
    return null
  }, [segment, donnees.ancres, donnees.objectifs, donnees.obligations, donnees.taches])

  const explications = useMemo(() => {
    if (!segment) return []
    if (segment.bloc) {
      return explainBlock(segment.bloc, Boolean(segment.pauseVisible))
    }
    const lines: string[] = []
    if (segment.nature === 'fixed') {
      lines.push('A fixed commitment, chosen once. It never moves from one day to the next.')
    } else if (segment.nature === 'sleep') {
      lines.push('Sleep window: reserved before work is distributed.')
    }
    if (segment.note) lines.push(segment.note)
    return lines
  }, [segment])

  if (!segment) return null

  const couleur = couleurSegment(segment, j)
  const nomNature = nomsTemps[segment.nature] ?? segment.nature
  const tache = entite?.type === 'task' ? entite.data : null

  // Proportion de la pause dans l'indicateur vertical (Loi E.1)
  const dureeTotale = (segment.travail || (segment.fin - segment.debut)) + (segment.pause ?? 0)
  const ratioPause =
    segment.pauseVisible && segment.pause && segment.pause > 0
      ? segment.pause / Math.max(1, dureeTotale)
      : 0

  return (
    <Modal
      visible={Boolean(segment)}
      animationType="fade"
      transparent
      onRequestClose={fermer}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.72)',
          justifyContent: 'flex-end',
        }}
        onPress={fermer}
      >
        <Pressable
          style={{
            backgroundColor: j.surface,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderWidth: 1,
            borderColor: j.line,
            maxHeight: '85%',
            paddingTop: 10,
            paddingBottom: Math.max(24, marges.bottom + 16),
            paddingHorizontal: 20,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Poignée discrète */}
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: j.lineForte,
              alignSelf: 'center',
              marginBottom: 16,
            }}
          />

          {/* En-tête : comme dans WeekCalendar.tsx (desktop) */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            {/* Pilier vertical de couleur avec hatch de repos proportionnel au bas */}
            <View
              style={{
                width: 4.5,
                height: 40,
                borderRadius: 2.5,
                backgroundColor: couleur,
                overflow: 'hidden',
                justifyContent: 'flex-end',
                marginTop: 2,
                flexShrink: 0,
              }}
            >
              {ratioPause > 0 ? (
                <View
                  style={[
                    {
                      width: '100%',
                      height: `${Math.round(ratioPause * 100)}%`,
                      backgroundColor: j.pauseVoile,
                      borderTopWidth: 1,
                      borderTopColor: j.pauseBordure,
                      overflow: 'hidden',
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
                          id="pill-hatch"
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
                      <Rect width="100%" height="100%" fill="url(#pill-hatch)" />
                    </Svg>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: GEIST.demi,
                  fontSize: 18,
                  color: j.text,
                  letterSpacing: -0.3,
                  lineHeight: 22,
                }}
              >
                {segment.titre}
              </Text>
              <Text
                style={{
                  marginTop: 3,
                  fontFamily: MONO.normal,
                  fontSize: 12.5,
                  color: j.text2,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {enHeure(segment.debut)} → {enHeure(segment.fin)}{' '}
                <Text style={{ fontFamily: GEIST.normal, color: j.text3 }}>
                  {nomNature} · {duree(segment.travail || segment.fin - segment.debut)}
                </Text>
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close details"
              onPress={fermer}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: j.surface2,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Croix couleur={j.text2} taille={15} />
            </Pressable>
          </View>

          {/* Explications du moteur — mot pour mot desktop explainBlock */}
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 16, gap: 14 }}
          >
            {explications.length > 0 ? (
              <View style={{ gap: 10 }}>
                {explications.map((line, i) => (
                  <Text
                    key={i}
                    style={{
                      fontFamily: GEIST.normal,
                      fontSize: 13.5,
                      color: j.text2,
                      lineHeight: 20,
                    }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Métadonnées de la tâche si applicable */}
            {tache ? (
              <View
                style={{
                  backgroundColor: j.surface2,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: j.line,
                  padding: 14,
                  gap: 10,
                  marginTop: 6,
                }}
              >
                {tache.intention ? (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: GEIST.moyen, fontSize: 11, color: j.text3 }}>
                      INTENTION
                    </Text>
                    <Text style={{ fontFamily: GEIST.normal, fontSize: 13, color: j.text, lineHeight: 18 }}>
                      {tache.intention}
                    </Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: GEIST.normal, fontSize: 13, color: j.text2 }}>Deadline</Text>
                  <Text style={{ fontFamily: MONO.demi, fontSize: 13, color: j.text }}>
                    {tache.echeance}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: GEIST.normal, fontSize: 13, color: j.text2 }}>Remaining work</Text>
                  <Text style={{ fontFamily: MONO.demi, fontSize: 13, color: j.accentEncre }}>
                    {duree(tache.minutesRestantes)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: GEIST.normal, fontSize: 13, color: j.text2 }}>Initial estimate</Text>
                  <Text style={{ fontFamily: MONO.demi, fontSize: 13, color: j.text3 }}>
                    {duree(tache.minutesEstimees)} (×{tache.facteurCorrection})
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
