import { TOLERANCE_DEPART_MINUTES } from '@shared/planning/habitudes'
import { useState, type ReactNode } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Polygon } from 'react-native-svg'
import { usePlan } from '@/plan/Plan'
import { enHeure } from '@/plan/lecture'
import { A, GEIST, hm, MONO, useLumiere } from '@/ui/app-briques'
import { FondLumiere } from '@/ui/FondLumiere'
import { accentIntro, encreSur } from '@/ui/lumiere'

/**
 * « Je commence » — D.7/D.8.
 *
 * **C'est le bouton le plus important de l'application.** Tout le reste de
 * l'interface se consulte ; celui-ci est le seul qui engage. Il porte donc
 * l'action à pleine force et reste le seul objet de son écran.
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
 * Habillage : `build/Vethos Block Overlay.dc.html` (écran « I'm starting »).
 * L'accent est la couleur de l'heure — la palette de l'introduction — et non
 * le rouge : l'icône, le bouton et le retard la portent, sur la lueur de
 * l'heure.
 */

const NATURE: Record<string, { nom: string; couleur: string }> = {
  task: { nom: 'Task', couleur: '#8d8d8d' },
  objective: { nom: 'Goal', couleur: '#cf1b29' },
  ancre: { nom: 'Anchor', couleur: '#4b6190' },
}

function Discret({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <Text style={{ fontFamily: GEIST.moyen, fontSize: 16, color: A.t3 }}>{children}</Text>
    </Pressable>
  )
}

export function JeCommence() {
  const marges = useSafeAreaInsets()
  const { H, lueur } = useLumiere()
  const { enAttente, minute, confirmer, confiance, reports } = usePlan()
  const [encours, setEncours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [feuille, setFeuille] = useState<Feuille | null>(null)

  // Après le souffle d'une promesse, l'overlay revient tout seul : on reprend.
  const retour = confiance.retourAttendu
  if (!enAttente && !retour) return null

  const bloc = enAttente ?? { kind: 'task', startMinute: retour!.sinceMinute, label: confiance.titreRetour, id: '', promiseId: 'retour' }
  const retard = Math.max(0, minute - bloc.startMinute)
  const enRetard = retard > TOLERANCE_DEPART_MINUTES
  const souffle = enAttente?.promiseId !== undefined && confiance.souffleAvantPossible(enAttente.id)
  // Une ancre se décale de 15 min au plus ; elle ne s'arrête pas.
  const plusTard = enAttente ? confiance.ancreDecalable(enAttente) : 0
  const nature = NATURE[bloc.kind] ?? NATURE.task!
  const acc = accentIntro(H)
  // Les reports, sur un bloc pas encore commencé (jamais pour une ancre).
  const reportable = !!enAttente && (enAttente.kind === 'task' || enAttente.kind === 'objective')
  const plusTardOk = reportable && reports.plusTardPermis(enAttente!)
  const ouvrirPlusTard = () => setFeuille({ sorte: 'tard', options: reports.optionsPlusTard(enAttente!) })
  const ouvrirDemain = () => setFeuille({ sorte: 'demain', apercu: reports.apercuDemain() })

  const valider = async () => {
    setErreur(null)
    setEncours(true)
    try {
      if (!enAttente) {
        await confiance.reprendre()
        return
      }
      const r = await confirmer(enAttente)
      if (!r.ok) setErreur(r.raison)
    } catch {
      setErreur('Couldn’t start. Try again.')
    } finally {
      setEncours(false)
    }
  }

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={() => undefined}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FondLumiere lueur={lueur} />

        <View
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            top: marges.top + 6,
            bottom: marges.bottom + 196,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: 'rgba(242,242,242,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={acc} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <Polygon points="6 3 20 12 6 21 6 3" />
            </Svg>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 28 }}>
            <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: nature.couleur }} />
            <Text style={{ fontFamily: MONO.normal, fontSize: 11, letterSpacing: 0.5, color: A.t3, fontVariant: ['tabular-nums'] }}>
              {enAttente ? `${nature.nom} · planned for ${enHeure(bloc.startMinute)}` : `Back at ${enHeure(bloc.startMinute)}`}
            </Text>
          </View>

          <Text
            style={{
              marginTop: 12,
              fontFamily: GEIST.demi,
              fontSize: 34,
              lineHeight: 40,
              letterSpacing: -0.8,
              color: A.t1,
              textAlign: 'center',
            }}
          >
            {bloc.label}
          </Text>

          <Text
            style={{
              marginTop: 10,
              fontFamily: GEIST.moyen,
              fontSize: 17,
              lineHeight: 22,
              color: enRetard ? acc : A.t2,
              fontVariant: ['tabular-nums'],
            }}
          >
            {enRetard ? `${retard} min late` : 'It’s time'}
          </Text>
        </View>

        <View style={{ position: 'absolute', left: 24, right: 24, bottom: marges.bottom + 10, gap: 6 }}>
          {erreur !== null ? (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
              <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: A.rouge }} />
              <Text style={{ fontFamily: GEIST.normal, fontSize: 13, color: A.rouge }}>{erreur}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Start ${bloc.label}`}
            onPress={() => void valider()}
            disabled={encours}
            style={({ pressed }) => ({
              height: 52,
              borderRadius: 12,
              backgroundColor: acc,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: encours ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Text style={{ fontFamily: GEIST.demi, fontSize: 17, color: encreSur(acc) }}>
              {encours ? 'Starting…' : enAttente ? 'I’m starting' : 'I’m back'}
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 8, minHeight: 48 }}>
            {souffle ? <Discret onPress={() => void confiance.souffle(enAttente!.id)}>I need 15 min</Discret> : null}
            {plusTard > 0 ? <Discret onPress={() => void confiance.decalerAncre(enAttente!)}>{`In ${plusTard} min`}</Discret> : null}
            {plusTardOk ? <Discret onPress={ouvrirPlusTard}>Later</Discret> : null}
            {reportable ? <Discret onPress={ouvrirDemain}>Tomorrow</Discret> : null}
          </View>
        </View>

        {feuille ? (
          <FeuilleReport
            feuille={feuille}
            acc={acc}
            basMarge={marges.bottom}
            fermer={() => setFeuille(null)}
            choisirPlusTard={async (o) => {
              setFeuille(null)
              await reports.choisirPlusTard(enAttente!, o)
            }}
            reporterJournee={async () => {
              setFeuille(null)
              await reports.reporterJournee()
            }}
          />
        ) : null}
      </View>
    </Modal>
  )
}

type OptionVue = { date: string; startMinute: number; demainMinutes: number }
type Feuille =
  | { sorte: 'tard'; options: OptionVue[] }
  | { sorte: 'demain'; apercu: { permis: boolean; possible: boolean; aujourdhuiMinutes: number; demainAvant: number; demainApres: number } }

/**
 * Le choix d'un report, dans la même fenêtre que « Je commence » : iOS ne
 * superpose pas deux fenêtres. Chaque option montre d'abord ce que demain
 * devient — c'est ce chiffre qui doit pousser à finir aujourd'hui.
 */
function FeuilleReport({
  feuille,
  acc,
  basMarge,
  fermer,
  choisirPlusTard,
  reporterJournee,
}: {
  feuille: Feuille
  acc: string
  basMarge: number
  fermer: () => void
  choisirPlusTard: (o: OptionVue) => Promise<void>
  reporterJournee: () => Promise<void>
}) {
  const aujourdhui = new Date()
  const cle = `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, '0')}-${String(aujourdhui.getDate()).padStart(2, '0')}`
  const ligne = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 56, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(242,242,242,0.06)' }
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={fermer} style={{ flex: 1 }} />
      <View style={{ backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 20, paddingBottom: basMarge + 16, gap: 8 }}>
        <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 20, marginBottom: 8 }}>{feuille.sorte === 'tard' ? 'Later' : 'Tomorrow'}</Text>

        {feuille.sorte === 'tard' ? (
          feuille.options.length ? (
            feuille.options.map((o) => (
              <Pressable
                key={`${o.date}-${o.startMinute}`}
                accessibilityRole="button"
                onPress={() => void choisirPlusTard(o)}
                style={({ pressed }) => ({ ...ligne, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 17, fontVariant: ['tabular-nums'] }}>
                  {`${o.date === cle ? 'Today' : 'Tomorrow'} ${enHeure(o.startMinute)}`}
                </Text>
                <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>{`Tomorrow · ${hm(o.demainMinutes)}`}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 15 }}>No free time before the deadline.</Text>
          )
        ) : !feuille.apercu.permis ? (
          <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 15 }}>Already used twice this week.</Text>
        ) : !feuille.apercu.possible ? (
          <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 15 }}>Doesn’t fit before the deadline.</Text>
        ) : (
          <>
            <View style={ligne}>
              <Text style={{ color: A.t2, fontFamily: GEIST.normal, fontSize: 15 }}>Tomorrow</Text>
              <Text style={{ color: A.t1, fontFamily: MONO.normal, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                {`${hm(feuille.apercu.demainAvant)} → `}
                <Text style={{ color: acc }}>{hm(feuille.apercu.demainApres)}</Text>
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => void reporterJournee()}
              style={({ pressed }) => ({ height: 52, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(242,242,242,0.16)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: A.t1, fontFamily: GEIST.demi, fontSize: 17 }}>{`Move ${hm(feuille.apercu.aujourdhuiMinutes)} to tomorrow`}</Text>
            </Pressable>
          </>
        )}

        <Pressable accessibilityRole="button" onPress={fermer} style={({ pressed }) => ({ height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 16 }}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}
