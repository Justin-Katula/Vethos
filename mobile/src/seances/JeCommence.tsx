import { TOLERANCE_DEPART_MINUTES } from '@shared/planning/habitudes'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Keyboard, Modal, Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Polygon } from 'react-native-svg'
import { usePlan, type ReactionPlusTard } from '@/plan/Plan'
import { RAISONS } from '@shared/planning/arrets'
import { STOP_REASONS, type StopReason } from '@shared/schemas'
import { enHeure } from '@/plan/lecture'
import { A, fmt, GEIST, hm, MONO, useHauteurClavier, useLumiere } from '@/ui/app-briques'
import { FondLumiere } from '@/ui/FondLumiere'
import { accentIntro, encreSur } from '@/ui/lumiere'
import { annoncer, useDemandeReport } from './rappels'
import { Juge } from './Juge'
import { texteSuffisant } from '@shared/planning/report'

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
  const { enAttente: enAttenteDuPlan, minute, confirmer, confiance, reports } = usePlan()
  const [encours, setEncours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [feuille, setFeuille] = useState<Feuille | null>(null)
  // Une conversation est ouverte (raison, juge, heures) : la séance reste à
  // l'écran même si le recalcul de la minute la retire du plan — sinon la
  // fenêtre se fermait en pleine discussion, et la proposition ne se voyait
  // jamais (vu le 2026-10-23 à 23 h 01, trop près du coucher).
  const gele = useRef(enAttenteDuPlan)
  if (enAttenteDuPlan && (!feuille || !gele.current || gele.current.id === enAttenteDuPlan.id)) gele.current = enAttenteDuPlan
  const enAttente = enAttenteDuPlan ?? (feuille ? gele.current : null)
  // Un bouton touché sur une notification.
  const demande = useDemandeReport((e) => e.demande)
  useEffect(() => {
    if (!demande) return
    if (demande.type === 'tard') {
      if (!enAttente) return
      useDemandeReport.getState().poser(null)
      // « Later » : la justification s'ouvre ici.
      if (reports.plusTardPermis(enAttente)) setFeuille({ e: 'raison' })
      return
    }
    // « I'm starting » : la même chose que le bouton de l'écran, à l'instant du
    // toucher. Le plan peut être encore en train de charger : on attend un peu.
    if (Date.now() - demande.a > 30 * 60_000) return void useDemandeReport.getState().poser(null)
    if (!enAttente) return
    useDemandeReport.getState().poser(null)
    if (enAttente.id !== demande.blocId) return
    const b = enAttente
    void (async () => {
      const r = await confirmer(b, new Date(demande.a))
      const debut = new Date(demande.a)
      const fin = debut.getHours() * 60 + debut.getMinutes() + (b.endMinute - b.startMinute)
      // Dit tout de suite, pour qu'on ne croie jamais avoir commencé quand ce n'est pas le cas.
      await annoncer(b.label, r.ok ? `Started · until ${fmt(Math.min(1439, fin))}` : 'Couldn’t start. Open Vethos.')
    })()
  }, [demande, enAttente, reports, confirmer])

  // Après le souffle d'une promesse, l'overlay revient tout seul : on reprend.
  const retour = confiance.retourAttendu
  // Une ancre démarre toute seule : rien à confirmer.
  if (enAttente?.kind === 'ancre') return null
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
            bloc={enAttente}
            changer={setFeuille}
            titre={bloc.label}
            acc={acc}
            basMarge={marges.bottom}
            fermer={() => setFeuille(null)}
            onAide={(message) => setFeuille({ e: 'message', texte: message })}
            raisonChoisie={async (raison, texte, reponseMs, propose) => {
              const r = await reports.reagir(enAttente, raison, texte)
              setFeuille(r.etape === 'message' ? { e: 'message', texte: r.message } : { e: 'reaction', raison, texte: texte ?? '', reponseMs, r, ...(propose ? { propose } : {}) })
            }}
            commencer={async (dix) => {
              const f = feuille
              setFeuille(null)
              await valider()
              // « Ennuyeux » : 10 minutes, puis la question revient — comme pour un Stop.
              if (dix && f?.e === 'reaction') await reports.dixMinutes(f.raison, f.texte || undefined)
            }}
            choisir={async (f, o) => {
              setFeuille(null)
              await reports.choisirPlusTard(enAttente, o, f.raison, f.texte, f.reponseMs)
            }}
            reporterJournee={async (f) => {
              setFeuille(null)
              await reports.reporterJournee(enAttente, f.raison, f.texte, f.reponseMs)
            }}
          />
        ) : null}
      </View>
    </Modal>
  )
}

type Reaction = Extract<ReactionPlusTard, { etape: 'reaction' }>
type EnReaction = { e: 'reaction'; raison: StopReason; texte: string; reponseMs?: number; r: Reaction; propose?: Reaction['options'][number] | 'journee' }
type Feuille =
  | { e: 'raison' }
  | { e: 'juge'; raison: StopReason; texte: string; reponseMs: number }
  | EnReaction
  | { e: 'message'; texte: string }

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
  bloc,
  changer,
  onAide,
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
  bloc: { id: string; kind: string; refId: string; label: string; startMinute: number; workMinutes: number }
  changer: (f: Feuille) => void
  onAide: (message: string) => void
  titre: string
  acc: string
  basMarge: number
  fermer: () => void
  raisonChoisie: (raison: StopReason, texte: string | undefined, reponseMs: number, propose?: Reaction['options'][number] | 'journee') => Promise<void>
  commencer: (dix: boolean) => Promise<void>
  choisir: (f: EnReaction, o: Reaction['options'][number]) => Promise<void>
  reporterJournee: (f: EnReaction) => Promise<void>
}) {
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  // Le clavier ouvert : la feuille remonte au-dessus, champ et choix visibles.
  const clavier = useHauteurClavier()
  // Le temps de réponse : une raison tapée en moins d'une seconde ne compte que pour moitié.
  const [ouverteA] = useState(() => Date.now())
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
      {/* Pendant l'examen, on ne ferme pas : on répond. */}
      {/* Clavier ouvert : toucher au-dessus le ferme, et seulement lui — le texte reste. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={feuille.e === 'juge' && clavier === 0} onPress={() => (clavier > 0 ? Keyboard.dismiss() : quitter())} style={{ flex: 1 }} />
      <Pressable accessible={false} onPress={Keyboard.dismiss} style={{ backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 20, paddingBottom: (clavier > 0 ? clavier : basMarge) + 16, gap: 8 }}>
        {feuille.e === 'raison' || feuille.e === 'reaction' ? (
          <Text accessibilityRole="header" style={{ ...titreFeuille, marginBottom: 4 }}>{`Push ${titre} back?`}</Text>
        ) : null}

        {feuille.e === 'raison' ? (
          <>
            <TextInput
              value={texte}
              onChangeText={(v) => setTexte(v.slice(0, 500))}
              placeholder="What happened?"
              placeholderTextColor={A.t4}
              accessibilityLabel="What happened"
              selectionColor={A.t1}
              multiline
              style={{ minHeight: 72, maxHeight: 140, borderRadius: 10, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, color: A.t1, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, opacity: texteSuffisant(texte) ? 1 : 0.35 }}>
              {STOP_REASONS.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  disabled={occupe || !texteSuffisant(texte)}
                  onPress={() => {
                    Keyboard.dismiss()
                    changer({ e: 'juge', raison: r, texte: texte.trim(), reponseMs: Date.now() - ouverteA })
                  }}
                  style={({ pressed }) => ({ ...ligne, width: '48.5%', opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 15 }}>{RAISONS[r].libelle}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {feuille.e === 'juge' ? (
          <Juge
            sorte="later"
            bloc={bloc}
            raison={feuille.raison}
            texte={feuille.texte}
            acc={acc}
            encre={encreSur(acc)}
            onAccepte={(choix) => void agir(() => raisonChoisie(feuille.raison, feuille.texte, feuille.reponseMs, choix))}
            onRefuse={() => void commencer(false)}
            onAide={onAide}
          />
        ) : null}

        {feuille.e === 'reaction' ? (
          <>
            {feuille.r.lignes.map((l) => (
              <Text key={l} accessibilityLiveRegion="polite" style={corps}>{l}</Text>
            ))}
            {/* L'heure que l'IA a proposée et que l'app a validée : en tête, soulignée. */}
            {feuille.propose && feuille.propose !== 'journee' ? (
              <Pressable
                accessibilityRole="button"
                disabled={occupe}
                onPress={() => {
                  const p = feuille.propose
                  if (p && p !== 'journee') void agir(() => choisir(feuille, p))
                }}
                style={({ pressed }) => ({ ...ligne, borderWidth: 1.5, borderColor: acc, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: acc, fontFamily: GEIST.demi, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                  {`${feuille.propose.date === cle ? 'Today' : 'Tomorrow'} ${enHeure(feuille.propose.startMinute)}`}
                </Text>
                <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>{`Tomorrow · ${hm(feuille.propose.demainMinutes)}`}</Text>
              </Pressable>
            ) : null}
            {feuille.propose === 'journee' && feuille.r.journee ? (
              <Pressable
                accessibilityRole="button"
                disabled={occupe}
                onPress={() => void agir(() => reporterJournee(feuille))}
                style={({ pressed }) => ({ ...ligne, borderWidth: 1.5, borderColor: acc, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: acc, fontFamily: GEIST.demi, fontSize: 15 }}>{`All of today · ${hm(feuille.r.journee.aujourdhuiMinutes)}`}</Text>
                <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>{`Tomorrow · ${hm(feuille.r.journee.demainApres)}`}</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => void commencer(feuille.r.dixMinutes)}
              style={({ pressed }) => ({ height: 52, marginTop: 4, borderRadius: 12, backgroundColor: acc, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <Text style={{ color: encreSur(acc), fontFamily: GEIST.demi, fontSize: 17 }}>{feuille.r.dixMinutes ? 'Just 10 minutes' : 'I’m starting'}</Text>
            </Pressable>
            {feuille.r.options
              .filter((o) => !(feuille.propose && feuille.propose !== 'journee' && feuille.propose.date === o.date && feuille.propose.startMinute === o.startMinute))
              .map((o) => (
              <Pressable
                key={`${o.date}-${o.startMinute}`}
                accessibilityRole="button"
                disabled={occupe}
                onPress={() => void agir(() => choisir(feuille, o))}
                style={({ pressed }) => ({ ...ligne, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: A.t1, fontFamily: GEIST.moyen, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                  {`${o.date === cle ? 'Today' : 'Tomorrow'} ${enHeure(o.startMinute)}`}
                </Text>
                <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>{`Tomorrow · ${hm(o.demainMinutes)}`}</Text>
              </Pressable>
            ))}
            {feuille.r.journee && feuille.propose !== 'journee' ? (
              <Pressable
                accessibilityRole="button"
                disabled={occupe}
                onPress={() => void agir(() => reporterJournee(feuille))}
                style={({ pressed }) => ({ ...ligne, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: A.t2, fontFamily: GEIST.moyen, fontSize: 15 }}>{`All of today · ${hm(feuille.r.journee.aujourdhuiMinutes)}`}</Text>
                <Text style={{ color: A.t3, fontFamily: MONO.normal, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                  {`Tomorrow · ${hm(feuille.r.journee.demainAvant)} → `}
                  <Text style={{ color: acc }}>{hm(feuille.r.journee.demainApres)}</Text>
                </Text>
              </Pressable>
            ) : null}
            {!feuille.r.sansTexte && !feuille.r.options.length && !feuille.r.journee ? (
              <Text style={{ color: A.t3, fontFamily: GEIST.normal, fontSize: 15 }}>No free time before the deadline.</Text>
            ) : null}
          </>
        ) : null}

        {feuille.e === 'message' ? <Text accessibilityLiveRegion="polite" style={corps}>{feuille.texte}</Text> : null}

        {feuille.e !== 'juge' ? (
          <Pressable accessibilityRole="button" onPress={quitter} style={({ pressed }) => ({ height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 16 }}>{feuille.e === 'message' ? 'OK' : 'Cancel'}</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  )
}
