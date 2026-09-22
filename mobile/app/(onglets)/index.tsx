import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { duree, enHeure, segmentActuel } from '@/plan/lecture'
import { travailDevantToi } from '@/plan/signaux'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { Horloge } from '@/ui/Horloge'
import { AgendaJour } from '@/ui/AgendaJour'
import { Faits } from '@/ui/Faits'
import { Mesures } from '@/ui/Mesures'
import { Projection } from '@/ui/Projection'
import { Chevron, Plus } from '@/ui/icones'
import { useLargeur } from '@/ui/largeur'
import { GEIST, MONO } from '@/ui/primitives'
import { ChargementVethos } from '@/ui/MouvementVethos'

/**
 * B.5.2 : le pas de « il m'en faut plus ». Vingt-cinq minutes, comme sur le
 * bureau — assez pour finir quelque chose, trop peu pour reporter la question.
 */
const PAS_DE_TEMPS = 25

/**
 * Aujourd'hui — la même page que sur le bureau.
 *
 * **La même composition aussi, dès qu'il y a la largeur** : le cadran à
 * gauche, tout ce qui se lit à droite. Sous 760 points, la colonne de droite
 * deviendrait une gouttière, et l'ordre vertical reprend alors le travail de
 * la hiérarchie — on regarde d'abord (cadran, mesures), on lit ensuite.
 *
 * Aucun chiffre de cet écran n'est calculé ici. Capacité, repos, retard,
 * déficit, tension, signaux : tout vient du moteur partagé, et cet écran ne
 * fait que choisir où le poser.
 */
export default function Aujourdhui() {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const routeur = useRouter()
  const { width: largeurFenetre, fontScale } = useWindowDimensions()
  const large = useLargeur().deuxColonnes
  const largeurSlide = large ? 400 : Math.max(300, largeurFenetre - PAS[5] * 2)
  const [vueHero, setVueHero] = useState<0 | 1>(0)
  const scrollHeroRef = useRef<ScrollView>(null)

  const changerSlide = (index: 0 | 1) => {
    setVueHero(index)
    scrollHeroRef.current?.scrollTo({ x: index * largeurSlide, animated: true })
  }

  const { resultat, jours, minute, maintenant, aujourdHui, chargees } = usePlan()
  const { taches, objectifs, ancres, obligations, ajouterDuTemps } = useDonnees()

  // Le moteur parle en identifiants ; les phrases ont besoin de noms.
  const nomDe = useMemo(() => {
    const table = new Map<string, string>()
    for (const t of taches) table.set(t.id, t.titre)
    for (const o of objectifs) table.set(o.id, o.nom)
    for (const a of ancres) table.set(a.id, a.nom)
    return (id: string) => table.get(id)
  }, [taches, objectifs, ancres])

  const jour = jours[0]
  if (!jour || !chargees) {
    return <ChargementVethos pleinEcran libelle="Vethos is placing your day." />
  }

  const blocsDuJour = resultat.blocks.filter((b) => b.date === aujourdHui)
  const capacite = resultat.capacities.find((c) => c.date === aujourdHui)
  const devant = travailDevantToi(blocsDuJour, minute)
  const engage = blocsDuJour.reduce((s, b) => s + b.workMinutes, 0)

  const actuel = segmentActuel(jour.segments, minute)
  const suivant = jour.segments.find((s) => s.nature !== 'sleep' && s.debut > minute)
  const actif = actuel && actuel.nature !== 'sleep' ? actuel : suivant

  // B.5 : une tâche découpée n'est plus qu'un regroupement. L'afficher à côté
  // de ses parties ferait compter deux fois le même travail, et proposerait
  // d'ajouter du temps à une coquille vide.
  const regroupements = new Set(taches.map((t) => t.parentId).filter((id): id is string => !!id))
  const ouvertes = taches.filter((t) => !t.terminee && !regroupements.has(t.id))

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: j.bg }}
      contentContainerStyle={{ paddingTop: marges.top + PAS[2], paddingBottom: PAS[10], paddingHorizontal: PAS[5] }}
    >
      {/* ── LA COMPOSITION ────────────────────────────────────────────────
          Deux colonnes des que l'ecran les permet — l'objet qu'on REGARDE a
          gauche, tout ce qui se LIT a droite — et une seule en dessous. */}
      <View style={large
        ? { flexDirection: 'row', alignItems: 'flex-start', gap: PAS[10], marginTop: PAS[2] }
        : {}}>
      <View style={large ? { width: 400 } : { width: '100%', alignItems: 'center' }}>
        {/* Sélecteur de vue : Today vs Projection */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginBottom: PAS[3],
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: vueHero === 0 }}
            accessibilityLabel="Show Today clock"
            onPress={() => changerSlide(0)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: vueHero === 0 ? j.surface2 : 'transparent',
              borderWidth: 1,
              borderColor: vueHero === 0 ? j.lineForte : 'transparent',
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: vueHero === 0 ? j.accentEncre : j.text3,
              }}
            />
            <Text
              style={{
                fontFamily: GEIST.demi,
                fontSize: 12,
                color: vueHero === 0 ? j.text : j.text3,
              }}
            >
              Today
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: vueHero === 1 }}
            accessibilityLabel="Show Projection"
            onPress={() => changerSlide(1)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: vueHero === 1 ? j.surface2 : 'transparent',
              borderWidth: 1,
              borderColor: vueHero === 1 ? j.lineForte : 'transparent',
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: vueHero === 1 ? j.accentEncre : j.text3,
              }}
            />
            <Text
              style={{
                fontFamily: GEIST.demi,
                fontSize: 12,
                color: vueHero === 1 ? j.text : j.text3,
              }}
            >
              Projection
            </Text>
          </Pressable>
        </View>

        {/* Carrousel horizontal : Swipe entre Horloge et Projection */}
        <ScrollView
          ref={scrollHeroRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          onMomentumScrollEnd={(e) => {
            const x = e.nativeEvent.contentOffset.x
            const index = Math.round(x / (largeurSlide || 1))
            if (index === 0 || index === 1) {
              setVueHero(index)
            }
          }}
          style={{ width: largeurSlide }}
          contentContainerStyle={{ width: largeurSlide * 2 }}
        >
          {/* Slide 0 : L'Horloge (Cadran 24h) + Mesures + Action */}
          <View style={{ width: largeurSlide }}>
            <Horloge
              jour={jour}
              minute={minute}
              centre={
                <View style={{ alignItems: 'center', gap: 4 }}>
                  {/* Tag Today / Date */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 9,
                      paddingVertical: 3,
                      borderRadius: 10,
                      backgroundColor: j.surface2,
                      borderWidth: 1,
                      borderColor: j.lineForte,
                    }}
                  >
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: j.accentEncre }} />
                    <Text
                      style={{
                        fontFamily: GEIST.demi,
                        fontSize: 10,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        color: j.text2,
                      }}
                    >
                      Today · {maintenant.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>

                  {/* Heure courante */}
                  <Text
                    style={{
                      fontFamily: GEIST.demi,
                      color: j.text,
                      fontSize: 38 / Math.max(1, fontScale / 1.3),
                      letterSpacing: -1,
                      fontVariant: ['tabular-nums'],
                      lineHeight: 42 / Math.max(1, fontScale / 1.3),
                    }}
                  >
                    {enHeure(minute)}
                  </Text>

                  {/* Statut / travail devant soi */}
                  {devant > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                      <Text
                        style={{
                          fontFamily: MONO.demi,
                          fontSize: 13,
                          color: j.accentEncre,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {duree(devant)}
                      </Text>
                      <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, color: j.text3 }}>
                        ahead
                      </Text>
                    </View>
                  ) : (
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: GEIST.moyen,
                        fontSize: 12,
                        color: j.text3,
                        textAlign: 'center',
                      }}
                    >
                      {blocsDuJour.length === 0 ? 'Free day' : 'All done'}
                    </Text>
                  )}
                </View>
              }
            />

            {capacite ? <Mesures capacite={capacite} engage={engage} /> : null}

            {/* Bouton d'action principal : dans la zone naturelle du pouce (Thumb Zone) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a commitment"
              onPress={() => routeur.push('/engagements')}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: PAS[2],
                backgroundColor: pressed ? j.lineForte : j.surface2,
                borderWidth: 1,
                borderColor: j.lineForte,
                borderBottomWidth: 2,
                borderBottomColor: j.accent,
                borderRadius: RAYON.md,
                paddingVertical: 12,
                paddingHorizontal: PAS[5],
                marginTop: PAS[5],
                alignSelf: 'center',
                width: '100%',
                maxWidth: 320,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Plus couleur={j.accentEncre} taille={16} />
              <Text style={{ fontFamily: GEIST.demi, fontSize: 13.5, color: j.text, letterSpacing: -0.2 }}>
                Add a commitment
              </Text>
            </Pressable>
          </View>

          {/* Slide 1 : La Projection (accessible par swipe ou tap) */}
          <View style={{ width: largeurSlide }}>
            <Projection sansMarge />
          </View>
        </ScrollView>

        {/* Indicateurs de pagination discrets (dots) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: PAS[3],
          }}
        >
          <View
            style={{
              width: vueHero === 0 ? 16 : 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: vueHero === 0 ? j.accentEncre : j.lineForte,
            }}
          />
          <View
            style={{
              width: vueHero === 1 ? 16 : 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: vueHero === 1 ? j.accentEncre : j.lineForte,
            }}
          />
        </View>
      </View>

      <View style={large ? { flex: 1, minWidth: 0 } : {}}>
      <View style={{ marginTop: large ? 0 : PAS[6], paddingVertical: PAS[5], borderTopWidth: 1, borderBottomWidth: 1, borderColor: j.line, gap: PAS[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[2] }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: j.accentEncre }} />
          <Text style={{ fontFamily: GEIST.moyen, fontSize: 12, color: j.text2 }}>
            {actif === actuel ? 'Now' : actif ? 'Up next' : 'Your own pace'}
          </Text>
          {actif ? (
            <Text style={{ marginLeft: 'auto', fontFamily: MONO.normal, fontSize: 12, color: j.text2 }}>
              {enHeure(actif.debut)}–{enHeure(actif.fin)}
            </Text>
          ) : null}
        </View>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 22, letterSpacing: -0.4, color: j.text }}>
          {actif?.titre ?? (actuel?.nature === 'sleep' ? 'The night is yours.' : 'Time that’s yours.')}
        </Text>
      </View>

      <Faits resultat={resultat} nomDe={nomDe} />

      {/* Raccourci vers la déclaration des cours et obligations */}
      {obligations.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Declare your schedule in My time"
          onPress={() => routeur.push('/temps')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: PAS[3],
            marginTop: PAS[5],
            padding: PAS[3] + 2,
            borderRadius: 8,
            backgroundColor: j.surface2,
            borderWidth: 1,
            borderColor: j.lineForte,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: GEIST.demi, fontSize: 13, color: j.text }}>
              Declare your schedule
            </Text>
            <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, color: j.text3 }}>
              Fixed classes, work and commutes in My time
            </Text>
          </View>
          <Chevron couleur={j.text2} taille={14} />
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: PAS[8] }}>
        <Text style={{ fontFamily: GEIST.demi, fontSize: 18, color: j.text }}>Your day</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open week view"
          onPress={() => routeur.push('/temps')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 6,
            backgroundColor: pressed ? j.line : j.surface2,
            borderWidth: 1,
            borderColor: j.lineForte,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Text style={{ fontFamily: GEIST.moyen, fontSize: 12, color: j.text2 }}>The week</Text>
          <Chevron couleur={j.text2} taille={12} />
        </Pressable>
      </View>
      <AgendaJour segments={jour.segments} minute={minute} vide="Nothing committed today." />

      {ouvertes.length > 0 ? (
        <View style={{ marginTop: PAS[8] }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: j.line, paddingBottom: PAS[2] }}>
            <Text style={{ fontFamily: GEIST.demi, fontSize: 15, color: j.text }}>Tasks in progress</Text>
          </View>
          {ouvertes.map((t) => {
            const pose = resultat.blocks
              .filter((b) => b.refId === t.id)
              .reduce((s, b) => s + b.workMinutes, 0)
            const verdict = resultat.verdicts.find((v) => v.taskId === t.id)
            return (
              <View
                key={t.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[3], paddingVertical: PAS[2], borderBottomWidth: 1, borderBottomColor: j.line }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t.titre}, open in commitments`}
                  onPress={() => routeur.push('/engagements')}
                  style={({ pressed }) => ({ flex: 1, gap: 4, paddingVertical: PAS[1], opacity: pressed ? 0.6 : 1 })}
                >
                  <Text numberOfLines={1} style={{ fontFamily: GEIST.moyen, fontSize: 14.5, color: j.text }}>{t.titre}</Text>
                  <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, color: verdict?.status === 'unplaced' ? j.alerte : j.text3 }}>
                    {verdict?.status === 'unplaced'
                      ? 'no room found this week'
                      : verdict?.status === 'partial'
                        ? `${duree(pose)} placed of ${duree(t.minutesRestantes + t.minutesSupplementaires)}`
                        : `${duree(pose)} placed this week`}
                    {t.minutesSupplementaires > 0 ? ` · +${duree(t.minutesSupplementaires)} granted` : ''}
                  </Text>
                </Pressable>
                <Text style={{ fontFamily: MONO.demi, fontSize: 12, color: j.text2, fontVariant: ['tabular-nums'] }}>
                  {t.echeance.slice(8)}/{t.echeance.slice(5, 7)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Grant ${PAS_DE_TEMPS} more minutes to ${t.titre}`}
                  onPress={() => void ajouterDuTemps(t.id, PAS_DE_TEMPS)}
                  hitSlop={4}
                  style={({ pressed }) => ({
                    minHeight: 30,
                    paddingHorizontal: 9,
                    borderRadius: 6,
                    backgroundColor: pressed ? j.lineForte : j.surface2,
                    borderWidth: 1,
                    borderColor: j.lineForte,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  })}
                >
                  <Text style={{ fontFamily: MONO.demi, fontSize: 11.5, color: j.text, fontVariant: ['tabular-nums'] }}>
                    +{PAS_DE_TEMPS}m
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ) : null}

      </View>
      </View>
    </ScrollView>
  )
}
