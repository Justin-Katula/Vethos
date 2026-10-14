import { TOLERANCE_DEPART_MINUTES } from '@shared/planning/habitudes'
import { useEffect, useState, type ReactNode } from 'react'
import { Keyboard, Modal, Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Polygon } from 'react-native-svg'
import { usePlan, type ReactionPlusTard } from '@/plan/Plan'
import { RAISONS } from '@shared/planning/arrets'
import { STOP_REASONS, type StopReason } from '@shared/schemas'
import { enHeure } from '@/plan/lecture'
import { A, GEIST, hm, MONO, useLumiere } from '@/ui/app-briques'
import { FondLumiere } from '@/ui/FondLumiere'
import { accentIntro, encreSur } from '@/ui/lumiere'
import { useDemandeReport } from './rappels'

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
  // « Later » touché sur une notification : la question s'ouvre ici.
  const demande = useDemandeReport((e) => e.demande)
  useEffect(() => {
    if (!demande || !enAttente) return
    useDemandeReport.getState().poser(null)
    if (reports.plusTardPermis(enAttente)) setFeuille({ e: 'raison' })
  }, [demande, enAttente, reports])

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
  // « Later » : sur un bloc pas encore commencé, une fois, jamais pour une ancre.
  const plusTardOk = !!enAttente && reports.plusTardPermis(enAttente)

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
            {plusTardOk ? <Discret onPress={() => setFeuille({ e: 'raison' })}>Later</Discret> : null}
          </View>
        </View>

        {feuille && enAttente ? (
          <FeuillePlusTard
            feuille={feuille}
            titre={bloc.label}
            acc={acc}
            basMarge={marges.bottom}
            fermer={() => setFeuille(null)}
            raisonChoisie={async (raison, texte) => {
              const r = await reports.reagir(enAttente, raison, texte)
              setFeuille(r.etape === 'message' ? { e: 'message', texte: r.message } : { e: 'reaction', raison, r })
            }}
            commencer={() => {
              setFeuille(null)
              void valider()
            }}
            choisir={async (raison, o) => {
              setFeuille(null)
              await reports.choisirPlusTard(enAttente, o, raison)
            }}
            reporterJournee={async (raison) => {
              setFeuille(null)
              await reports.reporterJournee(raison)
            }}
          />
        ) : null}
      </View>
    </Modal>
  )
}

type Reaction = Extract<ReactionPlusTard, { etape: 'reaction' }>
type Feuille = { e: 'raison' } | { e: 'reaction'; raison: StopReason; r: Reaction } | { e: 'message'; texte: string }

const ligne = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 52, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(242,242,242,0.08)' }
const corps = { color: A.t1, fontFamily: GEIST.normal, fontSize: 16, lineHeight: 23 } as const
const titreFeuille = { color: A.t1, fontFamily: GEIST.demi, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 } as const

/**
 * « Later » se demande comme un Stop — c'est la loi de Vethos : on ne repousse
 * pas sans dire pourquoi. La raison d'abord (un tap, un mot facultatif), puis
 * la réaction propre à la raison et ses faits, puis les heures choisies selon
 * elle, chacune avec ce que demain devient. « Tomorrow » n'arrive qu'en
 * dernier, et seulement s'il tient. Dans la même fenêtre que « Je commence » :
 * iOS ne superpose pas deux fenêtres.
 */
function FeuillePlusTard({
  feuille,
  titre,
  acc,
  basMarge,
  fermer,
  raisonChoisie,
  commencer,
  choisir,
  reporterJournee,
}: {
  feuille: Feuille
  titre: string
  acc: string
  basMarge: number
  fermer: () => void
  raisonChoisie: (raison: StopReason, texte?: string) => Promise<void>
  commencer: () => void
  choisir: (raison: StopReason, o: Reaction['options'][number]) => Promise<void>
  reporterJournee: (raison: StopReason) => Promise<void>
}) {
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const maintenant = new Date()
  const cle = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`
  const agir = async (f: () => Promise<void>) => {
    if (occupe) return
    setOccupe(true)
    try {
      await f()
    } finally {
      setOccupe(false)
    }
  }
  const quitter = () => {
    Keyboard.dismiss()
    fermer()
  }
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={quitter} style={{ flex: 1 }} />
      <View style={{ backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 20, paddingBottom: basMarge + 16, gap: 8 }}>
        {feuille.e !== 'message' ? (
          <Text accessibilityRole="header" style={{ ...titreFeuille, marginBottom: 4 }}>{`Push ${titre} back?`}</Text>
        ) : null}

        {feuille.e === 'raison' ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {STOP_REASONS.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  disabled={occupe}
                  onPress={() => {
                    Keyboard.dismiss()
                    void agir(() => raisonChoisie(r, texte.trim() || undefined))
                  }}
                  style={({ pressed }) => ({ ...ligne, width: '48.5%', opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{RAISONS[r].libelle}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={texte}
              onChangeText={(v) => setTexte(v.slice(0, 500))}
              placeholder="Anything else? (optional)"
              placeholderTextColor={A.t4}
              accessibilityLabel="Anything else"
              selectionColor={A.t1}
              style={{ marginTop: 4, height: 44, borderRadius: 8, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 14, color: A.t1, fontFamily: GEIST.normal, fontSize: 15 }}
            />
          </>
        ) : null}

        {feuille.e === 'reaction' ? (
          <>
            {feuille.r.lignes.map((l) => (
              <Text key={l} accessibilityLiveRegion="polite" style={corps}>{l}</Text>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={commencer}
              style={({ pressed }) => ({ height: 52, marginTop: 4, borderRadius: 12, backgroundColor: acc, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <Text style={{ color: encreSur(acc), fontFamily: GEIST.demi, fontSize: 17 }}>I’m starting</Text>
            </Pressable>
            {feuille.r.options.map((o) => (
              <Pressable
                key={`${o.date}-${o.startMinute}`}
                accessibilityRole="button"
                disabled={occupe}
                onPress={() => void agir(() => choisir(feuille.raison, o))}
                style={({ pressed }) => ({ ...ligne, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                  {`${o.date === cle ? 'Today' : 'Tomorrow'} ${enHeure(o.startMinute)}`}
                </Text>
                <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>{`Tomorrow · ${hm(o.demainMinutes)}`}</Text>
              </Pressable>
            ))}
            {feuille.r.journee ? (
              <Pressable
                accessibilityRole="button"
                disabled={occupe}
                onPress={() => void agir(() => reporterJournee(feuille.raison))}
                style={({ pressed }) => ({ ...ligne, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 15 }}>{`All of today · ${hm(feuille.r.journee.aujourdhuiMinutes)}`}</Text>
                <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                  {`Tomorrow · ${hm(feuille.r.journee.demainAvant)} → `}
                  <Text style={{ color: acc }}>{hm(feuille.r.journee.demainApres)}</Text>
                </Text>
              </Pressable>
            ) : null}
            {!feuille.r.options.length && !feuille.r.journee ? (
              <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 15 }}>No free time before the deadline.</Text>
            ) : null}
          </>
        ) : null}

        {feuille.e === 'message' ? <Text accessibilityLiveRegion="polite" style={corps}>{feuille.texte}</Text> : null}

        <Pressable accessibilityRole="button" onPress={quitter} style={({ pressed }) => ({ height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 16 }}>{feuille.e === 'message' ? 'OK' : 'Cancel'}</Text>
        </Pressable>
      </View>
    </View>
  )
}
