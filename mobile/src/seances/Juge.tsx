import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import { useReduit } from '@/accueil/briques-introduction'
import { usePlan, type OptionPlusTardVue } from '@/plan/Plan'
import { A, GEIST } from '@/ui/app-briques'
import type { StopReason } from '@shared/schemas'
import type { ReponseArbitre } from '@shared/coach/client'

/**
 * Le juge d'un Stop ou d'un Later, à l'écran (`@shared/coach/arbitre`).
 *
 * L'utilisateur voit l'application, pas une conversation : une question à la
 * fois, en titre, une réponse, « Send ». Trois points pendant l'examen.
 * L'accord pour l'IA se donne à la toute première excuse, une seule fois (règle
 * 5.1.2 d'Apple) ; sans accord, hors ligne ou sans réponse, les règles fixes décident.
 */

type Bloc = { id: string; kind: string; refId: string; label: string; startMinute: number; workMinutes: number }
export type Echange = { question: string; sig: string; reponse: string }

/**
 * Un autre juge que celui des séances — un retrait d'engagement : il fournit
 * sa propre demande au serveur, sa propre trace et ses règles fixes.
 */
export type MoteurJuge = {
  juger: (echanges: Echange[]) => Promise<ReponseArbitre>
  conclure: (a: { reponses: string[]; verdict: 'accepte' | 'refuse'; regles: boolean }) => Promise<void>
  regles: () => 'accepte' | 'refuse'
}
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
  moteur,
}: {
  sorte: 'stop' | 'later' | 'retrait'
  bloc?: Bloc
  raison?: StopReason
  texte: string
  moteur?: MoteurJuge
  acc: string
  encre: string
  /** Accepté ; pour un Later, l'heure que l'IA a proposée et que l'app a validée. */
  onAccepte: (choix?: OptionPlusTardVue | 'journee') => void
  onRefuse: () => void
  onAide: (message: string) => void
}) {
  const { justification } = usePlan()
  // La toute première excuse : une seule question, puis plus jamais (règle 5.1.2 d'Apple).
  const [etat, setEtat] = useState<Etat>(() => (justification.consentement === null ? { e: 'accord' } : { e: 'attente' }))
  const [reponse, setReponse] = useState('')
  const echanges = useRef<Echange[]>([])
  const depuis = useRef(Date.now())
  const lance = useRef(false)
  // La proposition de l'IA, validée par l'app — et le message de l'app quand
  // elle ne tient pas (envoyé une seule fois, jamais compté comme une réponse).
  const choix = useRef<OptionPlusTardVue | 'journee' | undefined>(undefined)
  const noteApp = useRef<string | null>(null)

  const conclure = async (verdict: 'accepte' | 'refuse', incoherence: { a: string; b: string } | null, regles: boolean) => {
    if (moteur) {
      await moteur.conclure({ reponses: echanges.current.map((x) => x.reponse), verdict, regles })
      if (verdict === 'accepte') onAccepte()
      else setEtat({ e: 'refus', incoherence })
      return
    }
    if (sorte === 'retrait' || !bloc || !raison) return
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
    if (verdict === 'accepte') onAccepte(choix.current)
    else setEtat({ e: 'refus', incoherence })
  }

  const demander = async () => {
    setEtat({ e: 'attente' })
    const r = moteur
      ? await moteur.juger(echanges.current)
      : sorte !== 'retrait' && bloc && raison
        ? await justification.juger({ sorte, bloc, raison, texte, echanges: echanges.current, ...(noteApp.current ? { noteApp: noteApp.current } : {}) })
        : ({ action: 'indecis' } as const)
    if (r.action === 'question') return setEtat({ e: 'question', question: r.question, sig: r.sig })
    // Un Later accepté avec une proposition : l'app vérifie qu'elle tient. Sinon
    // elle le dit à l'IA, une fois, et l'IA décide à nouveau.
    if (r.action === 'decision' && r.decision === 'accepte' && sorte === 'later' && !moteur && bloc && raison && r.proposition) {
      const v = justification.verifier(bloc, raison, r.proposition)
      if (v.ok) choix.current = v.choix
      else if (!noteApp.current) {
        noteApp.current = v.note
        return demander()
      }
    }
    if (r.action === 'decision') return conclure(r.decision, r.incoherence, false)
    if (r.action === 'aide') return onAide(r.message)
    // Indécis : hors ligne, serveur muet, plafond atteint, ou pas d'accord pour l'IA.
    return conclure(moteur ? moteur.regles() : justification.regles(texte), null, true)
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
    const choisir = async (oui: boolean) => {
      await justification.consentir(oui)
      setEtat({ e: 'attente' })
    }
    return (
      <View style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={titre}>Your answer is reviewed by AI.</Text>
        <Text style={corps}>It’s sent to our server and to DeepSeek.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void choisir(true)}
          style={({ pressed }) => ({ height: 52, borderRadius: 12, backgroundColor: acc, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Text style={{ color: encre, fontFamily: GEIST.demi, fontSize: 17 }}>Continue</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void choisir(false)} hitSlop={8} style={({ pressed }) => ({ height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: A.t3, fontFamily: GEIST.moyen, fontSize: 15 }}>Use fixed rules</Text>
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
      <Text accessibilityRole="header" style={titre}>{sorte === 'retrait' ? 'Not this time.' : 'Keep going.'}</Text>
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
        <Text style={{ color: encre, fontFamily: GEIST.demi, fontSize: 17 }}>{sorte === 'retrait' ? 'Keep it' : sorte === 'later' ? 'I’m starting' : 'I’ll continue'}</Text>
      </Pressable>
    </View>
  )
}
