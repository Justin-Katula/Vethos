import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import { useReduit } from '@/accueil/briques-introduction'
import { usePlan } from '@/plan/Plan'
import { A, GEIST } from '@/ui/app-briques'
import type { StopReason } from '@shared/schemas'

/**
 * Le juge d'un Stop ou d'un Later, à l'écran (`@shared/coach/arbitre`).
 *
 * L'utilisateur voit l'application, pas une conversation : une question à la
 * fois, en titre, une réponse, « Send ». Trois points pendant l'examen. La
 * première fois seulement, l'accord pour l'IA (règle 5.1.2 d'Apple) ; sans
 * accord, hors ligne ou sans réponse, les règles fixes décident.
 */

type Bloc = { id: string; kind: string; refId: string; label: string; startMinute: number; workMinutes: number }
type Echange = { question: string; sig: string; reponse: string }
type Etat =
  | { e: 'accord' }
  | { e: 'attente' }
  | { e: 'question'; question: string; sig: string }
  | { e: 'refus'; incoherence: { a: string; b: string } | null }

const titre = { color: A.t1, fontFamily: GEIST.demi, fontSize: 20, lineHeight: 27, letterSpacing: -0.3 } as const
const corps = { color: A.t2, fontFamily: GEIST.normal, fontSize: 15, lineHeight: 22 } as const

/** Trois points qui respirent : l'app examine. */
function Points({ couleur }: { couleur: string }) {
  const reduit = useReduit()
  const v = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current
  useEffect(() => {
    if (reduit) return
    const boucle = Animated.loop(
      Animated.stagger(
        160,
        v.map((x) =>
          Animated.sequence([
            Animated.timing(x, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(x, { toValue: 0.3, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        ),
      ),
    )
    boucle.start()
    return () => boucle.stop()
  }, [reduit, v])
  return (
    <View accessibilityLabel="Reviewing" style={{ flexDirection: 'row', gap: 6, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      {v.map((x, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: couleur, opacity: reduit ? 0.6 : x }} />
      ))}
    </View>
  )
}

export function Juge({
  sorte,
  bloc,
  raison,
  texte,
  acc,
  encre,
  onAccepte,
  onRefuse,
  onAide,
}: {
  sorte: 'stop' | 'later'
  bloc: Bloc
  raison: StopReason
  texte: string
  acc: string
  encre: string
  onAccepte: () => void
  onRefuse: () => void
  onAide: (message: string) => void
}) {
  const { justification } = usePlan()
  const [etat, setEtat] = useState<Etat>(justification.consentement === null ? { e: 'accord' } : { e: 'attente' })
  const [reponse, setReponse] = useState('')
  const echanges = useRef<Echange[]>([])
  const depuis = useRef(Date.now())
  const lance = useRef(false)

  const conclure = async (verdict: 'accepte' | 'refuse', incoherence: { a: string; b: string } | null, regles: boolean) => {
    await justification.conclure({
      sorte,
      bloc,
      raison,
      texte,
      reponses: echanges.current.map((x) => x.reponse),
      verdict,
      incoherence: !!incoherence,
      regles,
      depuisMs: depuis.current,
    })
    if (verdict === 'accepte') onAccepte()
    else setEtat({ e: 'refus', incoherence })
  }

  const demander = async () => {
    setEtat({ e: 'attente' })
    const r = await justification.juger({ sorte, bloc, raison, texte, echanges: echanges.current })
    if (r.action === 'question') return setEtat({ e: 'question', question: r.question, sig: r.sig })
    if (r.action === 'decision') return conclure(r.decision, r.incoherence, false)
    if (r.action === 'aide') return onAide(r.message)
    // Indécis : hors ligne, serveur muet, plafond atteint, ou pas d'accord pour l'IA.
    return conclure(justification.regles(texte), null, true)
  }

  useEffect(() => {
    if (etat.e !== 'attente' || lance.current) return
    lance.current = true
    void demander()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat.e])

  const envoyer = () => {
    if (etat.e !== 'question' || reponse.trim().length < 2) return
    Keyboard.dismiss()
    echanges.current = [...echanges.current, { question: etat.question, sig: etat.sig, reponse: reponse.trim().slice(0, 500) }]
    setReponse('')
    void demander()
  }

  if (etat.e === 'accord') {
    return (
      <View style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={titre}>AI review</Text>
        <Text style={corps}>
          Vethos uses AI to review requests to stop or postpone a session. What you write here is sent to our server and processed by
          DeepSeek. You can change this in Profile.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await justification.consentir(true)
            setEtat({ e: 'attente' })
          }}
          style={({ pressed }) => ({ height: 52, borderRadius: 12, backgroundColor: acc, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Text style={{ color: encre, fontFamily: GEIST.demi, fontSize: 17 }}>Allow</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await justification.consentir(false)
            setEtat({ e: 'attente' })
          }}
          style={({ pressed }) => ({ height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 16 }}>Not now</Text>
        </Pressable>
      </View>
    )
  }

  if (etat.e === 'attente') return <Points couleur={acc} />

  if (etat.e === 'question') {
    return (
      <View style={{ gap: 12 }}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={titre}>{etat.question}</Text>
        <TextInput
          value={reponse}
          onChangeText={(v) => setReponse(v.slice(0, 500))}
          autoFocus
          multiline
          placeholderTextColor={A.t4}
          accessibilityLabel="Your answer"
          selectionColor={A.t1}
          style={{ minHeight: 88, maxHeight: 160, borderRadius: 10, backgroundColor: 'rgba(242,242,242,0.07)', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, color: A.t1, fontFamily: GEIST.normal, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={reponse.trim().length < 2}
          onPress={envoyer}
          style={({ pressed }) => ({ height: 52, borderRadius: 12, backgroundColor: acc, alignItems: 'center', justifyContent: 'center', opacity: reponse.trim().length < 2 ? 0.4 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Text style={{ color: encre, fontFamily: GEIST.demi, fontSize: 17 }}>Send</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={titre}>Keep going.</Text>
      {etat.incoherence ? (
        <View style={{ gap: 6 }}>
          <Text style={corps}>{`“${etat.incoherence.a}”`}</Text>
          <Text style={corps}>{`“${etat.incoherence.b}”`}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onRefuse}
        style={({ pressed }) => ({ height: 52, borderRadius: 12, backgroundColor: acc, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
      >
        <Text style={{ color: encre, fontFamily: GEIST.demi, fontSize: 17 }}>{sorte === 'later' ? 'I’m starting' : 'I’ll continue'}</Text>
      </Pressable>
    </View>
  )
}
