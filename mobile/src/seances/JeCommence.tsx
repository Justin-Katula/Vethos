import { TOLERANCE_DEPART_MINUTES } from '@shared/planning/habitudes'
import { useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePlan } from '@/plan/Plan'
import { enHeure } from '@/plan/lecture'
import { useJetons } from '@/theme/Theme'
import { PAS, RAYON } from '@/theme/jetons'
import { Depart } from '@/ui/icones'
import { GEIST, MONO } from '@/ui/primitives'

/**
 * « Je commence » — D.7/D.8.
 *
 * **C'est le bouton le plus important de l'application.** Tout le reste de
 * l'interface se consulte ; celui-ci est le seul qui engage. Il porte donc
 * l'action rouge à pleine force et reste le seul objet de son écran.
 *
 * Il prend tout l'écran, et c'est la friction voulue : la question n'a de sens
 * que si elle interrompt vraiment ce qui se passait avant. Glissé en bandeau
 * discret au-dessus de l'agenda, elle se serait fait balayer du pouce sans
 * qu'on la lise — et le chronomètre serait parti sur une intention que
 * personne n'a eue.
 *
 * Le retard s'affiche EN DIRECT, recalculé depuis l'heure prévue à chaque
 * minute — jamais figé à l'ouverture. C'est la même mesure que D.7 : retard =
 * maintenant − heure prévue, sans fenêtre de grâce.
 *
 * Divergence assumée avec le bureau : là-bas, l'overlay vit dans une fenêtre
 * noire sans cadre, au-dessus de tout le système. Un téléphone n'a pas de
 * fenêtres, et un écran noir forcé en thème clair serait une intrusion visuelle
 * qui n'appartient pas à Vethos. La prise de tout l'écran fait ici le même
 * travail que le noir faisait là-bas.
 */

const NATURE: Record<string, string> = {
  task: 'Task',
  objective: 'Goal',
  ancre: 'Anchor',
}

export function JeCommence() {
  const j = useJetons()
  const marges = useSafeAreaInsets()
  const { enAttente, minute, confirmer } = usePlan()
  const [encours, setEncours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  if (!enAttente) return null

  const retard = Math.max(0, minute - enAttente.startMinute)

  const valider = async () => {
    setErreur(null)
    setEncours(true)
    try {
      const r = await confirmer(enAttente)
      if (!r.ok) setErreur(r.raison)
    } catch {
      setErreur('Could not start. Try again.')
    } finally {
      setEncours(false)
    }
  }

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => undefined}>
      <View
        style={{
          flex: 1,
          backgroundColor: j.bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: PAS[10],
          paddingTop: marges.top,
          paddingBottom: marges.bottom + PAS[6],
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: RAYON.lg,
            borderWidth: 1,
            borderColor: j.lineForte,
            backgroundColor: j.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Depart couleur={j.accentEncre} taille={26} />
        </View>

        <Text
          style={{
            marginTop: PAS[8],
            fontFamily: MONO.normal,
            fontSize: 12.5,
            color: j.text3,
            fontVariant: ['tabular-nums'],
          }}
        >
          {NATURE[enAttente.kind] ?? 'Block'} · planned for {enHeure(enAttente.startMinute)}
        </Text>

        <Text
          style={{
            marginTop: PAS[3],
            fontFamily: GEIST.moyen,
            fontSize: 28,
            lineHeight: 34,
            letterSpacing: -0.6,
            color: j.text,
            textAlign: 'center',
          }}
        >
          {enAttente.label}
        </Text>

        <Text
          style={{
            marginTop: PAS[4],
            fontFamily: GEIST.normal,
            fontSize: 13.5,
            color: retard > TOLERANCE_DEPART_MINUTES ? j.alerte : j.accentEncre,
            fontVariant: ['tabular-nums'],
          }}
        >
          {retard > TOLERANCE_DEPART_MINUTES ? `${retard} min late` : 'It’s time'}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Start ${enAttente.label}`}
          onPress={() => void valider()}
          disabled={encours}
          style={({ pressed }) => ({
            marginTop: PAS[10],
            minWidth: 260,
            minHeight: 56,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: RAYON.md,
            borderWidth: 1,
            borderColor: j.accent,
            backgroundColor: j.accent,
            opacity: encours ? 0.5 : 1,
            transform: [{ translateY: pressed ? 1 : 0 }],
          })}
        >
          <Text style={{ fontFamily: GEIST.demi, fontSize: 16, color: j.accentSur }}>
            {encours ? 'Starting…' : 'I’m starting'}
          </Text>
        </Pressable>

        {erreur !== null ? (
          <Text style={{ marginTop: PAS[5], fontFamily: GEIST.normal, fontSize: 12.5, color: j.alerte }}>
            {erreur}
          </Text>
        ) : null}
      </View>
    </Modal>
  )
}
