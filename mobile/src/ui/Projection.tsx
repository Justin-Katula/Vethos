import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  HORIZON_LABEL,
  HORIZON_WEEKS,
  anchorInsight,
  hoursLabel,
  objectiveMilestone,
  type Horizon,
} from '@shared/projection'
import { useDonnees } from '@/donnees/magasin'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { GEIST, MONO } from './primitives'

/**
 * Projection — la seule partie de Vethos qui regarde loin.
 *
 * Tout le reste de l'application travaille sur sept jours, parce que c'est
 * l'horizon où une décision change quelque chose. Ici on fait l'inverse :
 * quatre heures de piano par semaine ne veulent rien dire, deux cent huit
 * heures sur un an valent un cursus. C'est le même chiffre ; seule l'échelle
 * change, et elle change tout.
 *
 * Le contenu — les paliers, les phrases — vient de `@shared/projection`, pas
 * d'une copie locale : deux Vethos qui ne promettent pas la même chose à la
 * même heure de pratique sont deux produits.
 */

type Pilier = 'objectifs' | 'taches' | 'ancres'

export function Projection() {
  const j = useJetons()
  const routeur = useRouter()
  const { taches, objectifs, ancres } = useDonnees()
  const [horizon, setHorizon] = useState<Horizon>('year')
  const [pilier, setPilier] = useState<Pilier>('objectifs')

  const semaines = HORIZON_WEEKS[horizon]

  const hebdoObjectifs = objectifs.reduce((s, o) => s + o.cibleHebdoMinutes, 0) / 60
  const hebdoAncres = ancres.reduce((s, a) => s + a.dureeMinutes * a.jours.length, 0) / 60

  const regroupements = new Set(taches.map((t) => t.parentId).filter((id): id is string => !!id))
  const ouvertes = taches.filter((t) => !t.terminee && !regroupements.has(t.id))
  const racines = taches.filter((t) => !t.terminee && t.parentId === null)
  const heuresTaches =
    ouvertes.reduce((s, t) => s + t.minutesRestantes + t.minutesSupplementaires, 0) / 60

  return (
    <View
      style={{
        marginTop: PAS[10],
        borderWidth: 1,
        borderColor: j.line,
        borderRadius: RAYON.lg,
        backgroundColor: j.surface,
        padding: PAS[4],
      }}
    >
      <View style={{ borderBottomWidth: 1, borderBottomColor: j.line, paddingBottom: PAS[3], gap: PAS[3] }}>
        <View style={{ gap: 3 }}>
          <Text style={{ fontFamily: GEIST.demi, fontSize: 14.5, color: j.text }}>Projection</Text>
          <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, lineHeight: 17, color: j.text3 }}>
            What the rhythms you declared add up to over time.
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
            borderWidth: 1,
            borderColor: j.line,
            borderRadius: RAYON.md,
            padding: 2,
          }}
        >
          {(['month', 'year'] as const).map((h) => (
            <Pressable
              key={h}
              accessibilityRole="button"
              accessibilityState={{ selected: horizon === h }}
              onPress={() => setHorizon(h)}
              style={{
                paddingHorizontal: PAS[3],
                minHeight: 34,
                justifyContent: 'center',
                borderRadius: RAYON.sm,
                backgroundColor: horizon === h ? j.text : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily: GEIST.moyen,
                  fontSize: 12,
                  color: horizon === h ? j.surface : j.text3,
                }}
              >
                {h === 'month' ? '1 month' : '1 year'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: PAS[2], marginTop: PAS[3] }}>
        <Onglet
          nom="Goals"
          valeur={hoursLabel(hebdoObjectifs * semaines)}
          actif={pilier === 'objectifs'}
          onPress={() => setPilier('objectifs')}
        />
        <Onglet
          nom="Tasks"
          valeur={`${racines.length}`}
          actif={pilier === 'taches'}
          onPress={() => setPilier('taches')}
        />
        <Onglet
          nom="Anchors"
          valeur={hoursLabel(hebdoAncres * semaines)}
          actif={pilier === 'ancres'}
          onPress={() => setPilier('ancres')}
        />
      </View>

      <View style={{ marginTop: PAS[4], gap: PAS[3] }}>
        {pilier === 'objectifs' ? (
          objectifs.length === 0 ? (
            <Vide
              titre="No long-term goal declared"
              texte="A goal has no deadline: it is a steady quota — 4 h of guitar or 5 h of coding a week, say."
              lien="Set my first goal"
              onPress={() => routeur.push('/engagements')}
            />
          ) : (
            <>
              <Total
                valeur={hoursLabel(hebdoObjectifs * semaines)}
                texte={`planned across your goals ${HORIZON_LABEL[horizon]}`}
                cote={`${hoursLabel(hebdoObjectifs)} / week`}
              />
              {objectifs.map((o) => {
                const hebdo = o.cibleHebdoMinutes / 60
                const an = hebdo * 52
                const palier = objectiveMilestone(an)
                return (
                  <Fiche
                    key={o.id}
                    nom={o.nom}
                    valeur={hoursLabel(hebdo * semaines)}
                    titre={palier.title}
                    texte={palier.desc}
                    gauche={`${hoursLabel(hebdo)}/week`}
                    droite={`${hoursLabel(an)} / year`}
                  />
                )
              })}
            </>
          )
        ) : null}

        {pilier === 'taches' ? (
          ouvertes.length === 0 ? (
            <Vide
              titre="Every task is done"
              texte="When a new task is declared, it shows up here with the time left to serve."
              lien="Add a task"
              onPress={() => routeur.push('/engagements')}
            />
          ) : (
            <>
              <Total
                valeur={String(racines.length)}
                texte={`project${racines.length > 1 ? 's' : ''} in progress (${hoursLabel(heuresTaches)} left)`}
                cote="active deadlines"
              />
              <View style={{ borderWidth: 1, borderColor: j.line, borderRadius: RAYON.md, padding: PAS[3], gap: PAS[1] }}>
                <Text style={{ fontFamily: GEIST.moyen, fontSize: 12.5, color: j.text }}>
                  Reading what is left
                </Text>
                <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, lineHeight: 18, color: j.text3 }}>
                  The engine places these minutes on the days where they can fit, after sleep,
                  fixed commitments and rest margins.
                </Text>
              </View>
            </>
          )
        ) : null}

        {pilier === 'ancres' ? (
          ancres.length === 0 ? (
            <Vide
              titre="No ritual anchored yet"
              texte="An anchor is a fixed appointment with yourself that never moves — sport at 6 pm, reading at 9 pm."
              lien="Create an anchor"
              onPress={() => routeur.push('/engagements')}
            />
          ) : (
            <>
              <Total
                valeur={hoursLabel(hebdoAncres * semaines)}
                texte={`planned by your anchors ${HORIZON_LABEL[horizon]}`}
                cote={`${hoursLabel(hebdoAncres)} / week`}
              />
              {ancres.map((a) => {
                const hebdo = (a.dureeMinutes * a.jours.length) / 60
                const an = hebdo * 52
                return (
                  <Fiche
                    key={a.id}
                    nom={a.nom}
                    valeur={hoursLabel(hebdo * semaines)}
                    texte={anchorInsight(a.nom, an)}
                    gauche={`${a.jours.length} d / week · ${a.dureeMinutes} min`}
                    droite={`${hoursLabel(an)} / year`}
                  />
                )
              })}
            </>
          )
        ) : null}
      </View>
    </View>
  )
}

function Onglet({ nom, valeur, actif, onPress }: {
  nom: string
  valeur: string
  actif: boolean
  onPress: () => void
}) {
  const j = useJetons()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={`${nom}, ${valeur}`}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        borderWidth: 1,
        borderColor: actif ? j.lineForte : 'transparent',
        backgroundColor: actif ? j.surface2 : 'transparent',
        borderRadius: RAYON.md,
      }}
    >
      <Text style={{ fontFamily: GEIST.moyen, fontSize: 12, color: actif ? j.text : j.text3 }}>
        {nom}
      </Text>
      <Text
        style={{ fontFamily: MONO.normal, fontSize: 10.5, color: j.text3, fontVariant: ['tabular-nums'] }}
      >
        {valeur}
      </Text>
    </Pressable>
  )
}

function Total({ valeur, texte, cote }: { valeur: string; texte: string; cote: string }) {
  const j = useJetons()
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: j.line,
        borderRadius: RAYON.md,
        backgroundColor: j.surface2,
        paddingHorizontal: PAS[3],
        paddingVertical: PAS[3],
        gap: PAS[1],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: PAS[2] }}>
        <Text
          style={{ fontFamily: MONO.demi, fontSize: 26, color: j.accentEncre, fontVariant: ['tabular-nums'] }}
        >
          {valeur}
        </Text>
        <Text style={{ flex: 1, fontFamily: GEIST.normal, fontSize: 11.5, lineHeight: 17, color: j.text3 }}>
          {texte}
        </Text>
      </View>
      <Text style={{ fontFamily: MONO.normal, fontSize: 11, color: j.text3 }}>{cote}</Text>
    </View>
  )
}

function Fiche({ nom, valeur, titre, texte, gauche, droite }: {
  nom: string
  valeur: string
  titre?: string
  texte: string
  gauche: string
  droite: string
}) {
  const j = useJetons()
  return (
    <View style={{ borderWidth: 1, borderColor: j.line, borderRadius: RAYON.md, padding: PAS[3], gap: PAS[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[2] }}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: GEIST.demi, fontSize: 12.5, color: j.text }}>
          {nom}
        </Text>
        <Text style={{ fontFamily: MONO.demi, fontSize: 12.5, color: j.text, fontVariant: ['tabular-nums'] }}>
          {valeur}
        </Text>
      </View>

      {titre ? (
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 11.5, color: j.text2 }}>{titre}</Text>
      ) : null}
      <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, lineHeight: 18, color: j.text3 }}>
        {texte}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTopWidth: 1,
          borderTopColor: j.line,
          paddingTop: PAS[2],
        }}
      >
        <Text style={{ fontFamily: GEIST.normal, fontSize: 10.5, color: j.text3 }}>{gauche}</Text>
        <Text style={{ fontFamily: MONO.demi, fontSize: 10.5, color: j.text2 }}>{droite}</Text>
      </View>
    </View>
  )
}

function Vide({ titre, texte, lien, onPress }: {
  titre: string
  texte: string
  lien: string
  onPress: () => void
}) {
  const j = useJetons()
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: j.line,
        borderStyle: 'dashed',
        borderRadius: RAYON.md,
        padding: PAS[4],
        alignItems: 'center',
        gap: PAS[2],
      }}
    >
      <Text style={{ fontFamily: GEIST.demi, fontSize: 12.5, color: j.text, textAlign: 'center' }}>
        {titre}
      </Text>
      <Text
        style={{ fontFamily: GEIST.normal, fontSize: 11.5, lineHeight: 18, color: j.text3, textAlign: 'center' }}
      >
        {texte}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => ({
          marginTop: PAS[2],
          minHeight: 40,
          paddingHorizontal: PAS[4],
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: j.lineForte,
          borderRadius: RAYON.md,
          transform: [{ translateY: pressed ? 1 : 0 }],
        })}
      >
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 12.5, color: j.text }}>{lien}</Text>
      </Pressable>
    </View>
  )
}
