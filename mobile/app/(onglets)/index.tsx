import { useMemo } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDonnees } from '@/donnees/magasin'
import { usePlan } from '@/plan/Plan'
import { duree, enHeure, segmentActuel } from '@/plan/lecture'
import { travailDevantToi } from '@/plan/signaux'
import { useJetons } from '@/theme/Theme'
import { PAS } from '@/theme/jetons'
import { Horloge } from '@/ui/Horloge'
import { AgendaJour } from '@/ui/AgendaJour'
import { Faits } from '@/ui/Faits'
import { Mesures } from '@/ui/Mesures'
import { Projection } from '@/ui/Projection'
import { Chevron, Plus } from '@/ui/icones'
import { useLargeur } from '@/ui/largeur'
import { GEIST, MONO } from '@/ui/primitives'

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
  const { fontScale } = useWindowDimensions()
  const large = useLargeur().deuxColonnes
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
    return <View style={{ flex: 1, backgroundColor: j.bg }} accessibilityLabel="Chargement du planning" />
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
      contentContainerStyle={{ paddingTop: marges.top + PAS[5], paddingBottom: PAS[10], paddingHorizontal: PAS[5] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ fontFamily: GEIST.demi, fontSize: 30, letterSpacing: -0.8, color: j.text }}>Aujourd’hui</Text>
          <Text style={{ fontFamily: GEIST.normal, color: j.text2, fontSize: 14 }}>
            {maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter un engagement"
          onPress={() => routeur.push('/engagements')}
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 8, backgroundColor: j.surface2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Plus couleur={j.text} taille={20} />
        </Pressable>
      </View>

      {/* ── LA COMPOSITION ────────────────────────────────────────────────
          Deux colonnes des que l'ecran les permet — l'objet qu'on REGARDE a
          gauche, tout ce qui se LIT a droite — et une seule en dessous.

          C'est la composition du bureau, et son commentaire dit pourquoi :
          centre, le cadran laissait « cinq cents pixels de noir mort de chaque
          cote, la mise en page d'un telephone etiree sur un ecran large ».
          L'inverse gaspille exactement autant : cette meme colonne unique,
          imposee a un iPad ou a un iPhone tourne, laisse la moitie de l'ecran
          vide. Vethos ne choisit donc pas entre les deux — il prend celle que
          la largeur permet. */}
      <View style={large
        ? { flexDirection: 'row', alignItems: 'flex-start', gap: PAS[10], marginTop: PAS[6] }
        : {}}>
      <View style={large ? { width: 400 } : {}}>
      {/* Au centre du cadran : ce qu'il te RESTE, pas l'heure. L'heure, le
          téléphone l'affiche déjà en haut de son propre écran ; la répéter au
          plus grand corps de l'application reviendrait à donner la place
          d'honneur à ce qu'on sait déjà. */}
      <Horloge
        jour={jour}
        minute={minute}
        centre={devant > 0 ? (
          <>
            <Text style={{ fontFamily: GEIST.normal, color: j.accentEncre, fontSize: 44 / Math.max(1, fontScale / 1.3), letterSpacing: -1.4, fontVariant: ['tabular-nums'] }}>
              {duree(devant)}
            </Text>
            <Text style={{ fontFamily: GEIST.moyen, fontSize: 13, color: j.text2 }}>devant toi</Text>
          </>
        ) : (
          <>
            <Text style={{ fontFamily: GEIST.normal, color: j.text2, fontSize: 44 / Math.max(1, fontScale / 1.3), letterSpacing: -1.4, fontVariant: ['tabular-nums'] }}>
              {enHeure(minute)}
            </Text>
            <Text numberOfLines={2} style={{ fontFamily: GEIST.moyen, fontSize: 13, color: j.text3, textAlign: 'center' }}>
              {blocsDuJour.length === 0 ? 'rien au tableau' : 'plus rien avant demain'}
            </Text>
          </>
        )}
      />

      {capacite ? <Mesures capacite={capacite} engage={engage} /> : null}
      </View>

      <View style={large ? { flex: 1, minWidth: 0 } : {}}>
      <View style={{ marginTop: large ? 0 : PAS[6], paddingVertical: PAS[5], borderTopWidth: 1, borderBottomWidth: 1, borderColor: j.line, gap: PAS[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: PAS[2] }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: j.accentEncre }} />
          <Text style={{ fontFamily: GEIST.moyen, fontSize: 12, color: j.text2 }}>
            {actif === actuel ? 'En cours' : actif ? 'À suivre' : 'À ton rythme'}
          </Text>
          {actif ? (
            <Text style={{ marginLeft: 'auto', fontFamily: MONO.normal, fontSize: 12, color: j.text2 }}>
              {enHeure(actif.debut)}–{enHeure(actif.fin)}
            </Text>
          ) : null}
        </View>
        <Text style={{ fontFamily: GEIST.moyen, fontSize: 22, letterSpacing: -0.4, color: j.text }}>
          {actif?.titre ?? (actuel?.nature === 'sleep' ? 'La nuit est à toi.' : 'Du temps pour toi.')}
        </Text>
      </View>

      <Faits resultat={resultat} nomDe={nomDe} />

      {/* Tant que la semaine n'est pas déclarée, le moteur travaille sur une
          journée de 24 h moins le sommeil — c'est-à-dire sur une journée qui
          n'existe pas. Le dire une fois vaut mieux que de laisser croire au
          plan. */}
      {obligations.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => routeur.push('/temps')}
          style={({ pressed }) => ({ marginTop: PAS[6], opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: GEIST.normal, fontSize: 13, lineHeight: 20, color: j.text2 }}>
            L’application ne connaît que tes heures de sommeil.{' '}
            <Text style={{ color: j.text, textDecorationLine: 'underline' }}>
              Déclare tes cours, ton travail et tes trajets
            </Text>{' '}
            une seule fois : tout le reste s’en déduit.
          </Text>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: PAS[8] }}>
        <Text style={{ fontFamily: GEIST.demi, fontSize: 18, color: j.text }}>Ta journée</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => routeur.push('/temps')}
          style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', gap: PAS[2], alignItems: 'center', opacity: pressed ? 0.5 : 1 })}
        >
          <Text style={{ fontFamily: GEIST.moyen, fontSize: 13, color: j.text2 }}>La semaine</Text>
          <Chevron couleur={j.text2} taille={14} />
        </Pressable>
      </View>
      <AgendaJour segments={jour.segments} minute={minute} vide="Aucun engagement aujourd’hui." />

      {ouvertes.length > 0 ? (
        <View style={{ marginTop: PAS[8] }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: j.line, paddingBottom: PAS[2], gap: PAS[1] }}>
            <Text style={{ fontFamily: GEIST.demi, fontSize: 15, color: j.text }}>Mes tâches en cours</Text>
            <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, color: j.text3 }}>
              Le moteur les place tout seul · « +{PAS_DE_TEMPS} min » si le temps prévu ne suffit pas
            </Text>
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
                  accessibilityLabel={`${t.titre}, voir dans les engagements`}
                  onPress={() => routeur.push('/engagements')}
                  style={({ pressed }) => ({ flex: 1, gap: 4, paddingVertical: PAS[1], opacity: pressed ? 0.6 : 1 })}
                >
                  <Text numberOfLines={1} style={{ fontFamily: GEIST.moyen, fontSize: 14.5, color: j.text }}>{t.titre}</Text>
                  <Text style={{ fontFamily: GEIST.normal, fontSize: 11.5, color: verdict?.status === 'unplaced' ? j.alerte : j.text3 }}>
                    {verdict?.status === 'unplaced'
                      ? 'aucune place trouvée cette semaine'
                      : verdict?.status === 'partial'
                        ? `${duree(pose)} placées sur ${duree(t.minutesRestantes + t.minutesSupplementaires)}`
                        : `${duree(pose)} placées cette semaine`}
                    {t.minutesSupplementaires > 0 ? ` · +${duree(t.minutesSupplementaires)} accordées` : ''}
                  </Text>
                </Pressable>
                <Text style={{ fontFamily: MONO.demi, fontSize: 12, color: j.text2, fontVariant: ['tabular-nums'] }}>
                  {t.echeance.slice(8)}/{t.echeance.slice(5, 7)}
                </Text>
                {/* B.5.2 : le seul geste qui touche encore à une tâche. Il ne
                    la termine pas et ne la reporte pas — il reconnaît que
                    l'estimation était courte, ce que personne ne peut savoir
                    avant d'avoir commencé. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Accorder ${PAS_DE_TEMPS} minutes de plus à ${t.titre}`}
                  onPress={() => void ajouterDuTemps(t.id, PAS_DE_TEMPS)}
                  hitSlop={8}
                  style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
                >
                  <Text style={{ fontFamily: MONO.demi, fontSize: 12, color: j.text2 }}>+{PAS_DE_TEMPS}</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ) : null}

      </View>
      </View>

      {/* La derniere section, et la seule qui regarde loin. En haut, elle
          repousserait la journee — or c'est la journee qu'on ouvre
          l'application pour voir. Pleine largeur : c'est ce que le bureau fait
          aussi, sous ses deux colonnes. */}
      <Projection />
    </ScrollView>
  )
}
